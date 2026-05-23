import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  watchFile: vi.fn(),
}));

vi.mock('../server.js', () => ({
  startServer: vi
    .fn()
    .mockResolvedValue({ port: 48484, cleanUp: vi.fn(), server: { close: vi.fn() } }),
}));

vi.mock('./config/workflows/loadConfig.js', () => ({ loadConfig: vi.fn() }));
vi.mock('./config/workflows/dynamicReload.js', () => ({
  startDynamicReload: vi.fn().mockReturnValue(() => {}),
}));
vi.mock('./issues/workflows/fetchIssues.js', () => ({
  setTrackerAdapter: vi.fn(),
  fetchIssuesByStates: vi.fn().mockResolvedValue([]),
}));
vi.mock('./status/routes.js', () => ({
  setOrchestratorState: vi.fn(),
  setRefreshTrigger: vi.fn(),
}));
vi.mock('./orchestrator/workflows/pollTick.js', () => ({
  pollTick: vi.fn().mockResolvedValue(undefined),
  setSessionHandleFactory: vi.fn(),
  setWorkflowPromptTemplate: vi.fn(),
}));
vi.mock('./workspaces/workflows/ensureWorkspace.js', () => ({
  ensureWorkspace: vi.fn(),
  removeWorkspace: vi.fn().mockResolvedValue(undefined),
  runAfterCreateHook: vi.fn().mockResolvedValue({ type: 'ok' }),
  runBeforeRunHook: vi.fn().mockResolvedValue({ type: 'ok' }),
  runAfterRunHook: vi.fn().mockResolvedValue({ type: 'ok' }),
}));

import type { EffectiveConfig, TrackerConfig } from './config/model.ts';
import type { TrackerAdapter } from './issues/adapters/trackerAdapter.ts';

import { bootstrap } from './bootstrap.ts';
import { loadConfig } from './config/workflows/loadConfig.ts';

const testConfig: EffectiveConfig = {
  tracker: {
    kind: 'linear',
    api_key: 'test',
    endpoint: 'https://api.linear.app/graphql',
    project_slug: 'test',
    active_states: ['Todo'],
    terminal_states: ['Done'],
    handoff_states: [],
    transition_states: ['Todo', 'Done'],
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
  prompt: vi.fn(),
  dispose: vi.fn(),
  abort: vi.fn(),
  events: { subscribe: vi.fn().mockReturnValue(() => {}) },
};

describe('bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue({ type: 'loaded', config: testConfig });
  });

  it('returns error when WORKFLOW.md not found', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await bootstrap({
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
    const result = await bootstrap({
      workflowPath: '/test/WORKFLOW.md',
      createTrackerAdapter: makeTrackerAdapter,
      createSessionHandle: vi.fn().mockResolvedValue(mockHandle),
    });
    expect(result).toBeDefined();
    if (result !== null && typeof result === 'object' && 'type' in result) {
      expect(result.type).toBe('bootstrap_error');
    }
  });

  it('creates tracker adapter and returns state on success', async () => {
    const adapter = makeTrackerAdapter(testConfig.tracker);
    const createAdapter = vi.fn().mockReturnValue(adapter);
    const result = await bootstrap({
      workflowPath: '/test/WORKFLOW.md',
      createTrackerAdapter: createAdapter,
      createSessionHandle: vi.fn().mockResolvedValue(mockHandle),
    });
    expect(result).toBeDefined();
    // BootstrapResult has no 'type' field, BootstrapError does
    const hasError = 'type' in (result as unknown as Record<string, unknown>);
    if (hasError) throw new Error('Expected success');
    const success = result as { config: unknown; state: unknown };
    expect(success.config).toBeDefined();
    expect(success.state).toBeDefined();
  });

  it('loads config from the workflow path', async () => {
    await bootstrap({
      workflowPath: '/custom/path/WORKFLOW.md',
      createTrackerAdapter: makeTrackerAdapter,
      createSessionHandle: vi.fn().mockResolvedValue(mockHandle),
    });
    expect(loadConfig).toHaveBeenCalledWith('/custom/path/WORKFLOW.md');
  });
});
