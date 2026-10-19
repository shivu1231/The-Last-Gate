import { create } from 'zustand';
import {
  STATE_PROFILES,
  checkpointFor,
  nextCheckpoint,
  type ExperienceState,
  type TransitionType,
} from './ExperienceStates';
import { SceneScope, type ExperienceScene } from './SceneLifecycle';
import { locks } from './InteractionLock';

// The one place state changes go through. Scenes never reach into each other:
// a scene asks the flow to transition, the flow drives exit/cleanup/enter.
//
//   experience.transitionTo('FRACTURE', 'DEBRIS_OCCLUSION')
//
// The legacy chapter/phase store keeps running its own scenes; the bridge mirrors
// it into this flow with `observe()` so audio, camera and preloading follow along.

/**
 * Stages reported by a transition while it hides and reveals the scene.
 */
export type TransitionBeat =
  | 'anticipation'
  | 'action'
  | 'follow-through'
  | 'settle';

/**
 * Visual transition driver. The covered callback performs scene changes only while the frame is hidden.
 */
export interface TransitionPlayer {
  /**
   * Play a transition and report its lifecycle beats.
   * @param transitionType - Authored cover effect to play.
   * @param hooks - Scene swap and beat callbacks owned by the experience flow.
   */
  play(
    transitionType: TransitionType,
    hooks: {
      covered: () => Promise<void> | void;
      beat: (beat: TransitionBeat) => void;
    },
  ): Promise<void>;
  /**
   * Stop the current visual cover when a transition is cancelled or times out.
   */
  cancel(): void;
}

/**
 * Shared flow state observed by React and runtime subscribers.
 */
type ExperienceFlowSnapshot = {
  state: ExperienceState;
  previous: ExperienceState | null;
  transition: {
    type: TransitionType;
    to: ExperienceState;
    beat: TransitionBeat;
  } | null;

  /** Increments on every restart / checkpoint jump; scenes reset when it changes. */
  run: number;
};

/**
 * Observable master state; scene resources remain owned by ExperienceFlow.
 */
export const useExperienceFlow = create<ExperienceFlowSnapshot>(() => ({
  state: 'BOOT',
  previous: null,
  transition: null,
  run: 0,
}));

/**
 * Receives committed states, including changes mirrored from existing chapter stores.
 */
type ExperienceStateListener = (
  state: ExperienceState,
  previous: ExperienceState | null,
  via: TransitionType | 'OBSERVED',
) => void;
/**
 * Restores a checkpoint through the chapter that owns its runtime state.
 */
type CheckpointEntryHandler = () => void | Promise<void>;

const TRANSITION_TIMEOUT = 12000,
  PREPARE_TIMEOUT = 8000;

/**
 * Coordinates scene preparation, covered transitions and checkpoint recovery.
 * Scenes communicate through this owner so their resource lifetimes do not overlap accidentally.
 */
class ExperienceFlow {
  private scenes = new Map<ExperienceState, ExperienceScene>();
  private scopes = new Map<ExperienceState, SceneScope>();
  private prepared = new Map<ExperienceState, Promise<void>>();
  private checkpoints = new Map<ExperienceState, CheckpointEntryHandler>();
  private listeners = new Set<ExperienceStateListener>();
  private player: TransitionPlayer | null = null;
  /** Active scene clock in seconds; it continues across state transitions. */
  private elapsed = 0;

  /**
   * Return the currently committed narrative state.
   */
  get state() {
    return useExperienceFlow.getState().state;
  }

  /**
   * Report whether a transition is currently represented in the shared flow state.
   */
  get transitioning() {
    return useExperienceFlow.getState().transition !== null;
  }

  /**
   * Install the visual cover driver, or detach it when its canvas unmounts.
   */
  setTransitionPlayer(player: TransitionPlayer | null) {
    this.player = player;
  }

  /**
   * Register a scene and return an unregister callback.
   * The identity check prevents an old callback from removing a newer scene registration.
   */
  register(scene: ExperienceScene) {
    this.scenes.set(scene.id, scene);
    return () => {
      if (this.scenes.get(scene.id) === scene) {
        this.release(scene.id);
        this.scenes.delete(scene.id);
      }
    };
  }

  /**
   * Register a cold-start checkpoint entry handler.
   * @returns A callback that removes only this registration.
   */
  registerCheckpoint(
    state: ExperienceState,
    checkpointHandler: CheckpointEntryHandler,
  ) {
    this.checkpoints.set(state, checkpointHandler);
    return () => {
      if (this.checkpoints.get(state) === checkpointHandler)
        this.checkpoints.delete(state);
    };
  }

  /**
   * Check whether a checkpoint has an entry handler or a registered scene.
   */
  hasCheckpoint(state: ExperienceState) {
    return this.checkpoints.has(state) || this.scenes.has(state);
  }

  /**
   * Subscribe to committed state changes.
   * @returns An unsubscribe callback.
   */
  on(listener: ExperienceStateListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Warm a scene once and share its pending work between callers.
   * Failed preparation is evicted so a later attempt can retry.
   */
  prepare(state: ExperienceState): Promise<void> {
    const scene = this.scenes.get(state);
    if (!scene?.prepare) return Promise.resolve();
    let pending = this.prepared.get(state);
    if (!pending) {
      pending = Promise.resolve()
        .then(() => scene.prepare!(this.scope(state)))
        .catch((error) => {
          this.prepared.delete(state);
          if (import.meta.env.DEV)
            console.warn(`[lattice] prepare ${state} failed`, error);
        });
      this.prepared.set(state, pending);
    }
    return pending;
  }

  /**
   * Prepare and enter a scene under the requested visual cover.
   * @param nextState - Scene to enter.
   * @param transitionType - Cover effect; defaults to the target state profile.
   * @param transitionOptions - Allows re-entry when the target is already current.
   * @returns False when re-entry is unnecessary or another transition owns the lock.
   */
  async transitionTo(
    nextState: ExperienceState,
    transitionType: TransitionType = STATE_PROFILES[nextState].enterWith,
    transitionOptions: { force?: boolean } = {},
  ): Promise<boolean> {
    const previousState = this.state;
    if (!transitionOptions.force && nextState === previousState) return false;
    const releaseTransitionLock = locks.acquire(
      'experience-transition',
      TRANSITION_TIMEOUT,
    );
    if (!releaseTransitionLock) return false;
    const transitionTimeoutId = setTimeout(() => {
      this.player?.cancel();
      this.finish(releaseTransitionLock);
    }, TRANSITION_TIMEOUT);
    try {
      await withTimeout(this.prepare(nextState), PREPARE_TIMEOUT);
      const swapScenes = async () => {
        await this.scenes
          .get(previousState)
          ?.exit?.(this.scope(previousState), nextState);
        this.release(previousState);
        this.commit(nextState, previousState, transitionType);
        this.scenes
          .get(nextState)
          ?.enter?.(this.scope(nextState), previousState);
      };
      const setTransitionBeat = (beat: TransitionBeat) =>
        useExperienceFlow.setState({
          transition: { type: transitionType, to: nextState, beat },
        });
      setTransitionBeat('anticipation');
      if (this.player && transitionType !== 'CUT')
        await this.player.play(transitionType, {
          covered: swapScenes,
          beat: setTransitionBeat,
        });
      else await swapScenes();
      return true;
    } catch (error) {
      // Never strand the experience between scenes: land on the target regardless.
      if (import.meta.env.DEV)
        console.warn(
          `[lattice] transition ${previousState} → ${nextState} failed`,
          error,
        );
      if (this.state !== nextState)
        this.commit(nextState, previousState, transitionType);
      return true;
    } finally {
      clearTimeout(transitionTimeoutId);
      this.finish(releaseTransitionLock);
    }
  }

  /**
   * Mirror a chapter-driven state change without invoking scene enter or exit hooks.
   */
  observe(state: ExperienceState) {
    const previousState = this.state;
    if (state === previousState) return;
    if (this.scenes.has(previousState)) this.release(previousState);
    useExperienceFlow.setState({ state, previous: previousState });
    this.emit(state, previousState, 'OBSERVED');
  }

  /**
   * Advance the active scene clock.
   * @param deltaSeconds - Frame interval in seconds.
   */
  update(deltaSeconds: number) {
    this.elapsed += deltaSeconds;
    this.scenes.get(this.state)?.update?.(deltaSeconds, this.elapsed);
  }

  // ---- Recovery / checkpoints (never exposed as visible navigation) ----
  /**
   * Cover an in-place change such as a restart without replacing the scene lifecycle.
   * @param transitionType - Visual effect that hides the change.
   * @param change - Work performed while the frame is covered.
   * @returns False when another transition already owns the lock.
   */
  async cover(
    transitionType: TransitionType,
    change: () => void | Promise<void>,
  ): Promise<boolean> {
    const releaseTransitionLock = locks.acquire(
      'experience-transition',
      TRANSITION_TIMEOUT,
    );
    if (!releaseTransitionLock) return false;
    const transitionTimeoutId = setTimeout(() => {
      this.player?.cancel();
      this.finish(releaseTransitionLock);
    }, TRANSITION_TIMEOUT);
    const setTransitionBeat = (beat: TransitionBeat) =>
      useExperienceFlow.setState({
        transition: { type: transitionType, to: this.state, beat },
      });
    try {
      setTransitionBeat('anticipation');
      if (this.player && transitionType !== 'CUT')
        await this.player.play(transitionType, {
          covered: change,
          beat: setTransitionBeat,
        });
      else await change();
      return true;
    } catch (error) {
      if (import.meta.env.DEV)
        console.warn('[lattice] covered change failed', error);
      return true;
    } finally {
      clearTimeout(transitionTimeoutId);
      this.finish(releaseTransitionLock);
    }
  }

  /**
   * Restart at an available checkpoint while the frame is covered.
   * Existing scopes are released before the checkpoint handler resets its chapter.
   */
  async jumpTo(
    checkpoint: ExperienceState,
    transitionType: TransitionType = 'BLINK',
  ) {
    const checkpointHandler = this.checkpoints.get(checkpoint),
      hasRegisteredScene = this.scenes.has(checkpoint);
    if (!checkpointHandler && !hasRegisteredScene) {
      if (import.meta.env.DEV)
        console.info(
          `[lattice] checkpoint ${checkpoint} is not available in this build yet`,
        );
      return false;
    }
    if (this.transitioning) return false;
    return this.cover(transitionType, async () => {
      locks.reset();
      for (const state of [...this.scopes.keys()]) this.release(state);
      this.prepared.clear();
      useExperienceFlow.setState((snapshot) => ({ run: snapshot.run + 1 }));
      if (checkpointHandler) await checkpointHandler();
      if (hasRegisteredScene && this.state !== checkpoint) {
        await this.prepare(checkpoint);
        const previousState = this.state;
        this.commit(checkpoint, previousState, 'CUT');
        this.scenes
          .get(checkpoint)
          ?.enter?.(this.scope(checkpoint), previousState);
      }
    });
  }

  /**
   * Restart from the most recent checkpoint for the current state.
   */
  restartCheckpoint() {
    return this.jumpTo(checkpointFor(this.state));
  }

  /**
   * Restart from the opening awakening checkpoint.
   */
  restartExperience() {
    return this.jumpTo('AWAKE');
  }

  /**
   * Find the next checkpoint supported by the registered chapters and enter it.
   */
  async nextCheckpoint() {
    let candidate = nextCheckpoint(this.state);
    while (candidate && !this.hasCheckpoint(candidate))
      candidate = nextCheckpoint(candidate);
    return candidate ? this.jumpTo(candidate) : false;
  }

  // ---- internals ----
  /**
   * Reuse a live resource scope or create one when the scene has not entered yet.
   */
  private scope(state: ExperienceState) {
    let scope = this.scopes.get(state);
    if (!scope || !scope.alive) {
      scope = new SceneScope(state);
      this.scopes.set(state, scope);
    }
    return scope;
  }

  /**
   * Run scene-specific cleanup before releasing its scope and preparation cache.
   */
  private release(state: ExperienceState) {
    const scope = this.scopes.get(state);
    if (scope) {
      try {
        this.scenes.get(state)?.cleanup?.(scope);
      } finally {
        scope.release();
      }
    }
    this.scopes.delete(state);
    this.prepared.delete(state);
  }

  /**
   * Publish a committed state before notifying its subscribers.
   */
  private commit(
    state: ExperienceState,
    previous: ExperienceState,
    via: TransitionType,
  ) {
    useExperienceFlow.setState({ state, previous });
    this.emit(state, previous, via);
  }

  /**
   * Clear transition state and release its interaction guard.
   */
  private finish(releaseTransitionLock: () => void) {
    useExperienceFlow.setState({ transition: null });
    releaseTransitionLock();
  }

  /**
   * Notify subscribers independently so one failing listener cannot block the others.
   */
  private emit(
    state: ExperienceState,
    previous: ExperienceState | null,
    via: TransitionType | 'OBSERVED',
  ) {
    for (const listener of this.listeners) {
      try {
        listener(state, previous, via);
      } catch (error) {
        if (import.meta.env.DEV)
          console.warn('[lattice] state listener failed', error);
      }
    }
  }
}

/**
 * Stop waiting when preparation settles or its timeout expires.
 * This does not cancel the underlying preparation or its timer.
 * @param promise - Preparation work already in progress.
 * @param timeoutMilliseconds - Maximum time to wait before continuing.
 */
function withTimeout<Result>(
  promise: Promise<Result>,
  timeoutMilliseconds: number,
) {
  return Promise.race([
    promise,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMilliseconds)),
  ]);
}

/**
 * Shared lifecycle coordinator used by chapter registrations and the runtime bridge.
 */
export const experience = new ExperienceFlow();
