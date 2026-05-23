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
  team_key: 'ENG',
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
  team: { id: 'team-1', key: 'ENG', name: 'Engineering' },
  project: { id: 'project-1', slugId: 'test', name: 'test' },
  branchName: null,
  url: null,
  labels: { nodes: [] },
  blocks: { nodes: [] },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: null,
  ...overrides,
});

const getRequestPayload = (
  callIndex = 0,
): { query: string; variables: Record<string, unknown> } => {
  const init = mockFetch.mock.calls[callIndex]?.[1];
  const parsed: unknown = JSON.parse(String(init?.body ?? '{}'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid request payload');
  }

  const payload = Object.fromEntries(Object.entries(parsed));
  const query = typeof payload['query'] === 'string' ? payload['query'] : '';
  const variablesValue = payload['variables'];
  if (
    variablesValue === null ||
    typeof variablesValue !== 'object' ||
    Array.isArray(variablesValue)
  ) {
    return { query, variables: {} };
  }

  return { query, variables: Object.fromEntries(Object.entries(variablesValue)) };
};

describe('fetchLinearCandidateIssues', () => {
  it('returns normalized issues', async () => {
    mockFetch.mockResolvedValueOnce(makeGraphqlResponse([makeIssueNode()], false, null));
    const result = await fetchLinearCandidateIssues(testConfig);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBe(1);
      expect(result[0]?.identifier).toBe('TEST-1');
    }
  });

  it('includes team filter, project filter, active states, and pagination variables', async () => {
    mockFetch.mockResolvedValueOnce(
      makeGraphqlResponse([makeIssueNode({ id: 'a', identifier: 'A-1' })], true, 'cursor-1'),
    );
    mockFetch.mockResolvedValueOnce(
      makeGraphqlResponse([makeIssueNode({ id: 'b', identifier: 'B-1' })], false, null),
    );

    const result = await fetchLinearCandidateIssues(testConfig);

    expect(Array.isArray(result)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstRequest = getRequestPayload(0);
    expect(firstRequest.query).toContain('team: { key: { eq: $teamKey } }');
    expect(firstRequest.query).toContain('project: { slugId: { eq: $projectSlug } }');
    expect(firstRequest.query).toContain('state: { name: { in: $activeStates } }');
    expect(firstRequest.variables).toMatchObject({
      teamKey: 'ENG',
      projectSlug: 'test',
      activeStates: ['Todo', 'In Progress'],
      first: 50,
      after: null,
    });

    const secondRequest = getRequestPayload(1);
    expect(secondRequest.variables).toMatchObject({ after: 'cursor-1' });
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

  it('includes team and project filters for terminal cleanup', async () => {
    mockFetch.mockResolvedValueOnce(
      makeGraphqlResponse([makeIssueNode({ state: { name: 'Done' } })]),
    );

    const result = await fetchLinearIssuesByStates(testConfig, ['Done']);

    expect(Array.isArray(result)).toBe(true);
    const request = getRequestPayload(0);
    expect(request.query).toContain('team: { key: { eq: $teamKey } }');
    expect(request.query).toContain('project: { slugId: { eq: $projectSlug } }');
    expect(request.query).toContain('state: { name: { in: $states } }');
    expect(request.variables).toMatchObject({
      teamKey: 'ENG',
      projectSlug: 'test',
      states: ['Done'],
      first: 50,
      after: null,
    });
  });
});

describe('fetchLinearIssueStatesByIds', () => {
  it('returns empty for empty ids', async () => {
    const result = await fetchLinearIssueStatesByIds(testConfig, []);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) expect(result.length).toBe(0);
  });

  it('drops issues outside configured team/project scope', async () => {
    mockFetch.mockResolvedValueOnce(
      makeGraphqlResponse([
        makeIssueNode({ id: 'in-scope' }),
        makeIssueNode({ id: 'out-of-scope', team: { id: 'team-2', key: 'OPS', name: 'Ops' } }),
      ]),
    );

    const result = await fetchLinearIssueStatesByIds(testConfig, ['in-scope', 'out-of-scope']);

    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('in-scope');
    }
  });
});
