import { QUALITY_ORDER, useQuality } from './Quality';

// Watches real frame time and steps quality down (HIGH → BALANCED → LOW) when the machine
// cannot hold the target. One-way during a run (no oscillating quality mid-scene), ignores
// hidden tabs, transitions and the first seconds after a chapter change (shader compilation
// hitches are expected there, not sustained load). The window is measured in seconds, not
// frames, so a slow machine is corrected in ~2.5 s instead of after 240 slow frames.

const WINDOW_SECONDS = 2.5;
const BUDGET = 1 / 44;          // sustained average worse than ~44fps steps down a tier
const GRACE_AFTER_CHANGE = 3;   // seconds

class FrameGovernor {
  private elapsed = 0;
  private frames = 0;
  private grace = GRACE_AFTER_CHANGE;
  /** Smoothed frame time (s) for diagnostics. */
  frameTime = 1 / 60;
  enabled = new URLSearchParams(location.search).get('quality') === null && !import.meta.env.VITE_QUALITY;

  /** A chapter change or transition: restart the sampling window. */
  settle(seconds = GRACE_AFTER_CHANGE) { this.grace = Math.max(this.grace, seconds); this.elapsed = 0; this.frames = 0; }

  sample(dt: number, busy: boolean) {
    this.frameTime += (dt - this.frameTime) * .05;
    if (!this.enabled || busy || document.visibilityState !== 'visible' || dt <= .001 || dt > .5) return;
    if (this.grace > 0) { this.grace -= dt; return; }
    this.elapsed += dt; this.frames++;
    if (this.elapsed < WINDOW_SECONDS) return;
    const average = this.elapsed / this.frames;
    this.elapsed = 0; this.frames = 0;
    const quality = useQuality.getState(), next = QUALITY_ORDER[QUALITY_ORDER.indexOf(quality.name) + 1];
    if (average > BUDGET && next) {
      quality.set(next, true);
      if (import.meta.env.DEV) console.info(`[lattice] sustained ${(1000 * average).toFixed(1)}ms frames → ${next}`);
      this.settle(4);
    }
  }
}

export const frameGovernor = new FrameGovernor();
