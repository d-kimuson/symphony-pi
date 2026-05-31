import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { EffectiveConfig } from '../../config/model.ts';
import type { TrackerAdapter } from '../../issues/adapters/trackerAdapter.ts';
import type { Issue } from '../../issues/model.ts';
import type { OrchestratorState, RunningEntry, RetryEntry } from '../model.ts';

import { handleWorkerExit, handleRetryFire, pollTick, type PollTickDeps } from './pollTick.ts';

vi.mock('../../issues/workflows/fetchIssues.js', () => ({
  fetchIssues: vi.fn(),
  fetchIssueStatesByIds: vi.fn(),
}));

vi.mock('../../workspaces/workflows/ensureWorkspace.js', () => ({
  ensureWorkspace: vi.fn(),
  prepareWorkspace: vi.fn(),
  runBeforeRunHook: vi.fn(),
  runAfterRunHook: vi.fn(),
  removeWorkspace: vi.fn(),
}));

vi.mock('../../workspaces/services/gitWorktree.js', () => ({
  inspectGitWorktree: vi.fn(),
}));

vi.mock('../../workspaces/services/runState.js', () => ({
  deleteWorkspaceRunState: vi.fn(),
  readWorkspaceRunState: vi.fn(),
  writeWorkspaceRunState: vi.fn(),
}));

vi.mock('../../agents/workflows/runAgentSession.js', () => ({
  runAgentSession: vi.fn(),
}));

vi.mock('../../agents/services/buildPrompt.js', () => ({
  renderPrompt: vi.fn(),
  buildResumePrompt: vi.fn(() => 'resume prompt'),
  buildDirtyWorktreePrompt: vi.fn(() => 'dirty prompt'),
}));

import { renderPrompt } from '../../agents/services/buildPrompt.ts';
import { runAgentSession } from '../../agents/workflows/runAgentSession.ts';
import { fetchIssues, fetchIssueStatesByIds } from '../../issues/workflows/fetchIssues.ts';
import { inspectGitWorktree } from '../../workspaces/services/gitWorktree.ts';
import {
  deleteWorkspaceRunState,
  readWorkspaceRunState,
  writeWorkspaceRunState,
} from '../../workspaces/services/runState.ts';
import {
  ensureWorkspace,
  prepareWorkspace,
  runBeforeRunHook,
  runAfterRunHook,
  removeWorkspace,
} from '../../workspaces/workflows/ensureWorkspace.ts';

const mockFetchIssues = vi.mocked(fetchIssues);
const mockFetchStates = vi.mocked(fetchIssueStatesByIds);
const mockEnsureWs = vi.mocked(ensureWorkspace);
const mockRunAgentSession = vi.mocked(runAgentSession);
const mockRenderPrompt = vi.mocked(renderPrompt);
const mockInspectGitWorktree = vi.mocked(inspectGitWorktree);
const mockDeleteWorkspaceRunState = vi.mocked(deleteWorkspaceRunState);
const mockReadWorkspaceRunState = vi.mocked(readWorkspaceRunState);
const mockWriteWorkspaceRunState = vi.mocked(writeWorkspaceRunState);

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
  workspace: { root: '/tmp/workspaces', defaultBranch: 'main' },
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
  session_id: null,
  session_file: null,
  dirty_auto_resume_count: 0,
  turn_count: 0,
  abortController: new AbortController(),
  ...overrides,
});

const flushAsyncWork = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const makeDeps = (): PollTickDeps => ({
  tracker: {
    fetchCandidateIssues: () => Promise.resolve([]),
    fetchIssueStatesByIds: () => Promise.resolve([]),
    fetchIssuesByStates: () => Promise.resolve([]),
  } satisfies TrackerAdapter,
  promptTemplate: 'Work on {{ issue.identifier }}',
  createSessionHandle: (_wsPath: string, _cfg: EffectiveConfig, _issueId: string) =>
    Promise.resolve({
      sessionId: 'test-session',
      sessionFile: '/tmp/sessions/test-session.jsonl',
      prompt: () => Promise.resolve(),
      dispose: () => Promise.resolve(),
      abort: () => Promise.resolve(),
      events: { subscribe: () => () => {} },
    }),
  notify: vi.fn(),
  projectId: 'alpha',
});

describe('pollTick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(removeWorkspace).mockResolvedValue(undefined);
    vi.mocked(prepareWorkspace).mockResolvedValue({
      type: 'success',
      repoRoot: '/repo',
      branchName: 'symphony-pi/abc1234',
      attempts: 1,
    });
    vi.mocked(runBeforeRunHook).mockResolvedValue({ type: 'success', stdout: '' });
    vi.mocked(runAfterRunHook).mockResolvedValue({ type: 'success', stdout: '' });
    mockInspectGitWorktree.mockResolvedValue({ type: 'clean' });
    mockReadWorkspaceRunState.mockReturnValue(null);
  });

  it('skips dispatch when fetch returns null', async () => {
    const state = makeState();
    const config = makeConfig();
    const deps = makeDeps();
    mockFetchIssues.mockResolvedValue(null);

    await pollTick(state, config, deps);

    expect(state.running.size).toBe(0);
  });

  it('dispatches eligible issue when slots available', async () => {
    const state = makeState();
    const config = makeConfig();
    const deps = makeDeps();
    const issue = makeIssue();
    mockFetchIssues.mockResolvedValue([issue]);
    mockFetchStates.mockResolvedValue([]);
    mockEnsureWs.mockReturnValue({
      type: 'reused',
      workspace: { path: '/tmp/ws/TEST-1', workspace_key: 'TEST-1', created_now: false },
    });
    mockRenderPrompt.mockReturnValue({ type: 'rendered', content: 'Work on TEST-1' });
    mockRunAgentSession.mockResolvedValue({ status: 'completed', turns: 1, error: null });
    vi.mocked(runBeforeRunHook).mockResolvedValue({ type: 'success', stdout: '' });
    vi.mocked(runAfterRunHook).mockResolvedValue({ type: 'success', stdout: '' });

    await pollTick(state, config, deps);

    expect(state.claimed.has('issue-1')).toBe(true);
    expect(state.running.has('issue-1')).toBe(true);
    expect(deps.notify).toHaveBeenCalled();
    await flushAsyncWork();
  });

  it('prepares a newly created workspace before running the agent', async () => {
    const state = makeState();
    const config = makeConfig();
    const deps = makeDeps();
    const issue = makeIssue();
    mockFetchIssues.mockResolvedValue([issue]);
    mockFetchStates.mockResolvedValue([]);
    mockEnsureWs.mockReturnValue({
      type: 'created',
      workspace: { path: '/tmp/ws/TEST-1', workspace_key: 'TEST-1', created_now: true },
    });
    mockRenderPrompt.mockReturnValue({ type: 'rendered', content: 'Work on TEST-1' });
    mockRunAgentSession.mockResolvedValue({ status: 'completed', turns: 1, error: null });

    await pollTick(state, config, deps);
    await flushAsyncWork();

    expect(prepareWorkspace).toHaveBeenCalledWith(
      { path: '/tmp/ws/TEST-1', workspace_key: 'TEST-1', created_now: true },
      config,
    );
  });

  it('stops before agent execution when workspace preparation fails', async () => {
    const state = makeState();
    const config = makeConfig();
    const deps = makeDeps();
    const issue = makeIssue();
    mockFetchIssues.mockResolvedValue([issue]);
    mockFetchStates.mockResolvedValue([]);
    mockEnsureWs.mockReturnValue({
      type: 'created',
      workspace: { path: '/tmp/ws/TEST-1', workspace_key: 'TEST-1', created_now: true },
    });
    vi.mocked(prepareWorkspace).mockResolvedValueOnce({
      type: 'failure',
      error: 'git failed',
    });

    await pollTick(state, config, deps);
    await flushAsyncWork();

    expect(runBeforeRunHook).not.toHaveBeenCalled();
    expect(mockRunAgentSession).not.toHaveBeenCalled();
    expect(removeWorkspace).toHaveBeenCalledWith('/tmp/ws/TEST-1', config);
    expect(mockDeleteWorkspaceRunState).toHaveBeenCalledWith('/tmp/ws/TEST-1');
  });

  it('skips dispatch when issue is retry queued', async () => {
    const state = makeState();
    const config = makeConfig();
    const deps = makeDeps();
    const issue = makeIssue();
    state.claimed.add(issue.id);
    state.retry_attempts.set(issue.id, {
      issue_id: issue.id,
      identifier: issue.identifier,
      attempt: 1,
      due_at_ms: Date.now() + 10000,
      error: null,
      session_file: null,
      dirty_auto_resume_count: 0,
    });
    mockFetchIssues.mockResolvedValue([issue]);
    mockFetchStates.mockResolvedValue([]);

    await pollTick(state, config, deps);

    expect(mockEnsureWs).not.toHaveBeenCalled();
    expect(state.running.has(issue.id)).toBe(false);
    expect(state.claimed.has(issue.id)).toBe(true);
  });

  it('skips dispatch when no global slots', async () => {
    const state = makeState();
    const config = makeConfig({
      agent: {
        max_concurrent_agents: 0,
        max_turns: 20,
        max_retry_backoff_ms: 300000,
        max_concurrent_agents_by_state: {},
      },
    });
    const deps = makeDeps();
    for (let i = 0; i < 10; i++) {
      state.running.set(
        `r${i}`,
        makeRunningEntry({ issue_id: `r${i}`, issue_identifier: `T-${i}` }),
      );
    }
    mockFetchIssues.mockResolvedValue([makeIssue()]);

    await pollTick(state, config, deps);

    expect(state.running.size).toBe(10);
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
    });
    const deps = makeDeps();
    const entry = makeRunningEntry({ started_at: Date.now() - 100000 });
    state.running.set('issue-1', entry);
    mockFetchIssues.mockResolvedValue([]);
    mockFetchStates.mockResolvedValue([]);

    await pollTick(state, config, deps);

    expect(state.running.has('issue-1')).toBe(false);
    expect(state.retry_attempts.has('issue-1')).toBe(true);
  });

  it('reconcile terminal state stops and cleans workspace', async () => {
    const state = makeState();
    const config = makeConfig();
    const deps = makeDeps();
    const entry = makeRunningEntry({ started_at: Date.now() - 1000 });
    const abortSpy = vi.spyOn(entry.abortController, 'abort');
    state.running.set('issue-1', entry);
    mockFetchIssues.mockResolvedValue([]);
    mockFetchStates.mockResolvedValue([makeIssue({ id: 'issue-1', state: 'Done' })]);

    await pollTick(state, config, deps);

    expect(abortSpy).toHaveBeenCalled();
    expect(state.running.has('issue-1')).toBe(false);
    expect(removeWorkspace).toHaveBeenCalled();
  });

  it('fetch failure keeps workers running during reconcile', async () => {
    const state = makeState();
    const config = makeConfig();
    const deps = makeDeps();
    state.running.set('issue-1', makeRunningEntry({ started_at: Date.now() - 1000 }));
    mockFetchIssues.mockResolvedValue([makeIssue()]);
    mockFetchStates.mockResolvedValue(null);

    await pollTick(state, config, deps);

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
    handleWorkerExit(state, 'issue-1', true, null, config, 'alpha');

    expect(state.running.has('issue-1')).toBe(false);
    expect(state.completed.has('issue-1')).toBe(true);
    expect(state.claimed.has('issue-1')).toBe(true);
    const retry = state.retry_attempts.get('issue-1');
    expect(retry).toBeDefined();
    if (!retry) throw new Error('retry missing');
    expect(retry.attempt).toBe(1);
    expect(retry.due_at_ms - before).toBeGreaterThanOrEqual(900);
    expect(retry.due_at_ms - before).toBeLessThanOrEqual(1100);
  });

  it('failure: schedules exponential backoff retry', () => {
    const state = makeState();
    const config = makeConfig();
    state.running.set('issue-1', makeRunningEntry({ attempt: 2 }));
    state.claimed.add('issue-1');

    const before = Date.now();
    handleWorkerExit(state, 'issue-1', false, 'timeout error', config, 'alpha');

    expect(state.running.has('issue-1')).toBe(false);
    expect(state.claimed.has('issue-1')).toBe(true);
    const retry = state.retry_attempts.get('issue-1');
    expect(retry).toBeDefined();
    if (!retry) throw new Error('retry missing');
    expect(retry.attempt).toBe(3);
    expect(retry.error).toBe('timeout error');
    expect(retry.due_at_ms - before).toBeGreaterThanOrEqual(39900);
    expect(retry.due_at_ms - before).toBeLessThanOrEqual(40100);
  });

  it('no-op when entry not in running map', () => {
    const state = makeState();
    const config = makeConfig();
    handleWorkerExit(state, 'non-existent', true, null, config, 'alpha');
    expect(state.retry_attempts.size).toBe(0);
  });
});

describe('handleRetryFire', () => {
  it('re-dispatches when candidate found and eligible', async () => {
    const state = makeState();
    const config = makeConfig();
    const deps = makeDeps();
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
      session_file: null,
      dirty_auto_resume_count: 0,
    };
    state.retry_attempts.set('issue-1', retryEntry);
    state.claimed.add('issue-1');

    await handleRetryFire(state, 'issue-1', config, deps);

    expect(state.retry_attempts.has('issue-1')).toBe(false);
    expect(state.running.has('issue-1')).toBe(true);
    expect(state.claimed.has('issue-1')).toBe(true);
    await flushAsyncWork();
  });

  it('passes retry attempt and session file into re-dispatch', async () => {
    const state = makeState();
    const config = makeConfig();
    const createSessionHandle = vi.fn().mockResolvedValue({
      sessionId: 'resumed-session',
      sessionFile: '/tmp/sessions/resumed.jsonl',
      prompt: () => Promise.resolve(),
      dispose: () => Promise.resolve(),
      abort: () => Promise.resolve(),
      events: { subscribe: () => () => {} },
    });
    const deps = { ...makeDeps(), createSessionHandle };
    const issue = makeIssue();
    mockFetchIssues.mockResolvedValue([issue]);
    mockEnsureWs.mockReturnValue({
      type: 'reused',
      workspace: { path: '/tmp/ws/TEST-1', workspace_key: 'TEST-1', created_now: false },
    });
    mockRunAgentSession.mockResolvedValue({ status: 'failed', turns: 1, error: 'again' });

    state.retry_attempts.set('issue-1', {
      issue_id: 'issue-1',
      identifier: 'TEST-1',
      attempt: 2,
      due_at_ms: Date.now() - 1000,
      error: 'timeout',
      session_file: '/tmp/sessions/previous.jsonl',
      dirty_auto_resume_count: 0,
    });
    state.claimed.add('issue-1');

    await handleRetryFire(state, 'issue-1', config, deps);
    await flushAsyncWork();

    expect(createSessionHandle).toHaveBeenCalledWith(
      '/tmp/ws/TEST-1',
      config,
      'TEST-1',
      '/tmp/sessions/previous.jsonl',
    );
    expect(state.retry_attempts.get('issue-1')?.attempt).toBe(3);
    expect(state.retry_attempts.get('issue-1')?.session_file).toBe('/tmp/sessions/resumed.jsonl');
  });

  it('auto-resumes a completed run when the git worktree is dirty', async () => {
    const state = makeState();
    const config = makeConfig();
    const createSessionHandle = vi
      .fn()
      .mockResolvedValueOnce({
        sessionId: 'first-session',
        sessionFile: '/tmp/sessions/dirty.jsonl',
        prompt: () => Promise.resolve(),
        dispose: () => Promise.resolve(),
        abort: () => Promise.resolve(),
        events: { subscribe: () => () => {} },
      })
      .mockResolvedValueOnce({
        sessionId: 'resumed-session',
        sessionFile: '/tmp/sessions/dirty.jsonl',
        prompt: () => Promise.resolve(),
        dispose: () => Promise.resolve(),
        abort: () => Promise.resolve(),
        events: { subscribe: () => () => {} },
      });
    const deps = { ...makeDeps(), createSessionHandle };
    const issue = makeIssue();
    mockFetchIssues.mockResolvedValue([issue]);
    mockFetchStates.mockResolvedValue([]);
    mockEnsureWs.mockReturnValue({
      type: 'reused',
      workspace: { path: '/tmp/ws/TEST-1', workspace_key: 'TEST-1', created_now: false },
    });
    mockRenderPrompt.mockReturnValue({ type: 'rendered', content: 'prompt' });
    mockRunAgentSession.mockResolvedValue({ status: 'completed', turns: 1, error: null });
    mockInspectGitWorktree
      .mockResolvedValueOnce({ type: 'dirty', status: ' M src/file.ts' })
      .mockResolvedValueOnce({ type: 'clean' });

    await pollTick(state, config, deps);
    await flushAsyncWork();
    await flushAsyncWork();

    expect(createSessionHandle).toHaveBeenCalledTimes(2);
    expect(createSessionHandle).toHaveBeenNthCalledWith(
      2,
      '/tmp/ws/TEST-1',
      config,
      'TEST-1',
      '/tmp/sessions/dirty.jsonl',
    );
    expect(state.retry_attempts.get('issue-1')?.error).toBeNull();
    expect(state.retry_attempts.get('issue-1')?.session_file).toBe('/tmp/sessions/dirty.jsonl');
    expect(mockWriteWorkspaceRunState).toHaveBeenCalled();
  });

  it('releases when issue not found in candidates', async () => {
    const state = makeState();
    const config = makeConfig();
    const deps = makeDeps();
    mockFetchIssues.mockResolvedValue([makeIssue({ id: 'other' })]);

    const retryEntry: RetryEntry = {
      issue_id: 'issue-1',
      identifier: 'TEST-1',
      attempt: 1,
      due_at_ms: Date.now() - 1000,
      error: null,
      session_file: null,
      dirty_auto_resume_count: 0,
    };
    state.retry_attempts.set('issue-1', retryEntry);
    state.claimed.add('issue-1');

    await handleRetryFire(state, 'issue-1', config, deps);

    expect(state.retry_attempts.has('issue-1')).toBe(false);
    expect(state.running.has('issue-1')).toBe(false);
    expect(state.claimed.has('issue-1')).toBe(false);
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
    const deps = makeDeps();
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
      session_file: null,
      dirty_auto_resume_count: 0,
    };
    state.retry_attempts.set('issue-1', retryEntry);
    state.claimed.add('issue-1');

    await handleRetryFire(state, 'issue-1', config, deps);

    expect(state.retry_attempts.has('issue-1')).toBe(true);
    expect(state.retry_attempts.get('issue-1')?.error).toContain('no available orchestrator slots');
    expect(state.claimed.has('issue-1')).toBe(true);
  });

  it('no-op when retry entry not found', async () => {
    const state = makeState();
    const config = makeConfig();
    const deps = makeDeps();

    await handleRetryFire(state, 'non-existent', config, deps);
    expect(state.retry_attempts.size).toBe(0);
  });
});
