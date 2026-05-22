/** Server-only clock/time helpers. */

/**
 * Monotonic timestamp in milliseconds.
 * Uses performance.now() where available, otherwise Date.now().
 */
export const monotonicNowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

/**
 * Current UTC timestamp as ISO-8601 string.
 */
export const utcNow = (): string => new Date().toISOString();

/**
 * Elapsed milliseconds between two monotonic timestamps.
 */
export const elapsedMs = (startMs: number, endMs: number): number => endMs - startMs;
