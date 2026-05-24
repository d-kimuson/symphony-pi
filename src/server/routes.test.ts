import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { HonoContext } from './app.ts';

import { createProjectRegistry, type ProjectRuntime } from './app/runtime/model.ts';
import { routes } from './routes.ts';

describe('routes', () => {
  const makeApp = (): Hono<HonoContext> => new Hono<HonoContext>();
  const makeRuntime = (): ProjectRuntime => ({
    projectId: 'alpha',
    projectRoot: '/repos/alpha',
    workflowPath: '/repos/alpha/WORKFLOW.md',
    getConfig: () => ({
      tracker: {
        kind: 'linear',
        api_key: 'test',
        endpoint: 'https://api.linear.app/graphql',
        team_key: 'ENG',
        project_slug: 'alpha',
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
        tools: [],
        session_dir: null,
        turn_timeout_ms: 1000,
        stall_timeout_ms: 1000,
      },
      server: { port: 48484, host: '127.0.0.1' },
      workflow: {
        path: '/repos/alpha/WORKFLOW.md',
        dir: '/repos/alpha',
      },
      prompt_template: null,
    }),
    getState: () => ({
      poll_interval_ms: 30000,
      max_concurrent_agents: 10,
      running: new Map(),
      claimed: new Set(),
      retry_attempts: new Map(),
      completed: new Set(),
      agent_totals: { input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0 },
      agent_rate_limits: null,
    }),
    refresh: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
  });

  it('returns the GET /info route', async () => {
    const app = makeApp();
    routes(app, createProjectRegistry('single-project', [makeRuntime()]));
    const res = await app.request('/info');
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toEqual({
      status: 'healthy',
      server: 'symphony-pi',
      mode: 'single-project',
      projects: 1,
    });
  });

  it('returns 404 for unknown routes', async () => {
    const app = makeApp();
    routes(app, createProjectRegistry('single-project', [makeRuntime()]));
    const res = await app.request('/unknown');
    expect(res.status).toBe(404);
  });
});
