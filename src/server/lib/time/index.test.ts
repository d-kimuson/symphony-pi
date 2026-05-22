import { describe, expect, it } from 'vitest';

import { elapsedMs, monotonicNowMs, utcNow } from './index.js';

describe('monotonicNowMs', () => {
  it('returns a positive number', () => {
    const now = monotonicNowMs();
    expect(now).toBeGreaterThan(0);
    expect(typeof now).toBe('number');
  });

  it('is monotonic (later calls return larger or equal values)', async () => {
    const a = monotonicNowMs();
    await new Promise((r) => setTimeout(r, 10));
    const b = monotonicNowMs();
    expect(b).toBeGreaterThanOrEqual(a);
  });
});

describe('utcNow', () => {
  it('returns an ISO-8601 string', () => {
    const now = utcNow();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('contains a Z or timezone offset', () => {
    const now = utcNow();
    expect(now).toMatch(/[Z+]/);
  });
});

describe('elapsedMs', () => {
  it('computes elapsed time between two timestamps', () => {
    expect(elapsedMs(100, 200)).toBe(100);
    expect(elapsedMs(0, 5000)).toBe(5000);
  });

  it('returns negative when end is before start', () => {
    expect(elapsedMs(500, 100)).toBe(-400);
  });
});
