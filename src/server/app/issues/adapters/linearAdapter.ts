/**
 * Linear tracker adapter factory.
 * Creates a TrackerAdapter from LinearTrackerConfig.
 */

import type { LinearTrackerConfig } from '../../config/model.ts';
import type { Issue } from '../model.ts';
import type { TrackerAdapter } from './trackerAdapter.ts';

import {
  fetchLinearCandidateIssues,
  fetchLinearIssuesByStates,
  fetchLinearIssueStatesByIds,
  type LinearApiError,
} from './linear.ts';

const formatLinearApiError = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null || !('type' in error)) {
    return null;
  }

  switch (error.type) {
    case 'linear_api_request':
      return 'message' in error && typeof error.message === 'string'
        ? `Linear API request failed: ${error.message}`
        : 'Linear API request failed';
    case 'linear_api_status':
      return 'status' in error &&
        typeof error.status === 'number' &&
        'body' in error &&
        typeof error.body === 'string'
        ? `Linear API returned HTTP ${error.status}: ${error.body}`
        : 'Linear API returned an HTTP error';
    case 'linear_graphql_errors':
      return 'errors' in error && Array.isArray(error.errors)
        ? `Linear GraphQL errors: ${error.errors.join('; ')}`
        : 'Linear GraphQL request failed';
    case 'linear_missing_end_cursor':
      return 'message' in error && typeof error.message === 'string'
        ? `Linear pagination error: ${error.message}`
        : 'Linear pagination error';
    case 'linear_unknown_payload':
      return 'Linear API returned an unknown payload';
    default:
      return null;
  }
};

const isIssueList = (result: readonly Issue[] | LinearApiError): result is readonly Issue[] =>
  Array.isArray(result);

const unwrapLinearResult = (result: readonly Issue[] | LinearApiError): readonly Issue[] => {
  if (isIssueList(result)) {
    return result;
  }

  throw new Error(formatLinearApiError(result) ?? 'Linear API request failed');
};

export const createLinearAdapter = (config: LinearTrackerConfig): TrackerAdapter => ({
  fetchCandidateIssues: () => fetchLinearCandidateIssues(config).then(unwrapLinearResult),
  fetchIssuesByStates: (stateNames) =>
    fetchLinearIssuesByStates(config, stateNames).then(unwrapLinearResult),
  fetchIssueStatesByIds: (issueIds) =>
    fetchLinearIssueStatesByIds(config, issueIds).then(unwrapLinearResult),
});
