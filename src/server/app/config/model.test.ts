import { describe, expect, it } from 'vitest';

import type {
  EffectiveConfig,
  GitHubTrackerConfig,
  JiraTrackerConfig,
  LinearTrackerConfig,
} from './model.ts';

describe('TrackerConfig (discriminated union)', () => {
  it('LinearTrackerConfig has kind linear', () => {
    const cfg: LinearTrackerConfig = {
      kind: 'linear',
      api_key: 'key',
      endpoint: 'https://api.linear.app/graphql',
      team_key: 'ENG',
      project_slug: 'my-project',
      active_states: ['Todo'],
      terminal_states: ['Done'],
      handoff_states: [],
      transition_states: ['Todo', 'Done'],
    };
    expect(cfg.kind).toBe('linear');
    expect(cfg.project_slug).toBe('my-project');
  });

  it('JiraTrackerConfig has kind jira', () => {
    const cfg: JiraTrackerConfig = {
      kind: 'jira',
      api_key: 'token',
      email: 'user@example.com',
      base_url: 'https://example.atlassian.net',
      project_key: 'PROJ',
      jql: null,
      active_states: ['In Progress'],
      terminal_states: ['Closed'],
      handoff_states: ['Review'],
      transition_states: ['In Progress', 'Closed', 'Review'],
    };
    expect(cfg.kind).toBe('jira');
    expect(cfg.base_url).toBe('https://example.atlassian.net');
  });

  it('JiraTrackerConfig supports jql without project_key', () => {
    const cfg: JiraTrackerConfig = {
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
    };
    expect(cfg.jql).toBe('project = PROJ');
    expect(cfg.project_key).toBeNull();
  });

  it('GitHubTrackerConfig has kind github', () => {
    const cfg: GitHubTrackerConfig = {
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
    };
    expect(cfg.kind).toBe('github');
    expect(cfg.owner).toBe('my-org');
  });
});

describe('EffectiveConfig', () => {
  const cfg: EffectiveConfig = {
    tracker: {
      kind: 'linear',
      api_key: 'key',
      endpoint: 'https://api.linear.app/graphql',
      team_key: 'ENG',
      project_slug: 'my-project',
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
      tools: ['read', 'bash', 'edit', 'write'],
      session_dir: null,
      turn_timeout_ms: 3600000,
      stall_timeout_ms: 300000,
    },
    server: {
      port: 48484,
      host: '127.0.0.1',
    },
  } as const satisfies EffectiveConfig;

  it('has all required sections', () => {
    expect(cfg.tracker.kind).toBe('linear');
    expect(cfg.polling.interval_ms).toBe(30000);
    expect(cfg.workspace.root).toBe('/tmp/workspaces');
    expect(cfg.workspace.defaultBranch).toBe('main');
    expect(cfg.agent.max_concurrent_agents).toBe(10);
    expect(cfg.pi.tools).toEqual(['read', 'bash', 'edit', 'write']);
    expect(cfg.server.port).toBe(48484);
  });
});
