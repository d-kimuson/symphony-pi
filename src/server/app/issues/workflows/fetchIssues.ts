/** Side-effectful issue fetching and reconciliation workflows. */

import type { EffectiveConfig } from '../../config/model.ts';
import type { TrackerAdapter } from '../adapters/trackerAdapter.ts';
import type { Issue } from '../model.ts';

// Tracker adapter factory will be set during startup
let trackerAdapter: TrackerAdapter | null = null;

export const setTrackerAdapter = (adapter: TrackerAdapter): void => {
  trackerAdapter = adapter;
};

/**
 * Fetch candidate issues from the configured tracker.
 * Returns null when adapter is not initialized (operator-visible error).
 */
export const fetchIssues = async (_config: EffectiveConfig): Promise<readonly Issue[] | null> => {
  if (trackerAdapter === null) {
    console.error('[symphony] fetchIssues: tracker adapter is not initialized. Skipping dispatch.');
    return null;
  }
  try {
    return await trackerAdapter.fetchCandidateIssues();
  } catch {
    return null;
  }
};

/**
 * Fetch current issue states by IDs for active-run reconciliation (SPEC 8.5 Part B).
 * Returns null when adapter is not initialized.
 */
export const fetchIssueStatesByIds = async (
  _config: EffectiveConfig,
  issueIds: readonly string[],
): Promise<readonly Issue[] | null> => {
  if (trackerAdapter === null) {
    console.error('[symphony] fetchIssueStatesByIds: tracker adapter is not initialized.');
    return null;
  }
  if (issueIds.length === 0) return [];
  try {
    return await trackerAdapter.fetchIssueStatesByIds(issueIds);
  } catch {
    return null;
  }
};

/**
 * Fetch issues by their states (for startup terminal cleanup).
 */
export const fetchIssuesByStates = async (
  _config: EffectiveConfig,
  stateNames: readonly string[],
): Promise<readonly Issue[] | null> => {
  if (trackerAdapter === null) {
    console.error('[symphony] fetchIssuesByStates: tracker adapter is not initialized.');
    return null;
  }
  try {
    return await trackerAdapter.fetchIssuesByStates(stateNames);
  } catch {
    return null;
  }
};
