import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
}));

vi.mock('./config/workflows/loadConfig.js', () => ({ loadConfig: vi.fn() }));
vi.mock('./config/workflows/dynamicReload.js', () => ({
  startDynamicReload: vi.fn().mockReturnValue(() => {}),
}));
vi.mock('./issues/workflows/fetchIssues.js', () => ({
  fetchIssuesByStates: vi.fn().mockResolvedValue([]),
}));
vi.mock('./orchestrator/workflows/pollTick.js', () => ({
  pollTick: vi.fn().mockResolvedValue(undefined),
  handleRetryFire: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./workspaces/workflows/ensureWorkspace.js', () => ({
  removeWorkspace: vi.fn().mockResolvedValue(undefined),
}));

import type { EffectiveConfig, TrackerConfig } from './config/model.ts';
import type { TrackerAdapter } from './issues/adapters/trackerAdapter.ts';

import { bootstrapProjectRuntime } from './bootstrap.ts';
import { loadConfig } from './config/workflows/loadConfig.ts';
import { pollTick } from './orchestrator/workflows/pollTick.ts';

const testConfig: EffectiveConfig = {
  tracker: {
    kind: 'linear',
    api_key: 'test',
    endpoint: 'https://api.linear.app/graphql',
    team_key: 'ENG',
    project_slug: 'test',
    active_states: ['Todo'],
    terminal_states: ['Done'],
    handoff_states: [],
    transition_states: ['Todo', 'Done'],
  },
  polling: { interval_ms: 30000 },
  workspace: { root: '/tmp/symphony', defaultBranch: 'main' },
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
    tools: ['read'],
    session_dir: null,
    turn_timeout_ms: 3600000,
    stall_timeout_ms: 300000,
  },
  server: { port: 48484, host: '127.0.0.1' },
  prompt_template: 'Work on {{ issue.identifier }}',
};

const makeTrackerAdapter = (_config: TrackerConfig): TrackerAdapter => ({
  fetchCandidateIssues: vi.fn().mockResolvedValue([]),
  fetchIssuesByStates: vi.fn().mockResolvedValue([]),
  fetchIssueStatesByIds: vi.fn().mockResolvedValue([]),
});

const mockHandle = {
  sessionId: 'test',
  sessionFile: null,
  prompt: vi.fn(),
  dispose: vi.fn(),
  abort: vi.fn(),
  events: { subscribe: vi.fn().mockReturnValue(() => {}) },
};

describe('bootstrapProjectRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue({ type: 'loaded', config: testConfig });
  });

  it('returns error when WORKFLOW.md not found', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await bootstrapProjectRuntime({
      projectId: 'alpha',
      projectRoot: '/missing',
      workflowPath: '/missing/WORKFLOW.md',
      createTrackerAdapter: makeTrackerAdapter,
      createSessionHandle: vi.fn().mockResolvedValue(mockHandle),
    });
    expect(result).toBeDefined();
    if (result !== null && typeof result === 'object' && 'type' in result) {
      expect(result.type).toBe('bootstrap_error');
    }
  });

  it('returns error when config validation fails', async () => {
    vi.mocked(loadConfig).mockReturnValue({ type: 'error', error: 'Invalid config' });
    const result = await bootstrapProjectRuntime({
      projectId: 'alpha',
      projectRoot: '/test',
      workflowPath: '/test/WORKFLOW.md',
      createTrackerAdapter: makeTrackerAdapter,
      createSessionHandle: vi.fn().mockResolvedValue(mockHandle),
    });
    expect(result).toBeDefined();
    if (result !== null && typeof result === 'object' && 'type' in result) {
      expect(result.type).toBe('bootstrap_error');
    }
  });

  it('creates a project runtime on success', async () => {
    const adapter = makeTrackerAdapter(testConfig.tracker);
    const createAdapter = vi.fn().mockReturnValue(adapter);
    const result = await bootstrapProjectRuntime({
      projectId: 'alpha',
      projectRoot: '/test',
      workflowPath: '/test/WORKFLOW.md',
      createTrackerAdapter: createAdapter,
      createSessionHandle: vi.fn().mockResolvedValue(mockHandle),
    });
    expect(result).toBeDefined();
    if ('type' in result) throw new Error('Expected success');
    expect(result.projectId).toBe('alpha');
    expect(result.workflowPath).toBe('/test/WORKFLOW.md');
    expect(result.getConfig()).toBe(testConfig);
    expect(result.getState()).toBeDefined();
  });

  it('loads config from the workflow path', async () => {
    await bootstrapProjectRuntime({
      projectId: 'alpha',
      projectRoot: '/custom/path',
      workflowPath: '/custom/path/WORKFLOW.md',
      createTrackerAdapter: makeTrackerAdapter,
      createSessionHandle: vi.fn().mockResolvedValue(mockHandle),
    });
    expect(loadConfig).toHaveBeenCalledWith('/custom/path/WORKFLOW.md');
  });

  it('refresh triggers pollTick for only that runtime', async () => {
    const alpha = await bootstrapProjectRuntime({
      projectId: 'alpha',
      projectRoot: '/alpha',
      workflowPath: '/alpha/WORKFLOW.md',
      createTrackerAdapter: makeTrackerAdapter,
      createSessionHandle: vi.fn().mockResolvedValue(mockHandle),
    });
    const beta = await bootstrapProjectRuntime({
      projectId: 'beta',
      projectRoot: '/beta',
      workflowPath: '/beta/WORKFLOW.md',
      createTrackerAdapter: makeTrackerAdapter,
      createSessionHandle: vi.fn().mockResolvedValue(mockHandle),
    });

    if ('type' in alpha || 'type' in beta) throw new Error('Expected success');
    vi.mocked(pollTick).mockClear();

    await alpha.refresh();

    expect(pollTick).toHaveBeenCalledTimes(1);
    const deps = vi.mocked(pollTick).mock.calls[0]?.[2];
    expect(deps?.projectId).toBe('alpha');
  });
});
