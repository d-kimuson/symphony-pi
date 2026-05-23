import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { EffectiveConfig } from '../../config/model.ts';
import type { Issue } from '../../issues/model.ts';
import type { OrchestratorState, RunningEntry, RetryEntry } from '../model.ts';

import {
  handleWorkerExit,
  handleRetryFire,
  pollTick,
  setWorkflowPromptTemplate,
  setSessionHandleFactory,
} from './pollTick.ts';

// Mocks
vi.mock('../../issues/workflows/fetchIssues.js', () => ({
  fetchIssues: vi.fn(),
  fetchIssueStatesByIds: vi.fn(),
}));

vi.mock('../../workspaces/workflows/ensureWorkspace.js', () => ({
  ensureWorkspace: vi.fn(),
  runAfterCreateHook: vi.fn(),
  runBeforeRunHook: vi.fn(),
  runAfterRunHook: vi.fn(),
  removeWorkspace: vi.fn(),
}));

vi.mock('../../agents/workflows/runAgentSession.js', () => ({
  runAgentSession: vi.fn(),
}));

vi.mock('../../agents/services/buildPrompt.js', () => ({
  renderPrompt: vi.fn(),
}));

import { renderPrompt } from '../../agents/services/buildPrompt.ts';
import { runAgentSession } from '../../agents/workflows/runAgentSession.ts';
import { fetchIssues, fetchIssueStatesByIds } from '../../issues/workflows/fetchIssues.ts';
import {
  ensureWorkspace,
  runAfterCreateHook,
  runBeforeRunHook,
  runAfterRunHook,
  removeWorkspace,
} from '../../workspaces/workflows/ensureWorkspace.ts';

const mockFetchIssues = vi.mocked(fetchIssues);
const mockFetchStates = vi.mocked(fetchIssueStatesByIds);
const mockEnsureWs = vi.mocked(ensureWorkspace);
const mockRunAgentSession = vi.mocked(runAgentSession);
const mockRenderPrompt = vi.mocked(renderPrompt);

const makeConfig = (overrides?: Partial<EffectiveConfig>): EffectiveConfig => ({
  tracker: {
    kind: 'linear',
    api_key: 'test-key',
    endpoint: 'https://api.linear.app/graphql',
    team_key: 'ENG',
    project_slug: 'test',
    active_states: ['Todo', 'In Progress'],
    terminal_states: ['Done', 'Cancelled'],
    handoff_states: [],
    transition_states: ['Todo', 'In Progress', 'Done', 'Cancelled'],
  },
  polling: { interval_ms: 30000 },
  workspace: { root: '/tmp/workspaces' },
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
    tools: ['read', 'bash'],
    session_dir: null,
    turn_timeout_ms: 3600000,
    stall_timeout_ms: 300000,
  },
  server: { port: 48484, host: '127.0.0.1' },
  prompt_template: null,
  ...overrides,
});

const makeIssue = (overrides?: Partial<Issue>): Issue => ({
  id: 'issue-1',
  identifier: 'TEST-1',
  title: 'Test issue',
  description: null,
  priority: 1,
  state: 'Todo',
  branch_name: null,
  url: null,
  labels: [],
  blocked_by: [],
  created_at: null,
  updated_at: null,
  ...overrides,
});

const makeState = (): OrchestratorState => ({
  poll_interval_ms: 30000,
  max_concurrent_agents: 10,
  running: new Map(),
  claimed: new Set(),
  retry_attempts: new Map(),
  completed: new Set(),
  agent_totals: { input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0 },
  agent_rate_limits: null,
});

const makeRunningEntry = (overrides?: Partial<RunningEntry>): RunningEntry => ({
  issue_id: 'issue-1',
  issue_identifier: 'TEST-1',
  issue_state: 'Todo',
  workspace_path: '/tmp/ws/TEST-1',
  started_at: Date.now() - 60000,
  attempt: null,
  turn_count: 0,
  abortController: new AbortController(),
  ...overrides,
});

describe('pollTick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWorkflowPromptTemplate('Work on {{ issue.identifier }}');
    setSessionHandleFactory((_wsPath: string, _cfg: EffectiveConfig, _issueId: string) =>
      Promise.resolve({
        sessionId: 'test-session',
        prompt: () => Promise.resolve(),
        dispose: () => Promise.resolve(),
        abort: () => Promise.resolve(),
        events: { subscribe: () => () => {} },
      }),
    );
    // Mock removeWorkspace to return a resolved promise
    vi.mocked(removeWorkspace).mockResolvedValue(undefined);
  });

  it('skips dispatch when fetch returns null', async () => {
    const state = makeState();
    const config = makeConfig();
    mockFetchIssues.mockResolvedValue(null);

    await pollTick(state, config, () => {});

    expect(state.running.size).toBe(0);
  });

  it('dispatches eligible issue when slots available', async () => {
    const state = makeState();
    const config = makeConfig();
    const issue = makeIssue();
    mockFetchIssues.mockResolvedValue([issue]);
    mockFetchStates.mockResolvedValue([]);
    mockEnsureWs.mockReturnValue({
      type: 'reused',
      workspace: { path: '/tmp/ws/TEST-1', workspace_key: 'TEST-1', created_now: false },
    });
    mockRenderPrompt.mockReturnValue({ type: 'rendered', content: 'Work on TEST-1' });
    mockRunAgentSession.mockResolvedValue({ status: 'completed', turns: 1, error: null });
    // Skip hooks
    vi.mocked(runAfterCreateHook).mockResolvedValue({ type: 'success', stdout: '' });
    vi.mocked(runBeforeRunHook).mockResolvedValue({ type: 'success', stdout: '' });
    vi.mocked(runAfterRunHook).mockResolvedValue({ type: 'success', stdout: '' });

    await pollTick(state, config, () => {});

    expect(state.claimed.has('issue-1')).toBe(true);
    expect(state.running.has('issue-1')).toBe(true);
  });

  it('skips dispatch when no global slots', async () => {
    const state = makeState();
    state.max_concurrent_agents = 1;
    // Fill up slots
    for (let i = 0; i < 10; i++) {
      state.running.set(
        `r${i}`,
        makeRunningEntry({ issue_id: `r${i}`, issue_identifier: `T-${i}` }),
      );
    }
    const config = makeConfig({
      agent: {
        max_concurrent_agents: 0,
        max_turns: 20,
        max_retry_backoff_ms: 300000,
        max_concurrent_agents_by_state: {},
      },
    });
    mockFetchIssues.mockResolvedValue([makeIssue()]);

    await pollTick(state, config, () => {});

    expect(state.running.size).toBe(10); // No new dispatch
    // Only existing running entries remain
  });

  it('reconcile detects stalled sessions', async () => {
    const state = makeState();
    const config = makeConfig({
      pi: {
        model: null,
        thinking: null,
        tools: [],
        session_dir: null,
        turn_timeout_ms: 3600000,
        stall_timeout_ms: 100,
      },
    }); // 100ms stall
    const entry = makeRunningEntry({ started_at: Date.now() - 100000 }); // Started 100s ago - definitely stalled
    state.running.set('issue-1', entry);
    mockFetchIssues.mockResolvedValue([]);
    mockFetchStates.mockResolvedValue([]);

    await pollTick(state, config, () => {});

    // Stalled session should have been removed and retry queued
    expect(state.running.has('issue-1')).toBe(false);
    expect(state.retry_attempts.has('issue-1')).toBe(true);
  });

  it('reconcile terminal state stops and cleans workspace', async () => {
    const state = makeState();
    const config = makeConfig();
    const entry = makeRunningEntry({ started_at: Date.now() - 1000 });
    const abortSpy = vi.spyOn(entry.abortController, 'abort');
    state.running.set('issue-1', entry);
    mockFetchIssues.mockResolvedValue([]);
    mockFetchStates.mockResolvedValue([makeIssue({ id: 'issue-1', state: 'Done' })]);

    await pollTick(state, config, () => {});

    expect(abortSpy).toHaveBeenCalled();
    expect(state.running.has('issue-1')).toBe(false);
    expect(removeWorkspace).toHaveBeenCalled();
  });

  it('fetch failure keeps workers running during reconcile', async () => {
    const state = makeState();
    const config = makeConfig();
    state.running.set('issue-1', makeRunningEntry({ started_at: Date.now() - 1000 }));
    mockFetchIssues.mockResolvedValue([makeIssue()]);
    mockFetchStates.mockResolvedValue(null); // State fetch fails

    await pollTick(state, config, () => {});

    // Worker should still be running (reconcile failure keeps workers)
    expect(state.running.has('issue-1')).toBe(true);
  });
});

describe('handleWorkerExit', () => {
  it('success: schedules continuation retry at 1000ms', () => {
    const state = makeState();
    const config = makeConfig();
    state.running.set('issue-1', makeRunningEntry({ attempt: null }));
    state.claimed.add('issue-1');

    const before = Date.now();
    handleWorkerExit(state, 'issue-1', true, null, config);

    expect(state.running.has('issue-1')).toBe(false);
    expect(state.completed.has('issue-1')).toBe(true);
    const retry = state.retry_attempts.get('issue-1');
    expect(retry).toBeDefined();
    if (!retry) throw new Error('retry missing');
    expect(retry.attempt).toBe(1);
    // Continuation retry should be ~1000ms from now
    expect(retry.due_at_ms - before).toBeGreaterThanOrEqual(900);
    expect(retry.due_at_ms - before).toBeLessThanOrEqual(1100);
  });

  it('failure: schedules exponential backoff retry', () => {
    const state = makeState();
    const config = makeConfig();
    state.running.set('issue-1', makeRunningEntry({ attempt: 2 }));
    state.claimed.add('issue-1');

    const before = Date.now();
    handleWorkerExit(state, 'issue-1', false, 'timeout error', config);

    expect(state.running.has('issue-1')).toBe(false);
    const retry = state.retry_attempts.get('issue-1');
    expect(retry).toBeDefined();
    if (!retry) throw new Error('retry missing');
    expect(retry.attempt).toBe(3); // previous 2 + 1
    expect(retry.error).toBe('timeout error');
    // Exponential backoff for attempt 3: min(10000 * 2^(3-1), 300000) = 40000
    expect(retry.due_at_ms - before).toBeGreaterThanOrEqual(39900);
    expect(retry.due_at_ms - before).toBeLessThanOrEqual(40100);
  });

  it('no-op when entry not in running map', () => {
    const state = makeState();
    const config = makeConfig();
    // Should not throw
    handleWorkerExit(state, 'non-existent', true, null, config);
    expect(state.retry_attempts.size).toBe(0);
  });
});

describe('handleRetryFire', () => {
  it('re-dispatches when candidate found and eligible', async () => {
    const state = makeState();
    const config = makeConfig();
    const issue = makeIssue();
    mockFetchIssues.mockResolvedValue([issue]);
    mockEnsureWs.mockReturnValue({
      type: 'reused',
      workspace: { path: '/tmp/ws/TEST-1', workspace_key: 'TEST-1', created_now: false },
    });
    mockRenderPrompt.mockReturnValue({ type: 'rendered', content: 'prompt' });
    mockRunAgentSession.mockResolvedValue({ status: 'completed', turns: 1, error: null });

    const retryEntry: RetryEntry = {
      issue_id: 'issue-1',
      identifier: 'TEST-1',
      attempt: 1,
      due_at_ms: Date.now() - 1000,
      error: null,
    };
    state.retry_attempts.set('issue-1', retryEntry);

    await handleRetryFire(state, 'issue-1', config);

    expect(state.retry_attempts.has('issue-1')).toBe(false);
    // Should re-dispatch
    expect(state.running.has('issue-1')).toBe(true);
  });

  it('releases when issue not found in candidates', async () => {
    const state = makeState();
    const config = makeConfig();
    mockFetchIssues.mockResolvedValue([makeIssue({ id: 'other' })]);

    const retryEntry: RetryEntry = {
      issue_id: 'issue-1',
      identifier: 'TEST-1',
      attempt: 1,
      due_at_ms: Date.now() - 1000,
      error: null,
    };
    state.retry_attempts.set('issue-1', retryEntry);

    await handleRetryFire(state, 'issue-1', config);

    expect(state.retry_attempts.has('issue-1')).toBe(false);
    expect(state.running.has('issue-1')).toBe(false);
  });

  it('requeues when no slots available', async () => {
    const state = makeState();
    const config = makeConfig({
      agent: {
        max_concurrent_agents: 0,
        max_turns: 20,
        max_retry_backoff_ms: 300000,
        max_concurrent_agents_by_state: {},
      },
    });
    // Fill up slots
    for (let i = 0; i < 10; i++) {
      state.running.set(
        `r${i}`,
        makeRunningEntry({ issue_id: `r${i}`, issue_identifier: `T-${i}` }),
      );
    }
    mockFetchIssues.mockResolvedValue([makeIssue()]);

    const retryEntry: RetryEntry = {
      issue_id: 'issue-1',
      identifier: 'TEST-1',
      attempt: 1,
      due_at_ms: Date.now() - 1000,
      error: null,
    };
    state.retry_attempts.set('issue-1', retryEntry);

    await handleRetryFire(state, 'issue-1', config);

    expect(state.retry_attempts.has('issue-1')).toBe(true);
    expect(state.retry_attempts.get('issue-1')?.error).toContain('no available orchestrator slots');
  });

  it('no-op when retry entry not found', async () => {
    const state = makeState();
    const config = makeConfig();

    await handleRetryFire(state, 'non-existent', config);
    // Should not throw and not modify state
    expect(state.retry_attempts.size).toBe(0);
  });
});
