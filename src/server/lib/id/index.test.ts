import { describe, expect, it } from 'vitest';

import { composeSessionId, formatTurnId, generateThreadId } from './index.ts';

describe('generateThreadId', () => {
  it('returns a non-empty UUID string', () => {
    const id = generateThreadId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    // UUID format check
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateThreadId()));
    expect(ids.size).toBe(10);
  });
});

describe('composeSessionId', () => {
  it('composes session ID in pi:<thread_id>:<turn_id> format', () => {
    const sessionId = composeSessionId('thread-123', 'turn-1');
    expect(sessionId).toBe('pi:thread-123:turn-1');
  });

  it('handles UUID thread IDs', () => {
    const threadId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const sessionId = composeSessionId(threadId, 'turn-5');
    expect(sessionId).toBe(`pi:${threadId}:turn-5`);
  });
});

describe('formatTurnId', () => {
  it('formats turn number as turn-<n>', () => {
    expect(formatTurnId(1)).toBe('turn-1');
    expect(formatTurnId(42)).toBe('turn-42');
  });
});
