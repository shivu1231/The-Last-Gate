// One shared ticker for non-critical per-frame work, driven by a single useFrame.
// Instead of dozens of independent useFrame / requestAnimationFrame callbacks, systems
// subscribe here at the rate they actually need:
//
//   frames.add('dust-sway', dt => …, 30)   // 30Hz is plenty for ambient motion
//   frames.add('ui-anchor', dt => …)       // every frame
//
// Callbacks receive the real accumulated dt for their rate. Hidden tabs run nothing.

/**
 * Scheduled callback and accumulated time for a shared frame task.
 */
type FrameTask = {
  id: string;
  fn: (deltaSeconds: number, elapsed: number) => void;
  interval: number;
  acc: number;
};

class FrameScheduler {
  private tasks = new Map<string, FrameTask>();
  private elapsed = 0;

  /** Re-adding the same id replaces it (no duplicates on remount). Returns a remover. */
  add(id: string, fn: (deltaSeconds: number, elapsed: number) => void, hz = 0) {
    this.tasks.set(id, { id, fn, interval: hz > 0 ? 1 / hz : 0, acc: 0 });
    return () => {
      if (this.tasks.get(id)?.fn === fn) this.tasks.delete(id);
    };
  }
  remove(id: string) {
    this.tasks.delete(id);
  }
  get size() {
    return this.tasks.size;
  }

  tick(deltaSeconds: number) {
    if (document.visibilityState !== 'visible') return;
    this.elapsed += deltaSeconds;
    for (const task of this.tasks.values()) {
      task.acc += deltaSeconds;
      if (task.acc < task.interval) continue;
      const step = task.acc;
      task.acc = task.interval > 0 ? task.acc % task.interval : 0;
      try {
        task.fn(step, this.elapsed);
      } catch (error) {
        this.tasks.delete(task.id);
        if (import.meta.env.DEV)
          console.warn(
            `[lattice] frame task ${task.id} removed after error`,
            error,
          );
      }
    }
  }
}

export const frames = new FrameScheduler();
