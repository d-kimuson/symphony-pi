/** Side-effectful issue fetching and reconciliation workflows. */

import type { TrackerAdapter } from '../adapters/trackerAdapter.ts';
import type { Issue } from '../model.ts';

const formatPrefix = (projectId?: string): string => {
  return projectId === undefined ? '[symphony]' : `[symphony][project:${projectId}]`;
};

/**
 * Fetch candidate issues from the configured tracker.
 */
export const fetchIssues = async (
  trackerAdapter: TrackerAdapter,
  projectId?: string,
): Promise<readonly Issue[] | null> => {
  try {
    return await trackerAdapter.fetchCandidateIssues();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${formatPrefix(projectId)} fetchIssues failed: ${msg}`);
    return null;
  }
};

/**
 * Fetch current issue states by IDs for active-run reconciliation (SPEC 8.5 Part B).
 */
export const fetchIssueStatesByIds = async (
  trackerAdapter: TrackerAdapter,
  issueIds: readonly string[],
  projectId?: string,
): Promise<readonly Issue[] | null> => {
  if (issueIds.length === 0) return [];
  try {
    return await trackerAdapter.fetchIssueStatesByIds(issueIds);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${formatPrefix(projectId)} fetchIssueStatesByIds failed: ${msg}`);
    return null;
  }
};

/**
 * Fetch issues by their states (for startup terminal cleanup).
 */
export const fetchIssuesByStates = async (
  trackerAdapter: TrackerAdapter,
  stateNames: readonly string[],
  projectId?: string,
): Promise<readonly Issue[] | null> => {
  try {
    return await trackerAdapter.fetchIssuesByStates(stateNames);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${formatPrefix(projectId)} fetchIssuesByStates failed: ${msg}`);
    return null;
  }
};
