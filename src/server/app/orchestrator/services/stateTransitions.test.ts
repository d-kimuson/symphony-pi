import { describe, expect, it } from 'vitest';

import type { EffectiveConfig, LinearTrackerConfig } from '../../config/model.js';
import type { Issue } from '../../issues/model.js';
import type { RunningEntry } from '../model.js';

import {
  sortCandidatesByPriority,
  isDispatchEligible,
  hasGlobalSlots,
  calculateRetryDelay,
  createRetryEntry,
  isSessionStalled,
  determineReconciliationAction,
} from './stateTransitions.js';

const trackerConfig: LinearTrackerConfig = {
  kind: 'linear',
  api_key: 'key',
  endpoint: 'https://api.linear.app/graphql',
  project_slug: 'proj',
  active_states: ['Todo', 'In Progress'],
  terminal_states: ['Closed', 'Cancelled', 'Done'],
  handoff_states: [],
  transition_states: ['Todo', 'In Progress', 'Closed', 'Cancelled', 'Done'],
};

const baseConfig: EffectiveConfig = {
  tracker: trackerConfig,
  polling: { interval_ms: 30000 },
  workspace: { root: '/tmp/ws' },
  hooks: {
    after_create: null,
    before_run: null,
    after_run: null,
    before_remove: null,
    timeout_ms: 60000,
  },
  agent: {
    max_concurrent_agents: 10,
    max_turns: 20,
    max_retry_backoff_ms: 300000,
    max_concurrent_agents_by_state: {},
  },
  pi: {
    model: null,
    thinking: null,
    tools: [],
    session_dir: null,
    turn_timeout_ms: 3600000,
    stall_timeout_ms: 300000,
  },
  server: { port: 48484, host: '127.0.0.1' },
};

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 'i1',
  identifier: 'TEST-1',
  title: 'Test',
  description: null,
  priority: 1,
  state: 'Todo',
  branch_name: null,
  url: null,
  labels: [],
  blocked_by: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: null,
  ...overrides,
});

describe('sortCandidatesByPriority', () => {
  it('sorts by priority ascending', () => {
    const issues = [makeIssue({ id: 'a', priority: 3 }), makeIssue({ id: 'b', priority: 1 })];
    const sorted = sortCandidatesByPriority(issues);
    expect(sorted[0]?.id).toBe('b');
    expect(sorted[1]?.id).toBe('a');
  });

  it('null priority sorts last', () => {
    const issues = [makeIssue({ id: 'a', priority: null }), makeIssue({ id: 'b', priority: 1 })];
    const sorted = sortCandidatesByPriority(issues);
    expect(sorted[0]?.id).toBe('b');
    expect(sorted[1]?.id).toBe('a');
  });

  it('uses created_at as tiebreaker', () => {
    const issues = [
      makeIssue({ id: 'a', priority: 1, created_at: '2024-02-01T00:00:00Z' }),
      makeIssue({ id: 'b', priority: 1, created_at: '2024-01-01T00:00:00Z' }),
    ];
    const sorted = sortCandidatesByPriority(issues);
    expect(sorted[0]?.id).toBe('b');
  });
});

describe('isDispatchEligible', () => {
  it('returns true for valid active issue', () => {
    expect(isDispatchEligible(makeIssue(), baseConfig, new Map(), new Set())).toBe(true);
  });

  it('returns false when already running', () => {
    const running = new Map<string, RunningEntry>();
    running.set('i1', {
      issue_id: 'i1',
      issue_identifier: 'T-1',
      workspace_path: '/ws',
      started_at: 0,
      attempt: null,
      turn_count: 0,
    });
    expect(isDispatchEligible(makeIssue(), baseConfig, running, new Set())).toBe(false);
  });

  it('returns false when already claimed', () => {
    const claimed = new Set<string>(['i1']);
    expect(isDispatchEligible(makeIssue(), baseConfig, new Map(), claimed)).toBe(false);
  });

  it('returns false for terminal state', () => {
    expect(isDispatchEligible(makeIssue({ state: 'Done' }), baseConfig, new Map(), new Set())).toBe(
      false,
    );
  });

  it('returns false for non-active state', () => {
    expect(
      isDispatchEligible(makeIssue({ state: 'Backlog' }), baseConfig, new Map(), new Set()),
    ).toBe(false);
  });
});

describe('hasGlobalSlots', () => {
  it('returns true when slots available', () => {
    expect(hasGlobalSlots(baseConfig, new Map())).toBe(true);
  });

  it('returns false when at capacity', () => {
    const running = new Map<string, RunningEntry>();
    for (let i = 0; i < 10; i++) {
      running.set(String(i), {
        issue_id: String(i),
        issue_identifier: `T-${i}`,
        workspace_path: '/ws',
        started_at: 0,
        attempt: null,
        turn_count: 0,
      });
    }
    expect(hasGlobalSlots(baseConfig, running)).toBe(false);
  });
});

describe('calculateRetryDelay', () => {
  it('returns 1000ms for normal continuation', () => {
    expect(calculateRetryDelay(1, true, 300000)).toBe(1000);
  });

  it('returns 10000ms for first failure retry', () => {
    expect(calculateRetryDelay(1, false, 300000)).toBe(10000);
  });

  it('doubles for subsequent attempts', () => {
    expect(calculateRetryDelay(2, false, 300000)).toBe(20000);
    expect(calculateRetryDelay(3, false, 300000)).toBe(40000);
  });

  it('caps at max_retry_backoff_ms', () => {
    expect(calculateRetryDelay(10, false, 60000)).toBe(60000);
  });
});

describe('createRetryEntry', () => {
  it('creates entry with correct delay', () => {
    const entry = createRetryEntry('id1', 'TEST-1', 1, true, 300000, null);
    expect(entry.issue_id).toBe('id1');
    expect(entry.attempt).toBe(1);
    expect(entry.error).toBeNull();
  });

  it('includes error when provided', () => {
    const entry = createRetryEntry('id1', 'TEST-1', 2, false, 300000, 'timeout');
    expect(entry.error).toBe('timeout');
  });
});

describe('isSessionStalled', () => {
  it('returns false when stall timeout is 0', () => {
    const entry: RunningEntry = {
      issue_id: 'i1',
      issue_identifier: 'T-1',
      workspace_path: '/ws',
      started_at: 0,
      attempt: null,
      turn_count: 0,
    };
    expect(isSessionStalled(entry, 0, null)).toBe(false);
  });

  it('returns true when elapsed exceeds timeout', () => {
    const entry: RunningEntry = {
      issue_id: 'i1',
      issue_identifier: 'T-1',
      workspace_path: '/ws',
      started_at: 0,
      attempt: null,
      turn_count: 0,
    };
    expect(isSessionStalled(entry, 1000, null)).toBe(true);
  });
});

describe('determineReconciliationAction', () => {
  it('returns stop_and_cleanup for terminal state', () => {
    const action = determineReconciliationAction('Done', baseConfig);
    expect(action.action).toBe('stop_and_cleanup');
  });

  it('returns keep_running for active state', () => {
    const action = determineReconciliationAction('In Progress', baseConfig);
    expect(action.action).toBe('keep_running');
  });

  it('returns stop_without_cleanup for non-active non-terminal', () => {
    const action = determineReconciliationAction('Human Review', baseConfig);
    expect(action.action).toBe('stop_without_cleanup');
  });
});
