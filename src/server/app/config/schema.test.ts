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

  it('returns empty for valid github config', () => {
    const githubConfig: EffectiveConfig = {
      ...baseConfig,
      tracker: {
        kind: 'github',
        token: 'token',
        api_base_url: 'https://api.github.com',
        owner: 'my-org',
        repo: 'sample-a',
        state_source: 'labels',
        close_on_terminal: false,
        active_states: ['agent-ready'],
        terminal_states: ['done', 'closed'],
        handoff_states: ['human-review'],
        transition_states: ['agent-ready', 'done', 'closed', 'human-review'],
      },
    };
    expect(validateConfig(githubConfig)).toEqual([]);
  });

  it('reports unsupported tracker kind', () => {
    const config = {
      ...baseConfig,
      tracker: { kind: 'not-supported' },
    } as unknown as EffectiveConfig;
    const errors = validateConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Unsupported tracker kind');
  });

  it('allows empty linear tracker fields', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      tracker: {
        ...linearTracker,
        api_key: '',
        team_key: '',
        project_slug: '',
      },
    };
    expect(validateConfig(config)).toEqual([]);
  });

  it('allows empty jira tracker fields', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      tracker: {
        kind: 'jira',
        api_key: '',
        email: '',
        base_url: '',
        project_key: null,
        jql: null,
        active_states: ['Todo'],
        terminal_states: ['Closed'],
        handoff_states: [],
        transition_states: ['Todo', 'Closed'],
      },
    };
    expect(validateConfig(config)).toEqual([]);
  });

  it('allows empty github tracker fields', () => {
    const config: EffectiveConfig = {
      ...baseConfig,
      tracker: {
        kind: 'github',
        token: '',
        api_base_url: 'https://api.github.com',
        owner: '',
        repo: '',
        state_source: 'labels',
        close_on_terminal: false,
        active_states: ['agent-ready'],
        terminal_states: ['done'],
        handoff_states: [],
        transition_states: ['agent-ready', 'done'],
      },
    };
    expect(validateConfig(config)).toEqual([]);
  });

  it('reports invalid state_source for github', () => {
    const config = {
      ...baseConfig,
      tracker: {
        kind: 'github',
        token: 'token',
        api_base_url: 'https://api.github.com',
        owner: 'my-org',
        repo: 'sample-a',
        state_source: 'project_v2',
        close_on_terminal: false,
        active_states: ['agent-ready'],
        terminal_states: ['done'],
        handoff_states: [],
        transition_states: ['agent-ready', 'done'],
      },
    } as unknown as EffectiveConfig;
    expect(validateConfig(config).join('\n')).toContain('tracker.state_source');
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
