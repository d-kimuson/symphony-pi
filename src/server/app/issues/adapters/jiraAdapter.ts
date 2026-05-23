/**
 * Jira tracker adapter factory.
 * Creates a TrackerAdapter from JiraTrackerConfig.
 */

import type { JiraTrackerConfig } from '../../config/model.js';
import type { TrackerAdapter } from './trackerAdapter.js';

import {
  fetchJiraCandidateIssues,
  fetchJiraIssuesByStates,
  fetchJiraIssueStatesByIds,
} from './jira.js';

export const createJiraAdapter = (config: JiraTrackerConfig): TrackerAdapter => ({
  fetchCandidateIssues: () =>
    fetchJiraCandidateIssues(config).then((result) => {
      if ('type' in result) throw new Error(`Jira API error: ${result.type}`);
      return result;
    }),
  fetchIssuesByStates: (stateNames) =>
    fetchJiraIssuesByStates(config, stateNames).then((result) => {
      if ('type' in result) throw new Error(`Jira API error: ${result.type}`);
      return result;
    }),
  fetchIssueStatesByIds: (issueIds) =>
    fetchJiraIssueStatesByIds(config, issueIds).then((result) => {
      if ('type' in result) throw new Error(`Jira API error: ${result.type}`);
      return result;
    }),
});
