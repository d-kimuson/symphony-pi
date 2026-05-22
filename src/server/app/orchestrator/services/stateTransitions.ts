/** Pure orchestrator state transition and scheduling-decision helpers. */

import type { EffectiveConfig } from '../../config/model.js';
import type { Issue } from '../../issues/model.js';
import type { RetryEntry, RunningEntry } from '../model.js';

import {
  isActiveState,
  isTerminalState,
  canDispatchBlockerRule,
  hasRequiredFields,
} from '../../issues/services/issueEligibility.js';

/**
 * Sort candidates by dispatch priority:
 * 1. priority ascending (null sorts last)
 * 2. created_at oldest first
 * 3. identifier lexicographic tie-breaker
 */
export const sortCandidatesByPriority = (issues: readonly Issue[]): readonly Issue[] => {
  const sorted = [...issues];
  sorted.sort((a, b) => {
    // Priority: lower numbers first, null last
    const pa = a.priority;
    const pb = b.priority;

    if (pa !== null && pb !== null) {
      if (pa !== pb) return pa - pb;
    } else if (pa !== null) {
      return -1; // a has priority, b doesn't → a first
    } else if (pb !== null) {
      return 1; // b has priority, a doesn't → b first
    }

    // Created at: oldest first
    const ca = a.created_at ?? '';
    const cb = b.created_at ?? '';
    if (ca !== cb) return ca.localeCompare(cb);

    // Identifier lexicographic
    return a.identifier.localeCompare(b.identifier);
  });
  return sorted;
};

/**
 * Check if an issue is eligible for dispatch.
 */
export const isDispatchEligible = (
  issue: Issue,
  config: EffectiveConfig,
  running: Map<string, RunningEntry>,
  claimed: Set<string>,
): boolean => {
  // Required fields
  if (!hasRequiredFields(issue)) return false;

  // State must be active and not terminal
  if (!isActiveState(issue.state, config.tracker.active_states)) return false;
  if (isTerminalState(issue.state, config.tracker.terminal_states)) return false;

  // Not already running or claimed
  if (running.has(issue.id)) return false;
  if (claimed.has(issue.id)) return false;

  // Blocker rule for Todo state
  if (!canDispatchBlockerRule(issue, config.tracker.terminal_states)) return false;

  return true;
};

/**
 * Check if global concurrency slots are available.
 */
export const hasGlobalSlots = (
  config: EffectiveConfig,
  running: Map<string, RunningEntry>,
): boolean => running.size < config.agent.max_concurrent_agents;

/**
 * Check if per-state concurrency slots are available.
 */
export const hasStateSlots = (
  state: string,
  config: EffectiveConfig,
  running: Map<string, RunningEntry>,
): boolean => {
  const stateLimit = config.agent.max_concurrent_agents_by_state[state.toLowerCase()];
  if (stateLimit === undefined) return true; // no state-specific limit

  // Simplified: count all running since we don't track issue state in RunningEntry
  // In practice, we'd need to track the issue state in the running entry
  return running.size < stateLimit;
};

/**
 * Calculate retry backoff delay.
 * Normal continuation: 1000ms
 * Failure: min(10000 * 2^(attempt - 1), max_retry_backoff_ms)
 */
export const calculateRetryDelay = (
  attempt: number,
  isNormalContinuation: boolean,
  maxRetryBackoffMs: number,
): number => {
  if (isNormalContinuation) return 1000;

  const exponential = 10000 * Math.pow(2, attempt - 1);
  return Math.min(exponential, maxRetryBackoffMs);
};

/**
 * Create a retry entry for an issue.
 */
export const createRetryEntry = (
  issueId: string,
  identifier: string,
  attempt: number,
  isNormalContinuation: boolean,
  maxRetryBackoffMs: number,
  error: string | null,
): RetryEntry => {
  const delayMs = calculateRetryDelay(attempt, isNormalContinuation, maxRetryBackoffMs);

  return {
    issue_id: issueId,
    identifier,
    attempt,
    due_at_ms: Date.now() + delayMs,
    error,
  };
};

/**
 * Check if a running session is stalled.
 */
export const isSessionStalled = (
  entry: RunningEntry,
  stallTimeoutMs: number,
  lastAgentTimestamp: number | null,
): boolean => {
  if (stallTimeoutMs <= 0) return false;

  const referenceTime = lastAgentTimestamp ?? entry.started_at;
  const elapsed = Date.now() - referenceTime;

  return elapsed > stallTimeoutMs;
};

/**
 * Determine if a tracker state update requires stopping the worker.
 */
export type ReconciliationAction =
  | { readonly action: 'keep_running'; readonly updatedState: string }
  | { readonly action: 'stop_and_cleanup' }
  | { readonly action: 'stop_without_cleanup' };

export const determineReconciliationAction = (
  currentState: string,
  config: EffectiveConfig,
): ReconciliationAction => {
  if (isTerminalState(currentState, config.tracker.terminal_states)) {
    return { action: 'stop_and_cleanup' };
  }

  if (isActiveState(currentState, config.tracker.active_states)) {
    return { action: 'keep_running', updatedState: currentState };
  }

  // State is neither active nor terminal (could be handoff or unknown)
  return { action: 'stop_without_cleanup' };
};
