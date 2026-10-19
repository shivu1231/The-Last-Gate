/**
 * Data contract used by shared runtime services.
 */
export type Quality = 'HIGH' | 'MEDIUM' | 'LOW';
/**
 * Owns shared runtime services state and its existing runtime lifecycle.
 */
export class RenderQuality {
  level: Quality;
  private elapsed = 0;
  private frames = 0;
  constructor(compact: boolean) {
    this.level = compact ? 'MEDIUM' : 'HIGH';
  }
  sample(delta: number, visible: boolean) {
    if (!visible || delta > 0.5 || delta <= 0) {
      this.elapsed = 0;
      this.frames = 0;
      return false;
    }
    this.elapsed += delta;
    this.frames++;
    if (this.elapsed < 0.8 || this.frames < 8) return false;
    const average = this.elapsed / this.frames;
    this.elapsed = 0;
    this.frames = 0;
    const next =
      this.level === 'HIGH' && average > 0.029
        ? 'MEDIUM'
        : this.level === 'MEDIUM' && average > 0.045
          ? 'LOW'
          : this.level;
    const changed = next !== this.level;
    this.level = next;
    return changed;
  }
  pixelRatio(compact: boolean) {
    return this.level === 'LOW'
      ? 0.75
      : this.level === 'MEDIUM' || compact
        ? 1
        : 1.25;
  }
}
