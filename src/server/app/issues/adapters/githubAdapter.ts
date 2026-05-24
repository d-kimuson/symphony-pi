/**
 * GitHub tracker adapter factory.
 * Creates a TrackerAdapter from GitHubTrackerConfig.
 */

import type { GitHubTrackerConfig } from '../../config/model.ts';
import type { TrackerAdapter } from './trackerAdapter.ts';

import {
  fetchGitHubCandidateIssues,
  fetchGitHubIssuesByStates,
  fetchGitHubIssueStatesByIds,
} from './github.ts';

export const createGitHubAdapter = (config: GitHubTrackerConfig): TrackerAdapter => ({
  fetchCandidateIssues: () =>
    fetchGitHubCandidateIssues(config).then((result) => {
      if ('type' in result) throw new Error(`GitHub API error: ${result.type}`);
      return result;
    }),
  fetchIssuesByStates: (stateNames) =>
    fetchGitHubIssuesByStates(config, stateNames).then((result) => {
      if ('type' in result) throw new Error(`GitHub API error: ${result.type}`);
      return result;
    }),
  fetchIssueStatesByIds: (issueIds) =>
    fetchGitHubIssueStatesByIds(config, issueIds).then((result) => {
      if ('type' in result) throw new Error(`GitHub API error: ${result.type}`);
      return result;
    }),
});
