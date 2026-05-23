import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LinearTrackerConfig } from '../../config/model.ts';

import {
  fetchLinearCandidateIssues,
  fetchLinearIssuesByStates,
  fetchLinearIssueStatesByIds,
} from './linear.ts';

const testConfig: LinearTrackerConfig = {
  kind: 'linear',
  api_key: 'test-key',
  endpoint: 'https://api.linear.app/graphql',
  project_slug: 'test',
  active_states: ['Todo', 'In Progress'],
  terminal_states: ['Done'],
  handoff_states: [],
  transition_states: ['Todo', 'In Progress', 'Done'],
};

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
afterEach(() => mockFetch.mockReset());

const makeGraphqlResponse = (
  nodes: unknown[],
  hasNextPage = false,
  endCursor: string | null = null,
) =>
  ({
    ok: true,
    json: async () => ({
      data: { issues: { nodes, pageInfo: { hasNextPage, endCursor } } },
    }),
  }) as Response;

const makeIssueNode = (overrides: Record<string, unknown> = {}) => ({
  id: 'abc-1',
  identifier: 'TEST-1',
  title: 'Test',
  description: null,
  priority: 1,
  state: { name: 'Todo' },
  branchName: null,
  url: null,
  labels: { nodes: [] },
  blocks: { nodes: [] },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: null,
  ...overrides,
});

describe('fetchLinearCandidateIssues', () => {
  it('returns normalized issues', async () => {
    mockFetch.mockResolvedValueOnce(makeGraphqlResponse([makeIssueNode()], false, null));
    const result = await fetchLinearCandidateIssues(testConfig);
    expect(Array.isArray(result)).toBe(true);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBe(1);
      expect(result[0]?.identifier).toBe('TEST-1');
    }
  });

  it('normalizes label names (not IDs)', async () => {
    mockFetch.mockResolvedValueOnce(
      makeGraphqlResponse([
        makeIssueNode({
          labels: { nodes: [{ name: 'Bug' }, { name: 'Frontend' }] },
        }),
      ]),
    );
    const result = await fetchLinearCandidateIssues(testConfig);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result) && result[0]) {
      expect(result[0].labels).toContain('bug');
      expect(result[0].labels).toContain('frontend');
    }
  });

  it('normalizes blockers from inverse blocks relation', async () => {
    mockFetch.mockResolvedValueOnce(
      makeGraphqlResponse([
        makeIssueNode({
          blocks: { nodes: [{ id: 'b1', identifier: 'BLK-1', state: { name: 'Todo' } }] },
        }),
      ]),
    );
    const result = await fetchLinearCandidateIssues(testConfig);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result) && result[0]) {
      expect(result[0].blocked_by.length).toBe(1);
      expect(result[0].blocked_by[0]?.identifier).toBe('BLK-1');
      expect(result[0].blocked_by[0]?.state).toBe('Todo');
    }
  });

  it('handles pagination', async () => {
    mockFetch.mockResolvedValueOnce(
      makeGraphqlResponse([makeIssueNode({ id: 'a', identifier: 'A-1' })], true, 'cursor-1'),
    );
    mockFetch.mockResolvedValueOnce(
      makeGraphqlResponse([makeIssueNode({ id: 'b', identifier: 'B-1' })], false, null),
    );
    const result = await fetchLinearCandidateIssues(testConfig);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) expect(result.length).toBe(2);
  });

  it('returns missing_end_cursor error', async () => {
    mockFetch.mockResolvedValueOnce(makeGraphqlResponse([makeIssueNode()], true, null));
    const result = await fetchLinearCandidateIssues(testConfig);
    expect(Array.isArray(result)).toBe(false);
    expect((result as { type: string }).type).toBe('linear_missing_end_cursor');
  });

  it('returns graphql_errors on GraphQL errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errors: [{ message: 'Something broke' }] }),
    } as Response);
    const result = await fetchLinearCandidateIssues(testConfig);
    expect(Array.isArray(result)).toBe(false);
    expect((result as { type: string }).type).toBe('linear_graphql_errors');
  });

  it('returns api_status on non-200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Error',
    } as Response);
    const result = await fetchLinearCandidateIssues(testConfig);
    expect(Array.isArray(result)).toBe(false);
    expect((result as { type: string }).type).toBe('linear_api_status');
  });
});

describe('fetchLinearIssuesByStates', () => {
  it('returns empty for empty states', async () => {
    const result = await fetchLinearIssuesByStates(testConfig, []);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) expect(result.length).toBe(0);
  });
});

describe('fetchLinearIssueStatesByIds', () => {
  it('returns empty for empty ids', async () => {
    const result = await fetchLinearIssueStatesByIds(testConfig, []);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) expect(result.length).toBe(0);
  });
});
