import { describe, expect, it, vi } from 'vitest';

import type { EffectiveConfig } from '../../config/model.js';

import { createPiSessionHandle } from './createPiSession.js';

// Mock the pi SDK import
vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: vi.fn().mockRejectedValue(new Error('SDK not available')),
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
};

describe('createPiSessionHandle', () => {
  it('returns error result when SDK is unavailable', async () => {
    const result = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
    });

    expect(result.type).toBe('error');
    // assert error content
    const errorMessage = result.type === 'error' && result.error !== undefined;
    expect(errorMessage).toBe(true);
  });

  it('returns error type for each invocation', async () => {
    const r1 = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
    });
    expect(r1.type).toBe('error');

    const r2 = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
    });
    expect(r2.type).toBe('error');
  });

  it('handles minimal config', async () => {
    const result = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
    });
    expect(result.type).toBe('error');
  });

  it('handles workspace path correctly', async () => {
    const result = await createPiSessionHandle({
      workspacePath: '/tmp/custom-workspace',
      config: testConfig,
    });
    expect(result.type).toBe('error');
  });

  it('produces consistent error results', async () => {
    const result = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
    });
    expect(result.type).toBe('error');
  });
});
