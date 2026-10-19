import { create } from 'zustand';
import {
  STATE_PROFILES, checkpointFor, nextCheckpoint, type ExperienceState, type TransitionType,
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

export type TransitionBeat = 'anticipation' | 'action' | 'follow-through' | 'settle';

/** Implemented by CinematicTransitions. `covered` fires when the frame is hidden. */
export interface TransitionPlayer {
  play(type: TransitionType, hooks: { covered: () => Promise<void> | void; beat: (beat: TransitionBeat) => void }): Promise<void>;
  cancel(): void;
}

type FlowSnapshot = {
  state: ExperienceState;
  previous: ExperienceState | null;
  transition: { type: TransitionType; to: ExperienceState; beat: TransitionBeat } | null;
  /** Increments on every restart / checkpoint jump; scenes reset when it changes. */
  run: number;
};
export const useExperienceFlow = create<FlowSnapshot>(() => ({ state: 'BOOT', previous: null, transition: null, run: 0 }));

type Listener = (state: ExperienceState, previous: ExperienceState | null, via: TransitionType | 'OBSERVED') => void;
type CheckpointHandler = () => void | Promise<void>;

const TRANSITION_TIMEOUT = 12000, PREPARE_TIMEOUT = 8000;

class ExperienceFlow {
  private scenes = new Map<ExperienceState, ExperienceScene>();
  private scopes = new Map<ExperienceState, SceneScope>();
  private prepared = new Map<ExperienceState, Promise<void>>();
  private checkpoints = new Map<ExperienceState, CheckpointHandler>();
  private listeners = new Set<Listener>();
  private player: TransitionPlayer | null = null;
  private elapsed = 0;

  get state() { return useExperienceFlow.getState().state; }
  get transitioning() { return useExperienceFlow.getState().transition !== null; }

  setTransitionPlayer(player: TransitionPlayer | null) { this.player = player; }

  /** Phase branches register their scenes; returns an unregister function. */
  register(scene: ExperienceScene) {
    this.scenes.set(scene.id, scene);
    return () => { if (this.scenes.get(scene.id) === scene) { this.release(scene.id); this.scenes.delete(scene.id); } };
  }
  /** How to (re)enter a checkpoint from a cold start. Phase branches provide these. */
  registerCheckpoint(state: ExperienceState, handler: CheckpointHandler) {
    this.checkpoints.set(state, handler);
    return () => { if (this.checkpoints.get(state) === handler) this.checkpoints.delete(state); };
  }
  hasCheckpoint(state: ExperienceState) { return this.checkpoints.has(state) || this.scenes.has(state); }

  on(listener: Listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  /** Warm a scene ahead of time (called automatically from STATE_PROFILES.preload). */
  prepare(state: ExperienceState): Promise<void> {
    const scene = this.scenes.get(state);
    if (!scene?.prepare) return Promise.resolve();
    let pending = this.prepared.get(state);
    if (!pending) {
      pending = Promise.resolve().then(() => scene.prepare!(this.scope(state))).catch(error => {
        this.prepared.delete(state);
        if (import.meta.env.DEV) console.warn(`[lattice] prepare ${state} failed`, error);
      });
      this.prepared.set(state, pending);
    }
    return pending;
  }

  /**
   * Explicit transition. Returns false (and does nothing) if a transition is already
   * running or we are already in `next` — so double triggers are harmless.
   */
  async transitionTo(next: ExperienceState, type: TransitionType = STATE_PROFILES[next].enterWith, options: { force?: boolean } = {}): Promise<boolean> {
    const from = this.state;
    if (!options.force && next === from) return false;
    const release = locks.acquire('experience-transition', TRANSITION_TIMEOUT);
    if (!release) return false;
    const watchdog = setTimeout(() => { this.player?.cancel(); this.finish(release); }, TRANSITION_TIMEOUT);
    try {
      await withTimeout(this.prepare(next), PREPARE_TIMEOUT);
      const swap = async () => {
        await this.scenes.get(from)?.exit?.(this.scope(from), next);
        this.release(from);
        this.commit(next, from, type);
        this.scenes.get(next)?.enter?.(this.scope(next), from);
      };
      const setBeat = (beat: TransitionBeat) => useExperienceFlow.setState({ transition: { type, to: next, beat } });
      setBeat('anticipation');
      if (this.player && type !== 'CUT') await this.player.play(type, { covered: swap, beat: setBeat });
      else await swap();
      return true;
    } catch (error) {
      // Never strand the experience between scenes: land on the target regardless.
      if (import.meta.env.DEV) console.warn(`[lattice] transition ${from} → ${next} failed`, error);
      if (this.state !== next) this.commit(next, from, type);
      return true;
    } finally {
      clearTimeout(watchdog);
      this.finish(release);
    }
  }

  /** Mirror a state change that happened in a legacy scene (no lifecycle calls). */
  observe(state: ExperienceState) {
    const from = this.state;
    if (state === from) return;
    if (this.scenes.has(from)) this.release(from);
    useExperienceFlow.setState({ state, previous: from });
    this.emit(state, from, 'OBSERVED');
  }

  update(dt: number) {
    this.elapsed += dt;
    this.scenes.get(this.state)?.update?.(dt, this.elapsed);
  }

  // ---- Recovery / checkpoints (never exposed as visible navigation) ----
  /**
   * Play a transition purely as a physical cover for an in-place change (restart, checkpoint
   * jump, chapter reset). `change` runs while the frame is hidden. Lock-guarded: returns false
   * if another transition or cover is already running.
   */
  async cover(type: TransitionType, change: () => void | Promise<void>): Promise<boolean> {
    const release = locks.acquire('experience-transition', TRANSITION_TIMEOUT);
    if (!release) return false;
    const watchdog = setTimeout(() => { this.player?.cancel(); this.finish(release); }, TRANSITION_TIMEOUT);
    const setBeat = (beat: TransitionBeat) => useExperienceFlow.setState({ transition: { type, to: this.state, beat } });
    try {
      setBeat('anticipation');
      if (this.player && type !== 'CUT') await this.player.play(type, { covered: change, beat: setBeat });
      else await change();
      return true;
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[lattice] covered change failed', error);
      return true;
    } finally { clearTimeout(watchdog); this.finish(release); }
  }

  async jumpTo(checkpoint: ExperienceState, type: TransitionType = 'BLINK') {
    const handler = this.checkpoints.get(checkpoint), scene = this.scenes.has(checkpoint);
    if (!handler && !scene) {
      if (import.meta.env.DEV) console.info(`[lattice] checkpoint ${checkpoint} is not available in this build yet`);
      return false;
    }
    if (this.transitioning) return false;
    return this.cover(type, async () => {
      locks.reset();
      for (const state of [...this.scopes.keys()]) this.release(state);
      this.prepared.clear();
      useExperienceFlow.setState(s => ({ run: s.run + 1 }));
      if (handler) await handler();
      if (scene && this.state !== checkpoint) {
        await this.prepare(checkpoint);
        const from = this.state;
        this.commit(checkpoint, from, 'CUT');
        this.scenes.get(checkpoint)?.enter?.(this.scope(checkpoint), from);
      }
    });
  }
  restartCheckpoint() { return this.jumpTo(checkpointFor(this.state)); }
  restartExperience() { return this.jumpTo('AWAKE'); }
  async nextCheckpoint() {
    let candidate = nextCheckpoint(this.state);
    while (candidate && !this.hasCheckpoint(candidate)) candidate = nextCheckpoint(candidate);
    return candidate ? this.jumpTo(candidate) : false;
  }

  // ---- internals ----
  private scope(state: ExperienceState) {
    let scope = this.scopes.get(state);
    if (!scope || !scope.alive) { scope = new SceneScope(state); this.scopes.set(state, scope); }
    return scope;
  }
  private release(state: ExperienceState) {
    const scope = this.scopes.get(state);
    if (scope) { try { this.scenes.get(state)?.cleanup?.(scope); } finally { scope.release(); } }
    this.scopes.delete(state);
    this.prepared.delete(state);
  }
  private commit(state: ExperienceState, previous: ExperienceState, via: TransitionType) {
    useExperienceFlow.setState({ state, previous });
    this.emit(state, previous, via);
  }
  private finish(release: () => void) {
    useExperienceFlow.setState({ transition: null });
    release();
  }
  private emit(state: ExperienceState, previous: ExperienceState | null, via: TransitionType | 'OBSERVED') {
    for (const listener of this.listeners) {
      try { listener(state, previous, via); } catch (error) { if (import.meta.env.DEV) console.warn('[lattice] state listener failed', error); }
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([promise, new Promise<void>(resolve => setTimeout(resolve, ms))]);
}

export const experience = new ExperienceFlow();
