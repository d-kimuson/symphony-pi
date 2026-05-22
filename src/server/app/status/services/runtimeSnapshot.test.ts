import { describe, expect, it } from 'vitest';

import type { OrchestratorState } from '../../orchestrator/model.js';

import { buildRuntimeSnapshot } from './runtimeSnapshot.js';

describe('buildRuntimeSnapshot', () => {
  const makeState = (): OrchestratorState => ({
    poll_interval_ms: 30000,
    max_concurrent_agents: 10,
    running: new Map(),
    claimed: new Set(),
    retry_attempts: new Map(),
    completed: new Set(),
    agent_totals: {
      input_tokens: 500,
      output_tokens: 250,
      total_tokens: 750,
      seconds_running: 120,
    },
    agent_rate_limits: null,
  });

  it('returns empty snapshot for empty state', () => {
    const state = makeState();
    const snapshot = buildRuntimeSnapshot(state);
    expect(snapshot.counts.running).toBe(0);
    expect(snapshot.counts.retrying).toBe(0);
    expect(snapshot.running).toEqual([]);
    expect(snapshot.retrying).toEqual([]);
  });

  it('includes running entries', () => {
    const state = makeState();
    state.running.set('i1', {
      issue_id: 'i1',
      issue_identifier: 'TEST-1',
      workspace_path: '/ws/TEST-1',
      started_at: Date.now(),
      attempt: null,
      turn_count: 3,
    });

    const snapshot = buildRuntimeSnapshot(state);
    expect(snapshot.counts.running).toBe(1);
    if (snapshot.running[0] === undefined) throw new Error('expected row');
    expect(snapshot.running[0].issue_id).toBe('i1');
    expect(snapshot.running[0].turn_count).toBe(3);
  });

  it('includes retry entries', () => {
    const state = makeState();
    state.retry_attempts.set('i2', {
      issue_id: 'i2',
      identifier: 'TEST-2',
      attempt: 2,
      due_at_ms: Date.now() + 5000,
      error: 'timeout',
    });

    const snapshot = buildRuntimeSnapshot(state);
    expect(snapshot.counts.retrying).toBe(1);
    if (snapshot.retrying[0] === undefined) throw new Error('expected row');
    expect(snapshot.retrying[0].identifier).toBe('TEST-2');
    expect(snapshot.retrying[0].error).toBe('timeout');
  });

  it('includes agent totals', () => {
    const state = makeState();
    const snapshot = buildRuntimeSnapshot(state);
    expect(snapshot.agent_totals.input_tokens).toBe(500);
    expect(snapshot.agent_totals.total_tokens).toBe(750);
  });
});
