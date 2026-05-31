import { describe, expect, it } from 'vitest';

import type { EffectiveConfig } from './app/config/model.ts';
import type { OrchestratorState } from './app/orchestrator/model.ts';
import type { ProjectRuntime } from './app/runtime/model.ts';

import { applyBootstrapFailurePolicy } from './bootstrapFailurePolicy.ts';

const runtimeState: OrchestratorState = {
  poll_interval_ms: 30000,
  max_concurrent_agents: 1,
  running: new Map(),
  claimed: new Set(),
  retry_attempts: new Map(),
  completed: new Set(),
  agent_totals: {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    seconds_running: 0,
  },
  agent_rate_limits: null,
};

const runtimeConfig: EffectiveConfig = {
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
  workspace: { root: '/tmp/workspaces', defaultBranch: 'main' },
  hooks: {
    after_create: null,
    before_run: null,
    after_run: null,
    before_remove: null,
    timeout_ms: 60000,
  },
  agent: {
    max_concurrent_agents: 1,
    max_turns: 10,
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
};

const projectRuntime: ProjectRuntime = {
  projectId: 'alpha',
  projectRoot: '/repos/alpha',
  workflowPath: '/repos/alpha/WORKFLOW.md',
  getConfig: () => runtimeConfig,
  getState: () => runtimeState,
  refresh: async () => {},
  shutdown: async () => {},
};

describe('applyBootstrapFailurePolicy', () => {
  it('returns the runtime unchanged on success', () => {
    expect(
      applyBootstrapFailurePolicy({
        runtime: 'dev',
        result: projectRuntime,
        failureMessage: 'unused',
      }),
    ).toEqual({ runtime: projectRuntime, warning: null });
  });

  it('throws in prod when bootstrap fails', () => {
    expect(() =>
      applyBootstrapFailurePolicy({
        runtime: 'prod',
        result: {
          type: 'bootstrap_error',
          phase: 'config_validation',
          message: 'Missing tracker.api_key',
        },
        failureMessage: '[symphony] bootstrap failed',
      }),
    ).toThrow('[symphony] bootstrap failed');
  });

  it('degrades gracefully in dev and test when bootstrap fails', () => {
    const devResult = applyBootstrapFailurePolicy({
      runtime: 'dev',
      result: {
        type: 'bootstrap_error',
        phase: 'config_validation',
        message: 'Missing tracker.api_key',
      },
      failureMessage: '[symphony] bootstrap failed',
    });

    const testResult = applyBootstrapFailurePolicy({
      runtime: 'test',
      result: {
        type: 'bootstrap_error',
        phase: 'config_validation',
        message: 'Missing tracker.api_key',
      },
      failureMessage: '[symphony] bootstrap failed',
    });

    expect(devResult).toEqual({
      runtime: null,
      warning:
        '[symphony] bootstrap failed (continuing without project runtime because SYMPHONY_RUNTIME=dev)',
    });
    expect(testResult).toEqual({
      runtime: null,
      warning:
        '[symphony] bootstrap failed (continuing without project runtime because SYMPHONY_RUNTIME=test)',
    });
  });
});
