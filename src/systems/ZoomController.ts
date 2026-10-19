import { MathUtils } from 'three';

/**
 * Data contract used by shared runtime services.
 */
export type ZoomLimits = { min: number; max: number; step?: number };

/** Shared, damped zoom input for every 3D scene. */
export class ZoomController {
  private target = 0;
  private value = 0;
  private enabled = false;
  private scripted = false;
  private limits: ZoomLimits;
  private cleanup: (() => void) | null = null;

  constructor(
    limits: ZoomLimits = { min: -1, max: 1, step: 0.0022 },
    initial = 0,
  ) {
    this.limits = limits;
    this.target = initial;
    this.value = initial;
  }

  setLimits(limits: ZoomLimits) {
    this.limits = limits;
    this.target = MathUtils.clamp(this.target, limits.min, limits.max);
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.target = 0;
  }
  setScripted(scripted: boolean) {
    this.scripted = scripted;
  }
  add(amount: number) {
    if (!this.enabled || this.scripted) return;
    this.target = MathUtils.clamp(
      this.target + amount,
      this.limits.min,
      this.limits.max,
    );
  }
  reset() {
    this.target = 0;
    this.value = 0;
  }
  update(deltaSeconds: number, damping = 8) {
    this.value = MathUtils.damp(
      this.value,
      this.target,
      damping,
      Math.min(deltaSeconds, 0.1),
    );
    return this.value;
  }
  get current() {
    return this.value;
  }

  bind(element: HTMLElement | Window, isEnabled: () => boolean = () => true) {
    this.cleanup?.();
    const wheel = (event: Event) => {
      if (
        !(event instanceof WheelEvent) ||
        !this.enabled ||
        this.scripted ||
        !isEnabled()
      )
        return;
      event.preventDefault();
      const amount =
        -Math.sign(event.deltaY) *
        Math.min(0.35, Math.abs(event.deltaY) * (this.limits.step ?? 0.0022));
      this.add(amount);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    this.cleanup = () => element.removeEventListener('wheel', wheel);
    return () => {
      this.cleanup?.();
      this.cleanup = null;
    };
  }

  dispose() {
    this.cleanup?.();
    this.cleanup = null;
  }
}
