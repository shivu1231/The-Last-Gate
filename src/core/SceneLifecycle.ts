import type { Object3D } from 'three';
import type { ExperienceState } from './ExperienceStates';
import { disposeObject } from '../performance/Disposal';

// Scene contract: prepare → enter → (active: update) → exit → cleanup.
// A scene owns a SceneScope; anything it registers there is released on cleanup,
// so listeners, loops, timelines, timers, audio and temporary GPU objects cannot leak.
export interface ExperienceScene {
  readonly id: ExperienceState;
  /** Load / build. May run early (during the previous scene) to hide loading. */
  prepare?(scope: SceneScope): Promise<void> | void;
  /** Becomes visible. Called once the incoming transition has covered the frame. */
  enter?(scope: SceneScope, from: ExperienceState | null): void;
  /** Per-frame, only while active. Prefer timelines/shader time over work here. */
  update?(dt: number, elapsed: number): void;
  /** Leaving. Stop input, fade audio; still visible under the outgoing transition. */
  exit?(scope: SceneScope, to: ExperienceState): Promise<void> | void;
  /** Invisible. Free everything temporary. */
  cleanup?(scope: SceneScope): void;
}

type Killable = { kill(): unknown };
type Stoppable = { stop(): unknown };
type Disposable = { dispose(): unknown };

export class SceneScope {
  private disposers: Array<() => void> = [];
  private released = false;
  constructor(readonly owner: string) {}

  get alive() { return !this.released; }

  /** Register any teardown. Runs in reverse order (LIFO), errors are isolated. */
  add(dispose: () => void) {
    if (this.released) { safely(dispose); return dispose; }
    this.disposers.push(dispose);
    return dispose;
  }
  listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, options?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, fn, options);
    this.add(() => target.removeEventListener(type, fn, options));
  }
  timeout(fn: () => void, ms: number) {
    const id = setTimeout(() => { if (!this.released) fn(); }, ms);
    this.add(() => clearTimeout(id));
    return id;
  }
  interval(fn: () => void, ms: number) {
    const id = setInterval(fn, ms);
    this.add(() => clearInterval(id));
    return id;
  }
  raf(fn: (t: number) => void) {
    let id = 0;
    const loop = (t: number) => { if (this.released) return; fn(t); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    this.add(() => cancelAnimationFrame(id));
  }
  /** GSAP timelines/tweens, or anything with kill(). */
  timeline<T extends Killable>(timeline: T): T { this.add(() => timeline.kill()); return timeline; }
  /** Audio handles from AudioMix (loops/one-shots), or any stop()-able. */
  sound<T extends Stoppable>(handle: T): T { this.add(() => handle.stop()); return handle; }
  /** Materials, geometries, textures, render targets, post passes. */
  own<T extends Disposable>(resource: T): T { this.add(() => resource.dispose()); return resource; }
  /** Temporary scene-graph objects: removed and deep-disposed (shared resources are skipped). */
  object<T extends Object3D>(object: T): T { this.add(() => { object.removeFromParent(); disposeObject(object); }); return object; }
  /** Subscriptions returning an unsubscribe function (zustand, event buses). */
  subscription(unsubscribe: () => void) { this.add(unsubscribe); }

  release() {
    if (this.released) return;
    this.released = true;
    const disposers = this.disposers.splice(0).reverse();
    for (const dispose of disposers) safely(dispose);
  }
}

function safely(fn: () => void) {
  try { fn(); } catch (error) { if (import.meta.env.DEV) console.warn('[lattice] cleanup failed', error); }
}
