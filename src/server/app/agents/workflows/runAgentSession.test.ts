import { describe, expect, it, vi } from 'vitest';

import type { EffectiveConfig } from '../../config/model.js';
import type { Issue } from '../../issues/model.js';

import { runAgentSession, type AgentSessionHandle } from './runAgentSession.js';

const testIssue: Issue = {
  id: 'i1',
  identifier: 'TEST-1',
  title: 'Test issue',
  description: 'A test issue',
  priority: 1,
  state: 'Todo',
  branch_name: null,
  url: null,
  labels: ['bug'],
  blocked_by: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: null,
};

const testConfig: EffectiveConfig = {
  tracker: {
    kind: 'linear',
    api_key: 'test',
    endpoint: 'https://api.linear.app/graphql',
    project_slug: 'test',
    active_states: ['Todo', 'In Progress'],
    terminal_states: ['Done', 'Cancelled'],
    handoff_states: ['Human Review'],
    transition_states: ['Todo', 'In Progress', 'Done', 'Human Review'],
  },
  polling: { interval_ms: 30000 },
  workspace: { root: '/tmp/symphony' },
  hooks: {
    after_create: null,
    before_run: null,
    after_run: null,
    before_remove: null,
    timeout_ms: 60000,
  },
  agent: {
    max_concurrent_agents: 10,
    max_turns: 3,
    max_retry_backoff_ms: 300000,
    max_concurrent_agents_by_state: {},
  },
  pi: {
    model: null,
    thinking: null,
    tools: ['read', 'bash'],
    session_dir: null,
    turn_timeout_ms: 1000,
    stall_timeout_ms: 300000,
  },
  server: { port: 48484, host: '127.0.0.1' },
  prompt_template: 'Work on {{ issue.identifier }}: {{ issue.title }}',
};

const makeSessionHandle = (
  behavior: 'success' | 'failure' | 'slow' = 'success',
): AgentSessionHandle => {
  const handlers = new Set<(e: unknown) => void>();
  return {
    sessionId: `test-session-${Date.now()}`,
    prompt: () =>
      behavior === 'failure'
        ? Promise.reject(new Error('Mock failure'))
        : behavior === 'slow'
          ? new Promise((r) => setTimeout(r, 10000))
          : Promise.resolve(),
    dispose: () => {
      handlers.clear();
      return Promise.resolve();
    },
    abort: () => {
      handlers.clear();
      return Promise.resolve();
    },
    events: {
      subscribe: (h: (e: unknown) => void) => {
        handlers.add(h);
        return () => handlers.delete(h);
      },
    },
  };
};

describe('runAgentSession', () => {
  it('runs a single turn and completes', async () => {
    const handle = makeSessionHandle('success');
    const events: unknown[] = [];
    const stateChecker = vi.fn().mockResolvedValue('Todo');

    const result = await runAgentSession(
      handle,
      'Fix the bug',
      testIssue,
      testConfig,
      (e) => events.push(e),
      stateChecker,
    );

    expect(result.status).toBe('completed');
    expect(result.turns).toBeGreaterThanOrEqual(1);
  });

  it('emits session_started event', async () => {
    const handle = makeSessionHandle('success');
    const events: unknown[] = [];

    await runAgentSession(
      handle,
      'Fix the bug',
      testIssue,
      testConfig,
      (e) => events.push(e),
      vi.fn().mockResolvedValue('Todo'),
    );

    const startEvent = events.find((e: unknown) => {
      const obj = e as Record<string, unknown>;
      return obj.event === 'session_started';
    });
    expect(startEvent).toBeDefined();
  });

  it('returns cancelled when external signal is aborted', async () => {
    const handle = makeSessionHandle('success');
    const controller = new AbortController();
    controller.abort(); // already aborted before start

    const result = await runAgentSession(
      handle,
      'Fix the bug',
      testIssue,
      testConfig,
      () => {},
      vi.fn().mockResolvedValue('Todo'),
      controller.signal,
    );

    expect(result.status).toBe('cancelled');
  });

  it('stops after max_turns', async () => {
    const handle = makeSessionHandle('success');

    const result = await runAgentSession(
      handle,
      'Fix the bug',
      testIssue,
      testConfig,
      () => {},
      vi.fn().mockResolvedValue('Todo'),
    );

    expect(result.turns).toBeLessThanOrEqual(testConfig.agent.max_turns);
  });

  it('returns failed when turn fails', async () => {
    const handle = makeSessionHandle('failure');

    const result = await runAgentSession(
      handle,
      'Fix the bug',
      testIssue,
      testConfig,
      () => {},
      vi.fn().mockResolvedValue('Todo'),
    );

    expect(result.status).toBe('failed');
  });

  it('calls dispose in all exit paths', async () => {
    const handle = makeSessionHandle('success');
    const disposeSpy = vi.spyOn(handle, 'dispose');

    await runAgentSession(
      handle,
      'Fix the bug',
      testIssue,
      testConfig,
      () => {},
      vi.fn().mockResolvedValue('Todo'),
    );

    expect(disposeSpy).toHaveBeenCalled();
  });

  it('calls abort when external signal fires during turn', async () => {
    const handle = makeSessionHandle('slow'); // slow = never resolves in this test
    const abortSpy = vi.spyOn(handle, 'abort');
    const controller = new AbortController();

    const runPromise = runAgentSession(
      handle,
      'Fix the bug',
      testIssue,
      testConfig,
      () => {},
      vi.fn().mockResolvedValue('Todo'),
      controller.signal,
    );

    // Abort while running
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();

    const result = await runPromise;
    expect(result.status).toBe('cancelled');
    expect(abortSpy).toHaveBeenCalled();
  });

  it('calls state checker after each turn', async () => {
    const handle = makeSessionHandle('success');
    const stateChecker = vi.fn().mockResolvedValue('Todo');

    await runAgentSession(handle, 'Fix the bug', testIssue, testConfig, () => {}, stateChecker);

    expect(stateChecker).toHaveBeenCalled();
  });

  it('stops early when state transitions out of active', async () => {
    const handle = makeSessionHandle('success');
    let callCount = 0;
    const stateChecker = vi.fn().mockImplementation(() => {
      callCount++;
      // Return 'Done' after first call
      return callCount === 1 ? Promise.resolve('In Progress') : Promise.resolve('Done');
    });

    const result = await runAgentSession(
      handle,
      'Fix the bug',
      testIssue,
      testConfig,
      () => {},
      stateChecker,
    );

    // Should stop when state is not in active_states
    expect(result.turns).toBeLessThan(testConfig.agent.max_turns);
  });
});
