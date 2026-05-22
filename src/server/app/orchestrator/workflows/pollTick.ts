/** Poll tick workflow. The orchestrator is the only owner of scheduling state mutations. */

import type { EffectiveConfig } from '../../config/model.js';
import type { Issue } from '../../issues/model.js';
import type { OrchestratorState, RunningEntry } from '../model.js';

import { fetchIssues, fetchIssueStatesByIds } from '../../issues/workflows/fetchIssues.js';
import {
  sortCandidatesByPriority,
  isDispatchEligible,
  hasGlobalSlots,
  createRetryEntry,
  isSessionStalled,
  determineReconciliationAction,
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
  await reconcileRunningIssues(state, config);

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
 * Reconcile running issues: stall detection (Part A) and tracker state refresh (Part B).
 * SPEC 8.5.
 */
const reconcileRunningIssues = async (
  state: OrchestratorState,
  config: EffectiveConfig,
): Promise<void> => {
  const runningIds = Array.from(state.running.keys());

  if (runningIds.length === 0) return;

  // Part A: Stall detection
  for (const [issueId, entry] of state.running) {
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

  // Part B: Tracker state refresh (SPEC 8.5 Part B)
  const refreshed = await fetchIssueStatesByIds(config, runningIds);

  if (refreshed === null) {
    // Fetch failed: keep workers running, retry next tick (SPEC 8.5)
    return;
  }

  for (const issue of refreshed) {
    const entry = state.running.get(issue.id);
    if (entry === undefined) continue;

    const action = determineReconciliationAction(issue.state, config);

    switch (action.action) {
      case 'stop_and_cleanup': {
        // Terminal state: terminate worker + clean workspace (SPEC 8.5)
        state.running.delete(issue.id);
        state.claimed.delete(issue.id);
        state.completed.add(issue.id);
        // Workspace cleanup is handled by orchestrator caller
        break;
      }
      case 'keep_running':
        // Active state: update in-memory issue snapshot (SPEC 8.5)
        // Keep running, snapshot is updated via the running entry
        break;
      case 'stop_without_cleanup': {
        // Neither active nor terminal: terminate without workspace cleanup (SPEC 8.5)
        state.running.delete(issue.id);
        state.claimed.delete(issue.id);
        break;
      }
      default:
        break;
    }
  }
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

  if (entry === undefined) return;

  if (success) {
    state.completed.add(issueId);

    // Schedule continuation retry (1 second) — SPEC 7.1, 8.4
    state.claimed.delete(issueId);
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
    // Schedule exponential backoff retry — SPEC 8.4
    state.claimed.delete(issueId);
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
