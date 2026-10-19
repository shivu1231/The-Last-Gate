// Guards against double insertion, double portal entry, duplicate activation and
// overlapping sequences. Every lock auto-expires so no state can deadlock.

/**
 * Expiry time and ownership token for one interaction guard.
 */
type InteractionLockRecord = {
  /** Expiry on the performance.now() clock, in milliseconds. */
  until: number;
  /** Distinguishes a renewed lock from its expired predecessor. */
  token: number;
};

/**
 * Prevents repeated interactions and overlapping sequences with expiring guards.
 */
class InteractionLocks {
  private locks = new Map<string, InteractionLockRecord>();
  private onceKeys = new Set<string>();
  private token = 0;

  /**
   * Acquire a key until released or expired.
   * @param key - Interaction shared by competing callers.
   * @param maximumDurationMs - Guard lifetime in milliseconds.
   * @returns A release callback, or null when an unexpired guard already exists.
   */
  acquire(key: string, maximumDurationMs = 8000): (() => void) | null {
    const currentTime = performance.now(),
      existingLock = this.locks.get(key);
    if (existingLock && existingLock.until > currentTime) return null;
    const token = ++this.token;
    this.locks.set(key, { until: currentTime + maximumDurationMs, token });
    // An expired owner must not release a newer guard for the same key.
    return () => {
      if (this.locks.get(key)?.token === token) this.locks.delete(key);
    };
  }

  /**
   * Check the guard against the current clock without changing its ownership.
   */
  isLocked(key: string) {
    const existingLock = this.locks.get(key);
    return !!existingLock && existingLock.until > performance.now();
  }

  /**
   * Run an operation only while its interaction key is available.
   * @param operation - Synchronous or asynchronous work protected by the guard.
   * @returns The operation result, or undefined when the key is already held.
   */
  async exclusive<Result>(
    key: string,
    operation: () => Promise<Result> | Result,
    maximumDurationMs = 8000,
  ): Promise<Result | undefined> {
    const release = this.acquire(key, maximumDurationMs);
    if (!release) return undefined;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  /**
   * Return true only for the first use of a key since the last reset.
   */
  once(key: string) {
    if (this.onceKeys.has(key)) return false;
    this.onceKeys.add(key);
    return true;
  }

  /**
   * Accept a key once within the supplied interval.
   * @param durationMs - Minimum interval between accepted calls, in milliseconds.
   */
  throttle(key: string, durationMs = 350) {
    return this.acquire(`throttle:${key}`, durationMs) !== null;
  }

  /**
   * Clear guards and one-shot keys when restarting the experience.
   */
  reset() {
    this.locks.clear();
    this.onceKeys.clear();
  }
}

/**
 * Shared interaction guards used by scene transitions and chapter controls.
 */
export const locks = new InteractionLocks();
