import { describe, expect, it } from 'vitest';

import type { WorkflowDefinition } from '../../workflow/model.ts';

import { resolveEffectiveConfig } from './resolveConfig.ts';

describe('resolveEffectiveConfig', () => {
  const baseWorkflow: WorkflowDefinition = {
    config: {
      tracker: {
        kind: 'linear',
        api_key: '$LINEAR_API_KEY',
        team_key: 'ENG',
        project_slug: 'my-project',
      },
      polling: {
        interval_ms: 60000,
      },
      workspace: {
        defaultBranch: 'main',
      },
    },
    prompt_template: '# Task',
  };

  it('resolves a linear config with defaults', () => {
    const config = resolveEffectiveConfig(baseWorkflow, '/repo');

    expect(config.tracker.kind).toBe('linear');
    if (config.tracker.kind !== 'linear') throw new Error('expected linear');
    expect(config.tracker.team_key).toBe('ENG');
    expect(config.tracker.project_slug).toBe('my-project');
    expect(config.polling.interval_ms).toBe(60000);
    expect(config.agent.max_concurrent_agents).toBe(10);
    expect(config.workspace.defaultBranch).toBe('main');
    expect(config.pi.tools).toEqual([]);
    expect(config.server.port).toBe(48484);
  });

  it('resolves jira config', () => {
    const workflow: WorkflowDefinition = {
      config: {
        tracker: {
          kind: 'jira',
          api_key: 'token',
          email: 'user@example.com',
          base_url: 'https://example.atlassian.net',
          project_key: 'PROJ',
        },
      },
      prompt_template: '# Task',
    };

    const config = resolveEffectiveConfig(workflow, '/repo');
    expect(config.tracker.kind).toBe('jira');
    if (config.tracker.kind !== 'jira') throw new Error('expected jira');
    expect(config.tracker.base_url).toBe('https://example.atlassian.net');
    expect(config.tracker.email).toBe('user@example.com');
  });

  it('resolves github config with defaults', () => {
    const workflow: WorkflowDefinition = {
      config: {
        tracker: {
          kind: 'github',
          token: 'token',
          owner: 'my-org',
          repo: 'sample-a',
        },
      },
      prompt_template: '# Task',
    };

    const config = resolveEffectiveConfig(workflow, '/repo');
    expect(config.tracker.kind).toBe('github');
    if (config.tracker.kind !== 'github') throw new Error('expected github');
    expect(config.tracker.token).toBe('token');
    expect(config.tracker.api_base_url).toBe('https://api.github.com');
    expect(config.tracker.state_source).toBe('labels');
    expect(config.tracker.close_on_terminal).toBe(false);
  });

  it('resolves github token from api_key fallback', () => {
    const workflow: WorkflowDefinition = {
      config: {
        tracker: {
          kind: 'github',
          api_key: 'fallback-token',
          owner: 'my-org',
          repo: 'sample-a',
          close_on_terminal: true,
        },
      },
      prompt_template: '# Task',
    };

    const config = resolveEffectiveConfig(workflow, '/repo');
    expect(config.tracker.kind).toBe('github');
    if (config.tracker.kind !== 'github') throw new Error('expected github');
    expect(config.tracker.token).toBe('fallback-token');
    expect(config.tracker.close_on_terminal).toBe(true);
  });

  it('applies custom pi settings', () => {
    const workflow: WorkflowDefinition = {
      config: {
        tracker: { kind: 'linear', api_key: 'key', team_key: 'ENG', project_slug: 'proj' },
        pi: {
          model: 'gpt-4',
          thinking: 'high',
          tools: ['read', 'bash'],
          turn_timeout_ms: 600000,
        },
      },
      prompt_template: '# Task',
    };

    const config = resolveEffectiveConfig(workflow, '/repo');
    expect(config.pi.model).toBe('gpt-4');
    expect(config.pi.thinking).toBe('high');
    expect(config.pi.tools).toEqual(['read', 'bash']);
    expect(config.pi.turn_timeout_ms).toBe(600000);
  });

  it('applies custom agent settings', () => {
    const workflow: WorkflowDefinition = {
      config: {
        tracker: { kind: 'linear', api_key: 'key', team_key: 'ENG', project_slug: 'proj' },
        agent: {
          max_concurrent_agents: 5,
          max_turns: 10,
          max_retry_backoff_ms: 600000,
          max_concurrent_agents_by_state: { todo: 2, 'in progress': 3 },
        },
      },
      prompt_template: '# Task',
    };

    const config = resolveEffectiveConfig(workflow, '/repo');
    expect(config.agent.max_concurrent_agents).toBe(5);
    expect(config.agent.max_turns).toBe(10);
    expect(config.agent.max_retry_backoff_ms).toBe(600000);
    expect(config.agent.max_concurrent_agents_by_state).toEqual({
      todo: 2,
      'in progress': 3,
    });
  });

  it('handles missing optional fields gracefully', () => {
    const workflow: WorkflowDefinition = {
      config: {
        tracker: { kind: 'linear', api_key: 'key', team_key: 'ENG', project_slug: 'proj' },
        workspace: { defaultBranch: 'main' },
      },
      prompt_template: '# Task',
    };

    const config = resolveEffectiveConfig(workflow, '/repo');
    expect(config.hooks.after_create).toBeNull();
    expect(config.hooks.before_run).toBeNull();
    expect(config.hooks.after_run).toBeNull();
    expect(config.hooks.before_remove).toBeNull();
  });

  it('resolves transition_states from active/terminal/handoff defaults', () => {
    const workflow: WorkflowDefinition = {
      config: {
        tracker: { kind: 'linear', api_key: 'key', team_key: 'ENG', project_slug: 'proj' },
        workspace: { defaultBranch: 'main' },
      },
      prompt_template: '# Task',
    };

    const config = resolveEffectiveConfig(workflow, '/repo');
    if (config.tracker.kind !== 'linear') throw new Error('expected linear');
    expect(config.tracker.transition_states).toContain('Todo');
    expect(config.tracker.transition_states).toContain('Done');
  });

  it('uses empty string when workspace.defaultBranch is missing so validation can fail later', () => {
    const workflow: WorkflowDefinition = {
      config: {
        tracker: { kind: 'linear', api_key: 'key', team_key: 'ENG', project_slug: 'proj' },
      },
      prompt_template: '# Task',
    };

    const config = resolveEffectiveConfig(workflow, '/repo');
    expect(config.workspace.defaultBranch).toBe('');
  });
});
