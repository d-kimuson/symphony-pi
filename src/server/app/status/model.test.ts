import { describe, expect, it } from 'vitest';

import type { RuntimeSnapshot, RunningRow, RetryRow } from './model.js';

describe('RunningRow', () => {
  const row: RunningRow = {
    issue_id: 'abc123',
    issue_identifier: 'ABC-123',
    turn_count: 3,
    started_at: '2024-01-01T00:00:00Z',
    attempt: null,
  } as const satisfies RunningRow;

  it('has all fields for status display', () => {
    expect(row.issue_id).toBe('abc123');
    expect(row.turn_count).toBe(3);
    expect(row.started_at).toBe('2024-01-01T00:00:00Z');
  });
});

describe('RetryRow', () => {
  const row: RetryRow = {
    issue_id: 'def456',
    identifier: 'DEF-456',
    attempt: 2,
    due_at_ms: 1700000005000,
    error: 'timeout',
  } as const satisfies RetryRow;

  it('has all fields for retry display', () => {
    expect(row.issue_id).toBe('def456');
    expect(row.attempt).toBe(2);
    expect(row.error).toBe('timeout');
  });
});

describe('RuntimeSnapshot', () => {
  const snapshot: RuntimeSnapshot = {
    generated_at: '2024-01-01T12:00:00Z',
    counts: { running: 2, retrying: 1 },
    running: [
      {
        issue_id: 'a',
        issue_identifier: 'A-1',
        turn_count: 1,
        started_at: '2024-01-01T11:00:00Z',
        attempt: null,
      },
    ],
    retrying: [
      {
        issue_id: 'b',
        identifier: 'B-1',
        attempt: 1,
        due_at_ms: 1700000000000,
        error: null,
      },
    ],
    agent_totals: {
      input_tokens: 500,
      output_tokens: 250,
      total_tokens: 750,
      seconds_running: 120,
    },
    rate_limits: null,
  } as const satisfies RuntimeSnapshot;

  it('includes counts, running, retrying, totals, and rate limits', () => {
    expect(snapshot.counts.running).toBe(2);
    expect(snapshot.counts.retrying).toBe(1);
    expect(snapshot.running).toHaveLength(1);
    expect(snapshot.retrying).toHaveLength(1);
    expect(snapshot.agent_totals.seconds_running).toBe(120);
    expect(snapshot.rate_limits).toBeNull();
  });
});
