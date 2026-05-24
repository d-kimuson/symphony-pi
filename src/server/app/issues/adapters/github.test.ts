import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GitHubTrackerConfig } from '../../config/model.ts';

import {
  fetchGitHubCandidateIssues,
  fetchGitHubIssuesByStates,
  fetchGitHubIssueStatesByIds,
} from './github.ts';

const testConfig: GitHubTrackerConfig = {
  kind: 'github',
  token: 'test-token',
  api_base_url: 'https://api.github.com',
  owner: 'my-org',
  repo: 'sample-a',
  state_source: 'labels',
  close_on_terminal: false,
  active_states: ['agent-ready', 'in-progress'],
  terminal_states: ['done', 'closed'],
  handoff_states: ['human-review'],
  transition_states: ['agent-ready', 'in-progress', 'done', 'human-review', 'closed'],
};

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  mockFetch.mockReset();
});

const makeGitHubIssue = (
  issueNumber: number,
  overrides: Partial<{
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    labels: ReadonlyArray<{ readonly name: string }>;
    pull_request: { readonly url: string };
  }> = {},
) => ({
  number: issueNumber,
  title: overrides.title ?? `Issue ${issueNumber}`,
  body: overrides.body ?? 'description',
  state: overrides.state ?? 'open',
  html_url: `https://github.com/my-org/sample-a/issues/${issueNumber}`,
  labels: overrides.labels ?? [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  ...(overrides.pull_request === undefined ? {} : { pull_request: overrides.pull_request }),
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const getRequestUrl = (callIndex: number): URL => {
  const input = mockFetch.mock.calls[callIndex]?.[0];
  if (input === undefined) {
    throw new Error(`missing request at call ${callIndex}`);
  }
  if (typeof input === 'string') {
    return new URL(input);
  }
  if (input instanceof URL) {
    return input;
  }
  return new URL(input.url);
};

describe('fetchGitHubCandidateIssues', () => {
  it('fetches each active label, dedupes by issue number, and excludes pull requests', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse([
          makeGitHubIssue(1, { labels: [{ name: 'agent-ready' }] }),
          makeGitHubIssue(2, { labels: [{ name: 'agent-ready' }] }),
          makeGitHubIssue(99, {
            labels: [{ name: 'agent-ready' }],
            pull_request: { url: 'https://api.github.com/repos/my-org/sample-a/pulls/99' },
          }),
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          makeGitHubIssue(1, { labels: [{ name: 'in-progress' }] }),
          makeGitHubIssue(3, { labels: [{ name: 'in-progress' }] }),
        ]),
      );

    const result = await fetchGitHubCandidateIssues(testConfig);

    if ('type' in result) throw new Error(result.type);
    expect(result.map((issue) => issue.id)).toEqual(['1', '2', '3']);

    const firstUrl = getRequestUrl(0);
    expect(firstUrl.pathname).toBe('/repos/my-org/sample-a/issues');
    expect(firstUrl.searchParams.get('state')).toBe('open');
    expect(firstUrl.searchParams.get('labels')).toBe('agent-ready');

    const secondUrl = getRequestUrl(1);
    expect(secondUrl.searchParams.get('labels')).toBe('in-progress');
  });

  it('supports native open as an active state fallback', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([makeGitHubIssue(4, { labels: [] })]));

    const result = await fetchGitHubCandidateIssues({
      ...testConfig,
      active_states: ['open'],
      transition_states: ['open', 'done', 'closed'],
    });

    if ('type' in result) throw new Error(result.type);
    expect(result).toHaveLength(1);
    expect(result[0]?.state).toBe('open');

    const requestUrl = getRequestUrl(0);
    expect(requestUrl.searchParams.get('state')).toBe('open');
    expect(requestUrl.searchParams.has('labels')).toBe(false);
  });
});

describe('fetchGitHubIssuesByStates', () => {
  it('normalizes label-based and native closed states', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([makeGitHubIssue(10, { labels: [{ name: 'done' }] })]))
      .mockResolvedValueOnce(jsonResponse([makeGitHubIssue(11, { state: 'closed', labels: [] })]));

    const result = await fetchGitHubIssuesByStates(testConfig, ['done', 'closed']);

    if ('type' in result) throw new Error(result.type);
    expect(result.map((issue) => issue.state)).toEqual(['done', 'closed']);
  });
});

describe('fetchGitHubIssueStatesByIds', () => {
  it('fetches issues by numeric id string and normalizes identifiers', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeGitHubIssue(123, { labels: [{ name: 'human-review' }] })),
    );

    const result = await fetchGitHubIssueStatesByIds(testConfig, ['123']);

    if ('type' in result) throw new Error(result.type);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '123',
      identifier: '#123',
      state: 'human-review',
      url: 'https://github.com/my-org/sample-a/issues/123',
    });
  });
});
