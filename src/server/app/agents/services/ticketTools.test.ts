import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EffectiveConfig } from '../../config/model.ts';

import { ticketGet, ticketComment, ticketTransition } from './ticketTools.ts';

const linearConfig: EffectiveConfig = {
  tracker: {
    kind: 'linear',
    api_key: 'test-api-key',
    endpoint: 'https://api.linear.app/graphql',
    team_key: 'ENG',
    project_slug: 'test',
    active_states: ['Todo', 'In Progress'],
    terminal_states: ['Done', 'Cancelled'],
    handoff_states: ['Human Review'],
    transition_states: ['Todo', 'In Progress', 'Human Review', 'Done', 'Cancelled'],
  },
  polling: { interval_ms: 30000 },
  workspace: { root: '/tmp/symphony' },
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
  server: { port: 48484, host: '127.0.0.1' },
  prompt_template: '',
};

const jiraConfig: EffectiveConfig = {
  tracker: {
    kind: 'jira',
    api_key: 'test-token',
    email: 'test@example.com',
    base_url: 'https://test.atlassian.net',
    project_key: 'TEST',
    jql: null,
    active_states: ['Todo', 'In Progress'],
    terminal_states: ['Done', 'Cancelled'],
    handoff_states: [],
    transition_states: ['Todo', 'In Progress', 'Done'],
  },
  polling: { interval_ms: 30000 },
  workspace: { root: '/tmp/symphony' },
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
  server: { port: 48484, host: '127.0.0.1' },
  prompt_template: '',
};

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
afterEach(() => mockFetch.mockReset());

const makeLinearIssueNode = (overrides: Record<string, unknown> = {}) => ({
  id: 'abc123',
  identifier: 'TEST-1',
  title: 'Test',
  description: 'desc',
  priority: 2,
  state: { name: 'Todo' },
  team: { key: 'ENG' },
  project: { slugId: 'test', name: 'test' },
  branchName: null,
  url: null,
  labels: { nodes: [] },
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

const makeLinearIssueLookupResponse = (nodes: unknown[]) =>
  ({
    ok: true,
    json: async () => ({
      data: {
        issues: {
          nodes,
        },
      },
    }),
  }) as Response;

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

describe('ticketGet', () => {
  it('returns normalized Linear issue', async () => {
    mockFetch.mockResolvedValueOnce(makeLinearIssueLookupResponse([makeLinearIssueNode()]));

    const result = await ticketGet('TEST-1', linearConfig);

    if ('error' in result) throw new Error(String(result.error));
    expect(result.id).toBe('abc123');
    expect(result.state).toBe('Todo');
    expect(result.priority).toBe(2);
  });

  it('queries Linear by identifier plus team and project scope', async () => {
    mockFetch.mockResolvedValueOnce(makeLinearIssueLookupResponse([makeLinearIssueNode()]));

    await ticketGet('TEST-1', linearConfig);

    const request = getRequestPayload(0);
    expect(request.query).toContain('identifier: { eq: $identifier }');
    expect(request.query).toContain('team: { key: { eq: $teamKey } }');
    expect(request.query).toContain('project: { slugId: { eq: $projectSlug } }');
    expect(request.variables).toEqual({
      identifier: 'TEST-1',
      teamKey: 'ENG',
      projectSlug: 'test',
    });
  });

  it('returns error when scoped Linear issue is not found', async () => {
    mockFetch.mockResolvedValueOnce(makeLinearIssueLookupResponse([]));

    const result = await ticketGet('TEST-1', linearConfig);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('not found in configured Linear scope');
    }
  });

  it('returns error on Linear scope mismatch', async () => {
    mockFetch.mockResolvedValueOnce(
      makeLinearIssueLookupResponse([makeLinearIssueNode({ team: { key: 'OPS' } })]),
    );

    const result = await ticketGet('TEST-1', linearConfig);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('outside configured Linear scope');
    }
  });

  it('returns Jira issue', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: '10001',
        key: 'TEST-1',
        fields: {
          summary: 'Jira issue',
          description: 'desc',
          priority: { name: 'High' },
          status: { name: 'In Progress' },
          labels: ['bug'],
        },
      }),
    } as Response);

    const result = await ticketGet('TEST-1', jiraConfig);

    if ('error' in result) throw new Error(String(result.error));
    expect(result.priority).toBe(2);
    expect(result.labels).toContain('bug');
  });

  it('returns error on Linear API failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const result = await ticketGet('TEST-1', linearConfig);
    expect('error' in result).toBe(true);
  });

  it('returns error on Jira API failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    const result = await ticketGet('NONEXIST', jiraConfig);
    expect('error' in result).toBe(true);
  });
});

describe('ticketComment', () => {
  it('uses internal Linear issue id for mutation', async () => {
    mockFetch.mockResolvedValueOnce(
      makeLinearIssueLookupResponse([makeLinearIssueNode({ id: 'lin-1' })]),
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { commentCreate: { success: true } } }),
    } as Response);

    expect(await ticketComment('TEST-1', 'Hello', linearConfig)).toBeUndefined();

    const mutationRequest = getRequestPayload(1);
    expect(mutationRequest.query).toContain(
      'commentCreate(input: { issueId: $issueId, body: $body })',
    );
    expect(mutationRequest.variables).toEqual({ issueId: 'lin-1', body: 'Hello' });
  });

  it('succeeds for Jira', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true } as Response);
    expect(await ticketComment('TEST-1', 'Hello', jiraConfig)).toBeUndefined();
  });

  it('returns error on failure', async () => {
    mockFetch.mockResolvedValueOnce(
      makeLinearIssueLookupResponse([makeLinearIssueNode({ id: 'lin-1' })]),
    );
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 } as Response);

    const result = await ticketComment('TEST-1', 'x', linearConfig);

    expect(result).toBeDefined();
  });
});

describe('ticketTransition', () => {
  it('validates transition_states allowlist', async () => {
    const result = await ticketTransition('TEST-1', 'Backlog', linearConfig);
    expect(result).toBeDefined();
    if (result && 'error' in result) expect(result.error).toContain('Invalid transition target');
  });

  it('uses team-scoped state lookup and internal issue id for Linear transition', async () => {
    mockFetch.mockResolvedValueOnce(
      makeLinearIssueLookupResponse([makeLinearIssueNode({ id: 'lin-1' })]),
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { workflowStates: { nodes: [{ id: 'state-1', name: 'Done' }] } },
      }),
    } as Response);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { issueUpdate: { success: true } } }),
    } as Response);

    expect(await ticketTransition('TEST-1', 'Done', linearConfig)).toBeUndefined();

    const stateLookupRequest = getRequestPayload(1);
    expect(stateLookupRequest.query).toContain('team: { key: { eq: $teamKey } }');
    expect(stateLookupRequest.query).toContain('name: { eq: $name }');
    expect(stateLookupRequest.variables).toEqual({ teamKey: 'ENG', name: 'Done' });

    const updateRequest = getRequestPayload(2);
    expect(updateRequest.query).toContain(
      'issueUpdate(id: $issueId, input: { stateId: $stateId })',
    );
    expect(updateRequest.variables).toEqual({ issueId: 'lin-1', stateId: 'state-1' });
  });

  it('succeeds for valid Jira transition', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transitions: [{ id: '31', to: { name: 'Done' } }] }),
    } as Response);
    mockFetch.mockResolvedValueOnce({ ok: true } as Response);
    expect(await ticketTransition('TEST-1', 'Done', jiraConfig)).toBeUndefined();
  });

  it('returns error when state not found in team workflow', async () => {
    mockFetch.mockResolvedValueOnce(
      makeLinearIssueLookupResponse([makeLinearIssueNode({ id: 'lin-1' })]),
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { workflowStates: { nodes: [] } } }),
    } as Response);

    const result = await ticketTransition('TEST-1', 'Done', linearConfig);

    expect(result).toBeDefined();
    if (result && 'error' in result) {
      expect(result.error).toContain('not found in Linear team ENG');
    }
  });

  it('case-insensitive state match', async () => {
    mockFetch.mockResolvedValueOnce(
      makeLinearIssueLookupResponse([makeLinearIssueNode({ id: 'lin-1' })]),
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { workflowStates: { nodes: [{ id: 's1', name: 'Done' }] } } }),
    } as Response);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { issueUpdate: { success: true } } }),
    } as Response);

    expect(await ticketTransition('TEST-1', 'done', linearConfig)).toBeUndefined();
  });
});
