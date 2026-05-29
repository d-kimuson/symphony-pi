import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EffectiveConfig } from '../../config/model.ts';

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
    model: 'anthropic/claude-test',
    thinking: 'medium',
    tools: ['read', 'bash'],
    session_dir: '/tmp/sessions',
    turn_timeout_ms: 3600000,
    stall_timeout_ms: 300000,
  },
  server: { port: 48484, host: '127.0.0.1' },
  prompt_template: 'Work on {{ issue.identifier }}',
};

const { mockCreateAgentSession, mockSession, mockSessionManagerOpen } = vi.hoisted(() => {
  const s = {
    sessionId: 'test-session-id',
    sessionFile: '/tmp/sessions/test-session.jsonl',
    prompt: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    abort: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
  };
  return {
    mockCreateAgentSession: vi.fn().mockResolvedValue({ session: s, extensionsResult: {} }),
    mockSession: s,
    mockSessionManagerOpen: vi.fn(() => ({})),
  };
});

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: mockCreateAgentSession,
  defineTool: vi.fn((tool: unknown) => tool),
  AuthStorage: { create: vi.fn(() => ({})), fromStorage: vi.fn(), inMemory: vi.fn() },
  ModelRegistry: {
    create: vi.fn(() => ({ find: vi.fn(), getAll: vi.fn(() => []) })),
    inMemory: vi.fn(),
  },
  SessionManager: { create: vi.fn(() => ({})), open: mockSessionManagerOpen, resume: vi.fn() },
}));

import { ModelRegistry } from '@earendil-works/pi-coding-agent';

import { createPiSessionHandle } from './createPiSession.ts';

describe('createPiSessionHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentSession.mockResolvedValue({ session: mockSession, extensionsResult: {} });
  });

  it('returns error when SDK fails (no mock fallback)', async () => {
    mockCreateAgentSession.mockRejectedValueOnce(new Error('SDK failure'));
    const result = await createPiSessionHandle({
      workspacePath: '/tmp/ws',
      config: { ...testConfig, pi: { ...testConfig.pi, model: null } },
      issueIdentifier: 'TEST-1',
    });
    expect(result.type).toBe('error');
    if (result.type !== 'error') throw new Error('Expected error');
    expect(result.error).toContain('SDK failure');
  });

  it('resolves model and creates session', async () => {
    // Pre-configure the registry that will be created inside the function
    const mockFind = vi.fn().mockReturnValue({
      provider: 'anthropic',
      id: 'claude-test',
      name: 'C',
      api: 'anthropic_messages' as const,
      baseUrl: 'url',
      reasoning: false,
      input: ['text' as const],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1000,
      maxTokens: 100,
    });
    // eslint-disable-next-line typescript/unbound-method -- vi mocking pattern
    vi.mocked(ModelRegistry.create).mockReturnValue({
      find: mockFind,
      getAll: vi.fn(() => []),
    } as never);

    const result = await createPiSessionHandle({
      workspacePath: '/tmp/ws',
      config: testConfig,
      issueIdentifier: 'TEST-1',
    });
    expect(result.type).toBe('created');
    if (result.type !== 'created') throw new Error('Expected created');
    expect(result.handle.sessionId).toBe('test-session-id');
    expect(result.handle.sessionFile).toBe('/tmp/sessions/test-session.jsonl');
  });

  it('omits tools when pi.tools is empty so pi defaults stay unrestricted', async () => {
    const result = await createPiSessionHandle({
      workspacePath: '/tmp/ws',
      config: { ...testConfig, pi: { ...testConfig.pi, model: null, tools: [] } },
      issueIdentifier: 'TEST-1',
    });

    expect(result.type).toBe('created');
    expect(mockCreateAgentSession).toHaveBeenCalledTimes(1);
    const sessionOpts = mockCreateAgentSession.mock.calls[0]?.[0];
    expect(sessionOpts).toBeDefined();
    expect(sessionOpts).not.toHaveProperty('tools');
  });

  it('opens an existing session file when resumeSessionFile is provided', async () => {
    const result = await createPiSessionHandle({
      workspacePath: '/tmp/ws',
      config: { ...testConfig, pi: { ...testConfig.pi, model: null, tools: [] } },
      issueIdentifier: 'TEST-1',
      resumeSessionFile: '/tmp/sessions/existing.jsonl',
    });

    expect(result.type).toBe('created');
    expect(mockSessionManagerOpen).toHaveBeenCalledWith(
      '/tmp/sessions/existing.jsonl',
      '/tmp/sessions',
      '/tmp/ws',
    );
  });

  it('adds ticket tools when pi.tools allowlist is configured', async () => {
    const result = await createPiSessionHandle({
      workspacePath: '/tmp/ws',
      config: { ...testConfig, pi: { ...testConfig.pi, model: null, tools: ['read', 'bash'] } },
      issueIdentifier: 'TEST-1',
    });

    expect(result.type).toBe('created');
    expect(mockCreateAgentSession).toHaveBeenCalledTimes(1);
    const sessionOpts = mockCreateAgentSession.mock.calls[0]?.[0];
    expect(sessionOpts).toMatchObject({
      tools: ['read', 'bash', 'ticket_get', 'ticket_comment', 'ticket_transition'],
    });
  });

  it('returns error when model not found', async () => {
    // eslint-disable-next-line typescript/unbound-method -- vi mocking pattern
    vi.mocked(ModelRegistry.create).mockReturnValue({
      find: vi.fn().mockReturnValue(undefined),
      getAll: vi.fn(() => []),
    } as never);

    const result = await createPiSessionHandle({
      workspacePath: '/tmp/ws',
      config: { ...testConfig, pi: { ...testConfig.pi, model: 'unknown/x' } },
      issueIdentifier: 'TEST-1',
    });
    expect(result.type).toBe('error');
    if (result.type !== 'error') throw new Error('Expected error');
    expect(result.error).toContain('Model not found');
  });
});
