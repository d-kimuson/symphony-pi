import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { HonoContext } from './app.ts';

import { createProjectRegistry, type ProjectRuntime } from './app/runtime/model.ts';
import { mountStatusRoutes } from './app/status/routes.ts';
import { routes } from './routes.ts';

const makeApp = (): Hono<HonoContext> => new Hono<HonoContext>();

const makeRuntime = (projectId: string): ProjectRuntime => ({
  projectId,
  projectRoot: `/repos/${projectId}`,
  workflowPath: `/repos/${projectId}/WORKFLOW.md`,
  getConfig: () => ({
    tracker: {
      kind: 'linear',
      api_key: 'test',
      endpoint: 'https://api.linear.app/graphql',
      team_key: 'ENG',
      project_slug: projectId,
      active_states: ['Todo'],
      terminal_states: ['Done'],
      handoff_states: [],
      transition_states: ['Todo', 'Done'],
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
      tools: [],
      session_dir: null,
      turn_timeout_ms: 1000,
      stall_timeout_ms: 1000,
    },
    server: { port: 48484, host: '127.0.0.1' },
    workflow: {
      path: `/repos/${projectId}/WORKFLOW.md`,
      dir: `/repos/${projectId}`,
    },
    prompt_template: null,
  }),
  getState: () => ({
    poll_interval_ms: 30000,
    max_concurrent_agents: 10,
    running: new Map([
      [
        `issue-${projectId}`,
        {
          issue_id: `issue-${projectId}`,
          issue_identifier: `${projectId.toUpperCase()}-1`,
          issue_state: 'Todo',
          workspace_path: `/tmp/${projectId}`,
          started_at: Date.now(),
          attempt: null,
          session_id: null,
          session_file: null,
          dirty_auto_resume_count: 0,
          turn_count: 1,
          abortController: new AbortController(),
        },
      ],
    ]),
    claimed: new Set(),
    retry_attempts: new Map(),
    completed: new Set(),
    agent_totals: { input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0 },
    agent_rate_limits: null,
  }),
  refresh: vi.fn(async () => {}),
  shutdown: vi.fn(async () => {}),
});

describe('routes (status API)', () => {
  it('GET /api/v1/state returns aggregate snapshot', async () => {
    const app = makeApp();
    const registry = createProjectRegistry('single-project', [makeRuntime('alpha')]);
    mountStatusRoutes(app, registry);
    const res = await app.request('/api/v1/state');
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('generated_at');
    expect(body).toHaveProperty('counts');
    expect(body).toHaveProperty('running');
    expect(body).toHaveProperty('retrying');
  });

  it('GET /api/v1/projects returns project list', async () => {
    const app = makeApp();
    const registry = createProjectRegistry('multi-project', [
      makeRuntime('alpha'),
      makeRuntime('beta'),
    ]);
    mountStatusRoutes(app, registry);
    const res = await app.request('/api/v1/projects');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(2);
  });

  it('GET /api/v1/projects/:projectId/state returns per-project snapshot', async () => {
    const app = makeApp();
    const registry = createProjectRegistry('multi-project', [makeRuntime('alpha')]);
    mountStatusRoutes(app, registry);
    const res = await app.request('/api/v1/projects/alpha/state');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project_id).toBe('alpha');
    expect(body.counts.running).toBe(1);
  });

  it('GET /api/v1/:identifier returns 400 in multi-project mode', async () => {
    const app = makeApp();
    const registry = createProjectRegistry('multi-project', [
      makeRuntime('alpha'),
      makeRuntime('beta'),
    ]);
    mountStatusRoutes(app, registry);
    const res = await app.request('/api/v1/ALPHA-1');
    expect(res.status).toBe(400);
  });

  it('POST /api/v1/projects/:projectId/refresh triggers only that project', async () => {
    const app = makeApp();
    const alpha = makeRuntime('alpha');
    const beta = makeRuntime('beta');
    const registry = createProjectRegistry('multi-project', [alpha, beta]);
    mountStatusRoutes(app, registry);
    const res = await app.request('/api/v1/projects/alpha/refresh', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(alpha.refresh).toHaveBeenCalledTimes(1);
    expect(beta.refresh).not.toHaveBeenCalled();
  });

  it('POST /api/v1/refresh returns acknowledged', async () => {
    const app = makeApp();
    const alpha = makeRuntime('alpha');
    const beta = makeRuntime('beta');
    const registry = createProjectRegistry('multi-project', [alpha, beta]);
    mountStatusRoutes(app, registry);
    const res = await app.request('/api/v1/refresh', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(alpha.refresh).toHaveBeenCalledTimes(1);
    expect(beta.refresh).toHaveBeenCalledTimes(1);
  });

  it('GET /info still works', async () => {
    const app = makeApp();
    const registry = createProjectRegistry('single-project', [makeRuntime('alpha')]);
    routes(app, registry);
    const res = await app.request('/info');
    expect(res.status).toBe(200);
  });
});
