/** Side-effectful issue fetching and reconciliation workflows. */

import type { EffectiveConfig } from '../../config/model.js';
import type { TrackerAdapter } from '../adapters/trackerAdapter.js';
import type { Issue } from '../model.js';

// Tracker adapter factory will be set during startup
let trackerAdapter: TrackerAdapter | null = null;

export const setTrackerAdapter = (adapter: TrackerAdapter): void => {
  trackerAdapter = adapter;
};

/**
 * Fetch candidate issues from the configured tracker.
 */
export const fetchIssues = async (_config: EffectiveConfig): Promise<readonly Issue[] | null> => {
  if (trackerAdapter === null) return [];
  try {
    return await trackerAdapter.fetchCandidateIssues();
  } catch {
    return null;
  }
};
