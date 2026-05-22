/** Tracker adapter interface. */

import type { Issue } from '../model.js';

export type TrackerAdapter = {
  readonly fetchCandidateIssues: () => Promise<readonly Issue[]>;
  readonly fetchIssuesByStates: (stateNames: readonly string[]) => Promise<readonly Issue[]>;
  readonly fetchIssueStatesByIds: (issueIds: readonly string[]) => Promise<readonly Issue[]>;
};
