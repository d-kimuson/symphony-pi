import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LinearTrackerConfig } from '../../config/model.ts';

const { fetchLinearCandidateIssues, fetchLinearIssuesByStates, fetchLinearIssueStatesByIds } =
  vi.hoisted(() => ({
    fetchLinearCandidateIssues: vi.fn(),
    fetchLinearIssuesByStates: vi.fn(),
    fetchLinearIssueStatesByIds: vi.fn(),
  }));

vi.mock('./linear.ts', () => ({
  fetchLinearCandidateIssues,
  fetchLinearIssuesByStates,
  fetchLinearIssueStatesByIds,
}));

import { createLinearAdapter } from './linearAdapter.ts';

const testConfig: LinearTrackerConfig = {
  kind: 'linear',
  api_key: 'test-key',
  endpoint: 'https://api.linear.app/graphql',
  team_key: 'ENG',
  project_slug: 'symphony-pi',
  active_states: ['Todo'],
  terminal_states: ['Done'],
  handoff_states: [],
  transition_states: ['Todo', 'Done'],
};

afterEach(() => {
  fetchLinearCandidateIssues.mockReset();
  fetchLinearIssuesByStates.mockReset();
  fetchLinearIssueStatesByIds.mockReset();
});

describe('createLinearAdapter', () => {
  it('includes HTTP status and body in candidate fetch errors', async () => {
    fetchLinearCandidateIssues.mockResolvedValue({
      type: 'linear_api_status',
      status: 401,
      body: '{"errors":[{"message":"Invalid auth"}]}',
    });

    const adapter = createLinearAdapter(testConfig);

    await expect(adapter.fetchCandidateIssues()).rejects.toThrow(
      'Linear API returned HTTP 401: {"errors":[{"message":"Invalid auth"}]}',
    );
  });

  it('includes GraphQL error details in state fetch errors', async () => {
    fetchLinearIssuesByStates.mockResolvedValue({
      type: 'linear_graphql_errors',
      errors: ['Unknown field slugId'],
    });

    const adapter = createLinearAdapter(testConfig);

    await expect(adapter.fetchIssuesByStates(['Done'])).rejects.toThrow(
      'Linear GraphQL errors: Unknown field slugId',
    );
  });

  it('includes request errors in issue state refresh errors', async () => {
    fetchLinearIssueStatesByIds.mockResolvedValue({
      type: 'linear_api_request',
      message: 'Request timed out',
    });

    const adapter = createLinearAdapter(testConfig);

    await expect(adapter.fetchIssueStatesByIds(['issue-1'])).rejects.toThrow(
      'Linear API request failed: Request timed out',
    );
  });
});
