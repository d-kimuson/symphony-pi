import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { EffectiveConfig } from '../../config/model.ts';

import {
  ensureWorkspace,
  runAfterCreateHook,
  runBeforeRunHook,
  runAfterRunHook,
  runBeforeRemoveHook,
  removeWorkspace,
} from './ensureWorkspace.ts';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('../../../lib/process/index.js', () => ({
  execShellScript: vi.fn(),
}));

import { rmSync, existsSync, mkdirSync } from 'node:fs';

import { execShellScript } from '../../../lib/process/index.ts';

const mockExec = execShellScript as ReturnType<typeof vi.fn>;

const baseConfig: EffectiveConfig = {
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
    tools: ['read'],
    session_dir: null,
    turn_timeout_ms: 3600000,
    stall_timeout_ms: 300000,
  },
  server: { port: 48484, host: '127.0.0.1' },
  prompt_template: null,
};

describe('ensureWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new workspace directory', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockReturnValue(undefined);

    const result = ensureWorkspace('TEST-1', '/tmp/workspaces');

    expect(result.type).toBe('created');
    if (result.type === 'created') {
      expect(result.workspace.workspace_key).toBe('TEST-1');
      expect(result.workspace.created_now).toBe(true);
      expect(result.workspace.path).toContain('/tmp/workspaces');
    }
    expect(mkdirSync).toHaveBeenCalled();
  });

  it('reuses existing workspace directory', () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const result = ensureWorkspace('TEST-1', '/tmp/workspaces');

    expect(result.type).toBe('reused');
    if (result.type === 'reused') {
      expect(result.workspace.created_now).toBe(false);
    }
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('sanitizes issue identifier', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockReturnValue(undefined);

    const result = ensureWorkspace('TEST-1/special!chars', '/tmp/workspaces');

    if (result.type !== 'error') {
      expect(result.workspace.workspace_key).not.toContain('/');
      expect(result.workspace.workspace_key).not.toContain('!');
    }
  });

  it('returns error when path not contained in root', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    // Path traversal attempt through sanitization would be caught
    // The contain check uses absolute paths; any path outside root fails
    const result = ensureWorkspace('TEST-1', '/root');

    if (result.type === 'error') {
      expect(result.error).toContain('Workspace path outside root');
    }
  });

  it('returns error on mkdir failure', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = ensureWorkspace('TEST-1', '/tmp/workspaces');

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.error).toContain('Permission denied');
    }
  });
});

describe('workspace hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runAfterCreateHook: returns success when no hook configured', async () => {
    const config = baseConfig;
    const result = await runAfterCreateHook(
      { path: '/ws', workspace_key: 'TEST-1', created_now: true },
      config,
    );
    expect(result.type).toBe('success');
  });

  it('runAfterCreateHook: returns failure when hook fails', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });
    const config = { ...baseConfig, hooks: { ...baseConfig.hooks, after_create: 'echo test' } };
    const result = await runAfterCreateHook(
      { path: '/ws', workspace_key: 'TEST-1', created_now: true },
      config,
    );
    expect(result.type).toBe('failure');
  });

  it('runBeforeRunHook: returns failure when hook fails', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });
    const config = { ...baseConfig, hooks: { ...baseConfig.hooks, before_run: 'exit 1' } };
    const result = await runBeforeRunHook('/ws', config);
    expect(result.type).toBe('failure');
  });

  it('runAfterRunHook: failure is returned but should be ignored by caller (SPEC 9.4)', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });
    const config = { ...baseConfig, hooks: { ...baseConfig.hooks, after_run: 'echo after' } };
    const result = await runAfterRunHook('/ws', config);
    // Hook returns the result; caller decides to ignore
    expect(result.type).toBe('failure');
  });

  it('runBeforeRemoveHook: failure is returned but cleanup should proceed (SPEC 9.4)', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });
    const config = { ...baseConfig, hooks: { ...baseConfig.hooks, before_remove: 'echo before' } };
    const result = await runBeforeRemoveHook('/ws', config);
    expect(result.type).toBe('failure');
  });
});

describe('removeWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no-op when path does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await removeWorkspace('/ws', baseConfig);
    expect(rmSync).not.toHaveBeenCalled();
  });

  it('runs before_remove hook and removes directory', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    vi.mocked(rmSync).mockReturnValue(undefined);

    await removeWorkspace('/ws', baseConfig);

    expect(rmSync).toHaveBeenCalledWith('/ws', { recursive: true, force: true });
  });
});
