import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useQuality } from './Quality';

// Phases 4–6 render in their own canvases. This keeps their frame rate up by trading resolution,
// not effects: the render scale steps down when frames run long and creeps back up when there is
// headroom. It starts at the top of the quality tier's range, waits out the first seconds (shader
// compilation hitches are not load), never steps up soon after a step down (no flicker between
// sizes), and caps the pixel count so a 4K screen doesn't render 1.5× of 4K.
// The Canvas owns the applied DPR prop. Report infrequent changes through onChange; writing
// Fiber's store separately fights Canvas.configure on every UI render and clears the framebuffer.

const WINDOW = 2; // seconds per sample
const SLOW = 1 / 50; // average frame worse than 50 fps steps down
const FAST = 1 / 58; // three windows better than 58 fps may step up
const CRAWL = 1 / 30; // the frame-rate floor for phases 4–6
const FLOOR = 0.75;
const PIXEL_BUDGET = 1920 * 1080 * 1.5 * 1.5;

/**
 * Resolve render-scale limits from the quality tier, device ratio and pixel budget.
 */
function range() {
  const preset = useQuality.getState().preset;
  const device = Math.max(window.devicePixelRatio || 1, 1.25);
  const byBudget = Math.sqrt(
    PIXEL_BUDGET / Math.max(1, window.innerWidth * window.innerHeight),
  );
  const hi = Math.max(FLOOR, Math.min(preset.dprCap, device, byBudget));
  return { lo: Math.min(preset.dprMin, hi), hi };
}

/**
 * Adjust the canvas render scale from sustained frame timing.
 */
export function AdaptiveDpr({
  onChange: setDpr,
}: {
  onChange: (dpr: number) => void;
}) {
  const frameSamples = useRef({
    dpr: 1,
    t: 0,
    n: 0,
    grace: 3,
    fast: 0,
    cool: 0,
  });

  useEffect(() => {
    const apply = () => {
      const { lo, hi } = range();
      frameSamples.current.dpr = Math.min(
        hi,
        Math.max(Math.min(lo, FLOOR), frameSamples.current.dpr),
      );
      setDpr(frameSamples.current.dpr);
    };
    frameSamples.current.dpr = range().hi;
    setDpr(frameSamples.current.dpr);
    window.addEventListener('resize', apply);
    const off = useQuality.subscribe((state, state2) => {
      if (state.name === state2.name) return;
      frameSamples.current.dpr = range().hi;
      frameSamples.current.grace = 3;
      setDpr(frameSamples.current.dpr);
    });
    return () => {
      window.removeEventListener('resize', apply);
      off();
    };
  }, [setDpr]);

  useFrame((_, deltaSeconds) => {
    const scaleFactor = frameSamples.current;
    if (
      document.visibilityState !== 'visible' ||
      deltaSeconds <= 0.001 ||
      deltaSeconds > 0.5
    )
      return;
    if (scaleFactor.grace > 0) {
      scaleFactor.grace -= deltaSeconds;
      return;
    }
    scaleFactor.cool = Math.max(0, scaleFactor.cool - deltaSeconds);
    scaleFactor.t += deltaSeconds;
    scaleFactor.n++;
    if (scaleFactor.t < WINDOW) return;
    const avg = scaleFactor.t / scaleFactor.n;
    scaleFactor.t = 0;
    scaleFactor.n = 0;
    const { lo, hi } = range();
    let next = scaleFactor.dpr;
    // Under 50 fps steps down to the tier's floor; still under 30 fps there, it goes below 1:
    // a slightly soft image beats a stutter.
    if (avg > SLOW) {
      next = downshiftDpr(scaleFactor.dpr, avg, lo);
      scaleFactor.fast = 0;
      scaleFactor.cool = 8;
    } else if (avg < FAST) {
      if (++scaleFactor.fast >= 3 && scaleFactor.cool === 0) {
        next = Math.min(hi, scaleFactor.dpr + 0.1);
        scaleFactor.fast = 0;
      }
    } else scaleFactor.fast = 0;
    if (Math.abs(next - scaleFactor.dpr) > 0.001) {
      scaleFactor.dpr = next;
      setDpr(next);
    }
  });
  return null;
}

/** A slow sample can hold or lower resolution, never raise it back to the tier floor. */
export function downshiftDpr(
  current: number,
  average: number,
  tierFloor: number,
) {
  return Math.max(
    Math.min(current, average > CRAWL ? FLOOR : tierFloor),
    current - 0.15,
  );
}
