// Guards against double insertion, double portal entry, duplicate activation and
// overlapping sequences. Every lock auto-expires so no state can deadlock.

type Lock = { until: number; token: number };

class InteractionLocks {
  private locks = new Map<string, Lock>();
  private onceKeys = new Set<string>();
  private token = 0;

  /** Acquire `key` for at most `maxMs`. Returns a release function, or null if already held. */
  acquire(key: string, maxMs = 8000): (() => void) | null {
    const now = performance.now(), held = this.locks.get(key);
    if (held && held.until > now) return null;
    const token = ++this.token;
    this.locks.set(key, { until: now + maxMs, token });
    return () => { if (this.locks.get(key)?.token === token) this.locks.delete(key); };
  }
  isLocked(key: string) { const held = this.locks.get(key); return !!held && held.until > performance.now(); }

  /** Run `fn` only if `key` is free; holds the lock until fn settles (or maxMs). */
  async exclusive<T>(key: string, fn: () => Promise<T> | T, maxMs = 8000): Promise<T | undefined> {
    const release = this.acquire(key, maxMs);
    if (!release) return undefined;
    try { return await fn(); } finally { release(); }
  }

  /** True the first time per `key` until reset (e.g. "baymax-activated" per run). */
  once(key: string) { if (this.onceKeys.has(key)) return false; this.onceKeys.add(key); return true; }

  /** Ignore repeats within `ms` (spam-click / key-repeat filter). */
  throttle(key: string, ms = 350) { return this.acquire(`throttle:${key}`, ms) !== null; }

  /** Called on restart / checkpoint jump. */
  reset() { this.locks.clear(); this.onceKeys.clear(); }
}

export const locks = new InteractionLocks();
