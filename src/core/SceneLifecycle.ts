import type { Object3D } from 'three';
import type { ExperienceState } from './ExperienceStates';
import { disposeObject } from '../performance/Disposal';

/**
 * Scene lifecycle contract: prepare, enter, update, exit, then cleanup.
 * Register temporary resources with the supplied scope so they leave with the scene.
 */
export interface ExperienceScene {
  readonly id: ExperienceState;
  /** Load / build. May run early (during the previous scene) to hide loading. */
  prepare?(scope: SceneScope): Promise<void> | void;
  /** Becomes visible. Called once the incoming transition has covered the frame. */
  enter?(scope: SceneScope, previousState: ExperienceState | null): void;
  /** Per-frame, only while active. Prefer timelines/shader time over work here. */
  update?(deltaSeconds: number, elapsedSeconds: number): void;
  /** Leaving. Stop input, fade audio; still visible under the outgoing transition. */
  exit?(scope: SceneScope, nextState: ExperienceState): Promise<void> | void;
  /** Invisible. Free everything temporary. */
  cleanup?(scope: SceneScope): void;
}

/**
 * Resource that can stop an animation or timeline.
 */
type Killable = { kill(): unknown };

/**
 * Resource that can stop audio or another ongoing activity.
 */
type Stoppable = { stop(): unknown };

/**
 * Resource with explicit disposal, such as a GPU allocation.
 */
type Disposable = { dispose(): unknown };

/**
 * Owns scene resources and releases them in reverse registration order.
 */
export class SceneScope {
  private disposers: Array<() => void> = [];
  private released = false;

  /**
   * Create a resource owner for the named scene or subsystem.
   */
  constructor(readonly owner: string) {}

  /**
   * Report whether this owner can still retain resources.
   */
  get alive() {
    return !this.released;
  }

  /**
   * Register a teardown callback. Late registrations run immediately after release.
   * @returns The supplied callback so callers can retain their own cleanup handle.
   */
  add(dispose: () => void) {
    if (this.released) {
      runCleanupSafely(dispose);
      return dispose;
    }
    this.disposers.push(dispose);
    return dispose;
  }

  /**
   * Attach an event listener and remove it when the scope is released.
   */
  listen<EventName extends keyof WindowEventMap>(
    target: Window,
    eventType: EventName,
    callback: (event: WindowEventMap[EventName]) => void,
    options?: AddEventListenerOptions,
  ): void;
  /**
   * Attach an event listener and remove it when the scope is released.
   */
  listen(
    target: EventTarget,
    eventType: string,
    callback: EventListener,
    options?: AddEventListenerOptions,
  ): void;
  /**
   * Attach an event listener and remove it when the scope is released.
   */
  listen(
    target: EventTarget,
    eventType: string,
    callback: EventListener,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(eventType, callback, options);
    this.add(() => target.removeEventListener(eventType, callback, options));
  }

  /**
   * Schedule a one-shot callback that cannot run after this scope is released.
   * @param delayMs - Delay in milliseconds.
   * @returns The timer handle registered for cleanup.
   */
  timeout(callback: () => void, delayMs: number) {
    const timeoutId = setTimeout(() => {
      if (!this.released) callback();
    }, delayMs);
    this.add(() => clearTimeout(timeoutId));
    return timeoutId;
  }

  /**
   * Schedule a repeating callback and clear its timer when the scope is released.
   * @param delayMs - Interval in milliseconds.
   * @returns The timer handle registered for cleanup.
   */
  interval(callback: () => void, delayMs: number) {
    const intervalId = setInterval(callback, delayMs);
    this.add(() => clearInterval(intervalId));
    return intervalId;
  }

  /**
   * Run a callback on animation frames until this scope is released.
   * @param callback - Receives the browser frame timestamp in milliseconds.
   */
  raf(callback: (timestamp: number) => void) {
    let animationFrameId = 0;
    const runFrame = (timestamp: number) => {
      if (this.released) return;
      callback(timestamp);
      animationFrameId = requestAnimationFrame(runFrame);
    };
    animationFrameId = requestAnimationFrame(runFrame);
    this.add(() => cancelAnimationFrame(animationFrameId));
  }

  /**
   * Own an animation or timeline whose kill method stops its work.
   */
  timeline<Resource extends Killable>(timeline: Resource): Resource {
    this.add(() => timeline.kill());
    return timeline;
  }

  /**
   * Own an audio handle whose stop method ends playback.
   */
  sound<Resource extends Stoppable>(handle: Resource): Resource {
    this.add(() => handle.stop());
    return handle;
  }

  /**
   * Own a disposable resource and return it unchanged.
   */
  own<Resource extends Disposable>(resource: Resource): Resource {
    this.add(() => resource.dispose());
    return resource;
  }

  /**
   * Remove and dispose a temporary scene object when the scope is released.
   * Shared GPU resources follow the disposal helper's existing ownership policy.
   */
  object<Resource extends Object3D>(object: Resource): Resource {
    this.add(() => {
      object.removeFromParent();
      disposeObject(object);
    });
    return object;
  }

  /**
   * Retain an unsubscribe callback for release alongside the scene.
   */
  subscription(unsubscribe: () => void) {
    this.add(unsubscribe);
  }

  /**
   * Release resources once, in reverse order, isolating cleanup failures.
   */
  release() {
    if (this.released) return;
    // Mark the scope first so teardown cannot register another retained resource.
    this.released = true;
    const disposers = this.disposers.splice(0).reverse();
    for (const dispose of disposers) runCleanupSafely(dispose);
  }
}

/**
 * Run one teardown without preventing the remaining resource cleanup on failure.
 */
function runCleanupSafely(callback: () => void) {
  try {
    callback();
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[lattice] cleanup failed', error);
  }
}
