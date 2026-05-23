/**
 * Linear tracker adapter factory.
 * Creates a TrackerAdapter from LinearTrackerConfig.
 */

import type { LinearTrackerConfig } from '../../config/model.js';
import type { TrackerAdapter } from './trackerAdapter.js';

import {
  fetchLinearCandidateIssues,
  fetchLinearIssuesByStates,
  fetchLinearIssueStatesByIds,
} from './linear.js';

export const createLinearAdapter = (config: LinearTrackerConfig): TrackerAdapter => ({
  fetchCandidateIssues: () =>
    fetchLinearCandidateIssues(config).then((result) => {
      if ('type' in result) throw new Error(`Linear API error: ${result.type}`);
      return result;
    }),
  fetchIssuesByStates: (stateNames) =>
    fetchLinearIssuesByStates(config, stateNames).then((result) => {
      if ('type' in result) throw new Error(`Linear API error: ${result.type}`);
      return result;
    }),
  fetchIssueStatesByIds: (issueIds) =>
    fetchLinearIssueStatesByIds(config, issueIds).then((result) => {
      if ('type' in result) throw new Error(`Linear API error: ${result.type}`);
      return result;
    }),
});
