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
  it('falls back to mock session when SDK import fails', async () => {
    const handle = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
      tools: ['read', 'bash'],
    });

    expect(handle.sessionId).toContain('mock-session');
    expect(handle.prompt).toBeDefined();
    expect(handle.dispose).toBeDefined();
    expect(handle.events).toBeDefined();
  });

  it('creates session with valid sessionId', async () => {
    const handle = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
      tools: ['read'],
    });

    expect(typeof handle.sessionId).toBe('string');
    expect(handle.sessionId.length).toBeGreaterThan(0);
  });

  it('creates prompt method that resolves', async () => {
    const handle = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
      tools: ['read'],
    });

    await expect(handle.prompt('test message')).resolves.toBeUndefined();
  });

  it('supports event subscription and unsubscription', async () => {
    const handle = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
      tools: ['read'],
    });

    const handler = vi.fn();
    const unsubscribe = handle.events.subscribe(handler);

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('disposes session cleanly', async () => {
    const handle = await createPiSessionHandle({
      workspacePath: '/tmp/test-workspace',
      config: testConfig,
      tools: ['read'],
    });

    await expect(handle.dispose()).resolves.toBeUndefined();
  });
});
