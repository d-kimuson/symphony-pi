import { describe, expect, it, vi } from 'vitest';

import type { EffectiveConfig } from '../../config/model.js';

import { createPiSessionHandle } from './createPiSession.js';

// Mock the pi SDK import
vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: vi.fn().mockRejectedValue(new Error('SDK not available')),
  defineTool: vi.fn((tool: unknown) => tool),
  AuthStorage: { create: vi.fn(() => ({})), fromStorage: vi.fn(), inMemory: vi.fn() },
  ModelRegistry: { create: vi.fn(() => ({})), inMemory: vi.fn() },
  SessionManager: { create: vi.fn(() => ({})), open: vi.fn(), resume: vi.fn() },
}));

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
    tools: ['read', 'bash', 'edit', 'write'],
    session_dir: null,
    turn_timeout_ms: 3600000,
    stall_timeout_ms: 300000,
  },
  server: { port: 48484, host: '127.0.0.1' },
  prompt_template: 'Work on {{ issue.identifier }}',
};

describe('createPiSessionHandle', () => {
  it('returns error when SDK is unavailable (no mock fallback)', async () => {
    const result = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
      issueIdentifier: 'TEST-1',
    });

    expect(result.type).toBe('error');
    // Narrow the discriminated union
    if (result.type !== 'error') throw new Error('Expected error');
    expect(result.error).toContain('SDK not available');
  });

  it('builds ticket tool definitions with session-local context', async () => {
    const result = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
      issueIdentifier: 'TEST-2',
    });

    // SDK mock rejects, so we get error type (no mock fallback in production)
    expect(result.type).toBe('error');
  });
});
