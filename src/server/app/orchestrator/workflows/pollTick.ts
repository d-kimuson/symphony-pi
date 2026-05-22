/** Poll tick workflow. The orchestrator is the only owner of scheduling state mutations. */

import type { EffectiveConfig } from '../../config/model.js';
import type { Issue } from '../../issues/model.js';
import type { OrchestratorState, RunningEntry } from '../model.js';

import { fetchIssues } from '../../issues/workflows/fetchIssues.js';
import {
  sortCandidatesByPriority,
  isDispatchEligible,
  hasGlobalSlots,
  createRetryEntry,
  isSessionStalled,
} from '../services/stateTransitions.js';

/**
 * Execute one poll tick.
 * Implements the tick sequence: reconcile → validate → fetch → sort → dispatch → notify.
 */
export const pollTick = async (
  state: OrchestratorState,
  config: EffectiveConfig,
  onNotify: () => void,
): Promise<void> => {
  // 1. Reconcile running issues
  reconcileRunningIssues(state, config);

  // 2. Fetch candidate issues
  const candidates = await fetchIssues(config);
  if (candidates === null) {
    // Fetch failed, skip dispatch for this tick
    return;
  }

  // 3. Sort by dispatch priority
  const sorted = sortCandidatesByPriority(candidates);

  // 4. Dispatch eligible issues while slots remain
  for (const issue of sorted) {
    if (!hasGlobalSlots(config, state.running)) break;
    if (!isDispatchEligible(issue, config, state.running, state.claimed)) continue;

    // Claim and dispatch
    dispatchIssue(state, issue, config);
  }

  // 5. Notify observability
  onNotify();
};

/**
 * Reconcile running issues: stall detection and state refresh.
 */
const reconcileRunningIssues = (state: OrchestratorState, config: EffectiveConfig): void => {
  for (const [issueId, entry] of state.running) {
    // Stall detection (Part A)
    if (isSessionStalled(entry, config.pi.stall_timeout_ms, null)) {
      // Terminate and queue retry
      const retry = createRetryEntry(
        issueId,
        entry.issue_identifier,
        (entry.attempt ?? 0) + 1,
        false,
        config.agent.max_retry_backoff_ms,
        'Stalled session',
      );
      state.running.delete(issueId);
      state.claimed.delete(issueId);
      state.retry_attempts.set(issueId, retry);
    }
  }

  // Part B: Tracker state refresh is async and done elsewhere
  // For now, reconciliation is stall-detection only
};

/**
 * Dispatch an issue to start running.
 */
const dispatchIssue = (state: OrchestratorState, issue: Issue, _config: EffectiveConfig): void => {
  state.claimed.add(issue.id);

  const entry: RunningEntry = {
    issue_id: issue.id,
    issue_identifier: issue.identifier,
    workspace_path: '', // Will be set by workspace manager
    started_at: Date.now(),
    attempt: null,
    turn_count: 0,
  };

  state.running.set(issue.id, entry);
};

/**
 * Handle worker exit (normal completion).
 */
export const handleWorkerExit = (
  state: OrchestratorState,
  issueId: string,
  success: boolean,
  error: string | null,
  config: EffectiveConfig,
): void => {
  const entry = state.running.get(issueId);
  state.running.delete(issueId);
  state.claimed.delete(issueId);

  if (entry === undefined) return;

  if (success) {
    state.completed.add(issueId);

    // Schedule continuation retry (1 second)
    const retry = createRetryEntry(
      issueId,
      entry.issue_identifier,
      1,
      true,
      config.agent.max_retry_backoff_ms,
      null,
    );
    state.retry_attempts.set(issueId, retry);
  } else {
    // Schedule exponential backoff retry
    const attempt = (entry.attempt ?? 0) + 1;
    const retry = createRetryEntry(
      issueId,
      entry.issue_identifier,
      attempt,
      false,
      config.agent.max_retry_backoff_ms,
      error,
    );
    state.retry_attempts.set(issueId, retry);
  }
};

/**
 * Handle retry timer fired.
 */
export const handleRetryFire = (state: OrchestratorState, issueId: string): void => {
  const retryEntry = state.retry_attempts.get(issueId);
  if (retryEntry === undefined) return;

  state.retry_attempts.delete(issueId);
  state.claimed.delete(issueId);

  // The orchestrator will re-evaluate dispatch eligibility on the next tick
};
