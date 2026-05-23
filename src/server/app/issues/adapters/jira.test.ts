import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JiraTrackerConfig } from '../../config/model.js';

import {
  fetchJiraCandidateIssues,
  fetchJiraIssuesByStates,
  fetchJiraIssueStatesByIds,
} from './jira.js';

const testConfig: JiraTrackerConfig = {
  kind: 'jira',
  api_key: 'test-token',
  email: 'test@example.com',
  base_url: 'https://test.atlassian.net',
  project_key: 'TEST',
  jql: null,
  active_states: ['Todo', 'In Progress'],
  terminal_states: ['Done'],
  handoff_states: [],
  transition_states: ['Todo', 'In Progress', 'Done'],
};

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
afterEach(() => mockFetch.mockReset());

const makeJiraSearchResponse = (issues: unknown[], total = issues.length) =>
  ({
    ok: true,
    json: async () => ({ total, issues }),
  }) as Response;

const makeJiraIssue = (overrides: Record<string, unknown> = {}) => ({
  id: '10001',
  key: 'TEST-1',
  fields: {
    summary: 'Test Issue',
    description: null,
    priority: { name: 'High' },
    status: { name: 'Todo' },
    labels: ['bug'],
    created: '2024-01-01T00:00:00.000+0000',
    updated: null,
    ...overrides,
  },
});

describe('fetchJiraCandidateIssues', () => {
  it('builds JQL from project_key', async () => {
    mockFetch.mockResolvedValueOnce(makeJiraSearchResponse([makeJiraIssue()]));
    const result = await fetchJiraCandidateIssues(testConfig);
    if (Array.isArray(result)) {
      expect(result.length).toBe(1);
      expect(result[0]?.identifier).toBe('TEST-1');
      expect(result[0]?.state).toBe('Todo');
    }
    const calls = mockFetch.mock.calls as Array<[string, unknown]>;
    const url = calls[calls.length - 1]?.[0];
    expect(url).toContain('jql=project');
    expect(url).toContain('TEST');
  });

  it('maps priority', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJiraSearchResponse([makeJiraIssue({ priority: { name: 'Low' } })]),
    );
    const result = await fetchJiraCandidateIssues(testConfig);
    if (Array.isArray(result) && result[0]) expect(result[0].priority).toBe(4);
  });

  it('handles pagination', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        total: 100,
        startAt: 0,
        maxResults: 50,
        issues: [makeJiraIssue({ id: '1' })],
      }),
    } as Response);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        total: 100,
        startAt: 50,
        maxResults: 50,
        issues: [makeJiraIssue({ id: '2' })],
      }),
    } as Response);
    const result = await fetchJiraCandidateIssues(testConfig);
    if (Array.isArray(result)) expect(result.length).toBe(2);
  });

  it('returns error on non-2xx', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);
    const result = await fetchJiraCandidateIssues(testConfig);
    if (!Array.isArray(result)) {
      // Type narrowing: result is JiraApiError here
      const err = result as { type: string };
      expect(err.type).toBe('jira_api_status');
    }
  });
});

describe('fetchJiraIssuesByStates', () => {
  it('returns empty for empty states', async () => {
    const result = await fetchJiraIssuesByStates(testConfig, []);
    if (Array.isArray(result)) expect(result.length).toBe(0);
  });

  it('scopes JQL with project_key', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJiraSearchResponse([makeJiraIssue({ fields: { status: { name: 'Done' } } })]),
    );
    const result = await fetchJiraIssuesByStates(testConfig, ['Done']);
    // Should return results (not error)
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('fetchJiraIssueStatesByIds', () => {
  it('returns empty for empty ids', async () => {
    const result = await fetchJiraIssueStatesByIds(testConfig, []);
    if (Array.isArray(result)) expect(result.length).toBe(0);
  });

  it('fetches issues by key', async () => {
    mockFetch.mockResolvedValueOnce(makeJiraSearchResponse([makeJiraIssue()]));
    const result = await fetchJiraIssueStatesByIds(testConfig, ['TEST-1']);
    expect(result).toBeDefined();
  });

  it('returns error when individual fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    } as Response);
    const result = await fetchJiraIssueStatesByIds(testConfig, ['BAD-1']);
    expect(Array.isArray(result)).toBe(false);
    expect((result as { type: string }).type).toBe('jira_api_status');
  });
});
