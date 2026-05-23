import { describe, expect, it } from 'vitest';

import type { EffectiveConfig, LinearTrackerConfig } from './model.ts';

import { validateConfig } from './schema.ts';

const linearTracker: LinearTrackerConfig = {
  kind: 'linear',
  api_key: 'lin_key',
  endpoint: 'https://api.linear.app/graphql',
  team_key: 'ENG',
  project_slug: 'my-project',
  active_states: ['Todo', 'In Progress'],
  terminal_states: ['Closed', 'Cancelled', 'Done'],
  handoff_states: [],
  transition_states: ['Todo', 'In Progress', 'Closed', 'Cancelled', 'Done'],
};

const baseConfig: EffectiveConfig = {
  tracker: linearTracker,
  polling: { interval_ms: 30000 },
  workspace: { root: '/tmp/ws' },
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
  server: {
    port: 48484,
    host: '127.0.0.1',
  },
};

describe('validateConfig', () => {
  it('returns empty for valid linear config', () => {
    expect(validateConfig(baseConfig)).toEqual([]);
  });

  it('returns empty for valid jira config', () => {
    const jiraConfig: EffectiveConfig = {
      ...baseConfig,
      tracker: {
        kind: 'jira',
        api_key: 'token',
        email: 'user@example.com',
        base_url: 'https://example.atlassian.net',
        project_key: 'PROJ',
        jql: null,
        active_states: ['Todo'],
        terminal_states: ['Closed'],
        handoff_states: [],
        transition_states: ['Todo', 'Closed'],
      },
    };
    expect(validateConfig(jiraConfig)).toEqual([]);
  });

  it('validates jira config with jql instead of project_key', () => {
    const jiraConfig: EffectiveConfig = {
      ...baseConfig,
      tracker: {
        kind: 'jira',
        api_key: 'token',
        email: 'user@example.com',
        base_url: 'https://example.atlassian.net',
        project_key: null,
        jql: 'project = PROJ',
        active_states: ['Todo'],
        terminal_states: ['Closed'],
        handoff_states: [],
        transition_states: ['Todo', 'Closed'],
      },
    };
    expect(validateConfig(jiraConfig)).toEqual([]);
  });

  it('reports unsupported tracker kind', () => {
    const config = { ...baseConfig, tracker: { kind: 'github' } } as unknown as EffectiveConfig;
    const errors = validateConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Unsupported tracker kind');
  });

  it('reports missing api_key', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      tracker: { ...linearTracker, api_key: '' },
    };
    const errors = validateConfig(config);
    expect(errors).toContain('Missing tracker.api_key');
  });

  it('reports missing team_key for linear', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      tracker: { ...linearTracker, team_key: '' },
    };
    const errors = validateConfig(config);
    expect(errors).toContain('Missing tracker.team_key (required for Linear)');
  });

  it('reports missing project_slug for linear', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      tracker: { ...linearTracker, project_slug: '' },
    };
    const errors = validateConfig(config);
    expect(errors).toContain('Missing tracker.project_slug (required for Linear)');
  });

  it('reports missing base_url for jira', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      tracker: {
        kind: 'jira',
        api_key: 'token',
        email: 'user@example.com',
        base_url: '',
        project_key: 'PROJ',
        jql: null,
        active_states: ['Todo'],
        terminal_states: ['Closed'],
        handoff_states: [],
        transition_states: ['Todo', 'Closed'],
      },
    };
    expect(validateConfig(config)).toContain('Missing tracker.base_url (required for Jira)');
  });

  it('reports missing email for jira', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      tracker: {
        kind: 'jira',
        api_key: 'token',
        email: '',
        base_url: 'https://example.atlassian.net',
        project_key: 'PROJ',
        jql: null,
        active_states: ['Todo'],
        terminal_states: ['Closed'],
        handoff_states: [],
        transition_states: ['Todo', 'Closed'],
      },
    };
    expect(validateConfig(config)).toContain('Missing tracker.email (required for Jira)');
  });

  it('reports missing both project_key and jql for jira', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      tracker: {
        kind: 'jira',
        api_key: 'token',
        email: 'user@example.com',
        base_url: 'https://example.atlassian.net',
        project_key: null,
        jql: null,
        active_states: ['Todo'],
        terminal_states: ['Closed'],
        handoff_states: [],
        transition_states: ['Todo', 'Closed'],
      },
    };
    expect(validateConfig(config)).toContain(
      'Either tracker.project_key or tracker.jql is required for Jira',
    );
  });

  it('reports non-positive max_turns', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      agent: { ...baseConfig.agent, max_turns: 0 },
    };
    expect(validateConfig(config)).toContain('agent.max_turns must be positive');
  });

  it('reports non-positive hooks.timeout_ms', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      hooks: { ...baseConfig.hooks, timeout_ms: 0 },
    };
    expect(validateConfig(config)).toContain('hooks.timeout_ms must be positive');
  });

  it('reports invalid port', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      prompt_template: null,
      server: { ...baseConfig.server, port: 0 },
    };
    expect(validateConfig(config)).toContain('server.port must be between 1 and 65535');
  });
});
