import { describe, expect, it } from 'vitest';

import type { AgentTotals, OrchestratorState, RetryEntry, RunningEntry } from './model.js';

describe('RetryEntry', () => {
  const entry: RetryEntry = {
    issue_id: 'abc123',
    identifier: 'ABC-123',
    attempt: 1,
    due_at_ms: 1700000000000,
    error: null,
  } as const satisfies RetryEntry;

  it('has required fields', () => {
    expect(entry.issue_id).toBe('abc123');
    expect(entry.attempt).toBe(1);
    expect(entry.error).toBeNull();
  });

  it('error can be a string', () => {
    const withError: RetryEntry = { ...entry, error: 'timeout' };
    expect(withError.error).toBe('timeout');
  });
});

describe('RunningEntry', () => {
  const entry: RunningEntry = {
    issue_id: 'abc123',
    issue_identifier: 'ABC-123',
    workspace_path: '/tmp/workspaces/ABC-123',
    issue_state: 'Todo',
    started_at: 1700000000000,
    attempt: null,
    turn_count: 3,
    abortController: new AbortController(),
  } as const satisfies RunningEntry;

  it('has all fields', () => {
    expect(entry.issue_id).toBe('abc123');
    expect(entry.turn_count).toBe(3);
  });
});

describe('AgentTotals', () => {
  const totals: AgentTotals = {
    input_tokens: 1000,
    output_tokens: 500,
    total_tokens: 1500,
    seconds_running: 3600,
  } as const satisfies AgentTotals;

  it('has token and runtime aggregates', () => {
    expect(totals.input_tokens).toBe(1000);
    expect(totals.seconds_running).toBe(3600);
  });
});

describe('OrchestratorState', () => {
  const state: OrchestratorState = {
    poll_interval_ms: 30000,
    max_concurrent_agents: 10,
    running: new Map(),
    claimed: new Set(),
    retry_attempts: new Map(),
    completed: new Set(),
    agent_totals: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      seconds_running: 0,
    },
    agent_rate_limits: null,
  };

  it('initializes with empty state', () => {
    expect(state.running.size).toBe(0);
    expect(state.claimed.size).toBe(0);
    expect(state.retry_attempts.size).toBe(0);
    expect(state.completed.size).toBe(0);
    expect(state.agent_rate_limits).toBeNull();
  });

  it('can add running entries', () => {
    state.running.set('abc123', {
      issue_id: 'abc123',
      issue_identifier: 'ABC-123',
      workspace_path: '/tmp/ws/ABC-123',
      issue_state: 'Todo',
      started_at: Date.now(),
      attempt: null,
      turn_count: 0,
      abortController: new AbortController(),
    });
    expect(state.running.size).toBe(1);
  });

  it('can add claimed entries', () => {
    state.claimed.add('xyz789');
    expect(state.claimed.has('xyz789')).toBe(true);
  });

  it('can add retry entries', () => {
    state.retry_attempts.set('def456', {
      issue_id: 'def456',
      identifier: 'DEF-456',
      attempt: 1,
      due_at_ms: Date.now() + 5000,
      error: null,
    });
    expect(state.retry_attempts.size).toBe(1);
  });
});
