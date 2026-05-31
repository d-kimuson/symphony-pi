import { describe, expect, it, vi } from 'vitest';

import type { OrchestratorState } from '../../orchestrator/model.ts';

import { createProjectRegistry, type ProjectRuntime } from '../../runtime/model.ts';
import {
  buildAggregateRuntimeSnapshot,
  buildProjectStateSnapshot,
  buildProjectsSnapshot,
} from './runtimeSnapshot.ts';

const makeState = (): OrchestratorState => ({
  poll_interval_ms: 30000,
  max_concurrent_agents: 10,
  running: new Map(),
  claimed: new Set(),
  retry_attempts: new Map(),
  completed: new Set(),
  agent_totals: {
    input_tokens: 500,
    output_tokens: 250,
    total_tokens: 750,
    seconds_running: 120,
  },
  agent_rate_limits: null,
});

const makeProject = (projectId: string, state: OrchestratorState): ProjectRuntime => ({
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
    polling: { interval_ms: state.poll_interval_ms },
    workspace: { root: '/tmp/workspaces', defaultBranch: 'main' },
    hooks: {
      after_create: null,
      before_run: null,
      after_run: null,
      before_remove: null,
      timeout_ms: 60000,
    },
    agent: {
      max_concurrent_agents: state.max_concurrent_agents,
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
  getState: () => state,
  refresh: vi.fn(async () => {}),
  shutdown: vi.fn(async () => {}),
});

describe('runtime snapshots', () => {
  it('returns empty aggregate snapshot for empty registry', () => {
    const registry = createProjectRegistry('single-project', []);
    const snapshot = buildAggregateRuntimeSnapshot(registry);
    expect(snapshot.counts.projects).toBe(0);
    expect(snapshot.counts.running).toBe(0);
    expect(snapshot.retrying).toEqual([]);
  });

  it('includes project-local running entries', () => {
    const state = makeState();
    state.running.set('i1', {
      issue_id: 'i1',
      issue_identifier: 'TEST-1',
      workspace_path: '/ws/TEST-1',
      issue_state: 'Todo',
      started_at: Date.now(),
      attempt: null,
      session_id: null,
      session_file: null,
      dirty_auto_resume_count: 0,
      turn_count: 3,
      abortController: new AbortController(),
    });

    const snapshot = buildProjectStateSnapshot(makeProject('alpha', state));
    expect(snapshot.counts.running).toBe(1);
    expect(snapshot.running[0]?.project_id).toBe('alpha');
    expect(snapshot.running[0]?.turn_count).toBe(3);
  });

  it('includes retry entries in aggregate snapshots', () => {
    const alpha = makeState();
    alpha.retry_attempts.set('i2', {
      issue_id: 'i2',
      identifier: 'TEST-2',
      attempt: 2,
      due_at_ms: Date.now() + 5000,
      error: 'timeout',
      session_file: null,
      dirty_auto_resume_count: 0,
    });
    const beta = makeState();

    const registry = createProjectRegistry('multi-project', [
      makeProject('alpha', alpha),
      makeProject('beta', beta),
    ]);
    const snapshot = buildAggregateRuntimeSnapshot(registry);
    expect(snapshot.counts.projects).toBe(2);
    expect(snapshot.counts.retrying).toBe(1);
    expect(snapshot.retrying[0]?.project_id).toBe('alpha');
  });

  it('builds project summaries', () => {
    const alpha = makeState();
    alpha.completed.add('done-1');
    const registry = createProjectRegistry('single-project', [makeProject('alpha', alpha)]);

    const snapshot = buildProjectsSnapshot(registry);
    expect(snapshot.mode).toBe('single-project');
    expect(snapshot.projects[0]?.project_id).toBe('alpha');
    expect(snapshot.projects[0]?.counts.completed).toBe(1);
  });
});
