import { describe, expect, it } from 'vitest';

import type {
  GitHubTrackerConfig,
  JiraTrackerConfig,
  LinearTrackerConfig,
} from '../../config/model.ts';
import type { Issue } from '../model.ts';

import { createTrackerAdapter } from './adapterFactory.ts';

// Test the type shapes and error discriminated unions

describe('Tracker adapter types', () => {
  it('LinearApiError is a discriminated union', () => {
    const err1 = { type: 'linear_api_request' as const, message: 'timeout' };
    const err2 = { type: 'linear_api_status' as const, status: 500, body: 'error' };
    const err3 = { type: 'linear_graphql_errors' as const, errors: ['e1'] };
    const err4 = { type: 'linear_unknown_payload' as const };
    const err5 = { type: 'linear_missing_end_cursor' as const, message: 'no cursor' };

    expect(err1.type).toBe('linear_api_request');
    expect(err2.status).toBe(500);
    expect(err3.errors).toEqual(['e1']);
    expect(err4.type).toBe('linear_unknown_payload');
    expect(err5.type).toBe('linear_missing_end_cursor');
  });

  it('JiraApiError is a discriminated union', () => {
    const err1 = { type: 'jira_api_request' as const, message: 'timeout' };
    const err2 = { type: 'jira_api_status' as const, status: 400, body: 'bad' };
    const err3 = { type: 'jira_unknown_payload' as const };
    const err4 = { type: 'jira_pagination_error' as const, message: 'page error' };

    expect(err1.type).toBe('jira_api_request');
    expect(err2.status).toBe(400);
    expect(err3.type).toBe('jira_unknown_payload');
    expect(err4.type).toBe('jira_pagination_error');
  });

  it('GitHubApiError is a discriminated union', () => {
    const err1 = { type: 'github_api_request' as const, message: 'timeout' };
    const err2 = { type: 'github_api_status' as const, status: 404, message: 'not found' };
    const err3 = { type: 'github_unknown_payload' as const };
    const err4 = {
      type: 'github_invalid_issue_identifier' as const,
      message: 'bad identifier',
    };

    expect(err1.type).toBe('github_api_request');
    expect(err2.status).toBe(404);
    expect(err3.type).toBe('github_unknown_payload');
    expect(err4.type).toBe('github_invalid_issue_identifier');
  });

  it('LinearTrackerConfig shape', () => {
    const config: LinearTrackerConfig = {
      kind: 'linear',
      api_key: 'key',
      endpoint: 'https://api.linear.app/graphql',
      team_key: 'ENG',
      project_slug: 'my-proj',
      active_states: ['Todo'],
      terminal_states: ['Done'],
      handoff_states: [],
      transition_states: ['Todo', 'Done'],
    };
    expect(config.kind).toBe('linear');
  });

  it('JiraTrackerConfig shape', () => {
    const config: JiraTrackerConfig = {
      kind: 'jira',
      api_key: 'token',
      email: 'u@e.com',
      base_url: 'https://x.atlassian.net',
      project_key: 'PROJ',
      jql: null,
      active_states: ['Open'],
      terminal_states: ['Closed'],
      handoff_states: [],
      transition_states: ['Open', 'Closed'],
    };
    expect(config.kind).toBe('jira');
  });

  it('GitHubTrackerConfig shape', () => {
    const config: GitHubTrackerConfig = {
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
    expect(config.kind).toBe('github');
  });
});

describe('createTrackerAdapter', () => {
  it('creates a GitHub adapter for kind github', () => {
    const adapter = createTrackerAdapter({
      kind: 'github',
      token: 'token',
      api_base_url: 'https://api.github.com',
      owner: 'my-org',
      repo: 'sample-a',
      state_source: 'labels',
      close_on_terminal: false,
      active_states: ['agent-ready'],
      terminal_states: ['done', 'closed'],
      handoff_states: [],
      transition_states: ['agent-ready', 'done', 'closed'],
    });

    expect('type' in adapter).toBe(false);
    if ('type' in adapter) {
      throw new Error(adapter.message);
    }
    expect(typeof adapter.fetchCandidateIssues).toBe('function');
    expect(typeof adapter.fetchIssuesByStates).toBe('function');
    expect(typeof adapter.fetchIssueStatesByIds).toBe('function');
  });
});

describe('Issue model (for adapter output)', () => {
  const issue: Issue = {
    id: 'abc123',
    identifier: 'TEST-1',
    title: 'Test',
    description: 'desc',
    priority: 2,
    state: 'In Progress',
    branch_name: null,
    url: 'https://linear.app/issue/TEST-1',
    labels: ['bug'],
    blocked_by: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: null,
  };

  it('satisfies Issue model', () => {
    expect(issue.id).toBe('abc123');
    expect(issue.identifier).toBe('TEST-1');
    expect(issue.state).toBe('In Progress');
  });
});
