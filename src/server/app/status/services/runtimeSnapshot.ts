/** Pure projection from orchestrator runtime state to status read models. */

import type { OrchestratorState } from '../../orchestrator/model.ts';
import type { RuntimeSnapshot, RunningRow, RetryRow } from '../model.ts';

/**
 * Build a runtime snapshot from orchestrator state.
 */
export const buildRuntimeSnapshot = (state: OrchestratorState): RuntimeSnapshot => {
  const runningRows: RunningRow[] = [...state.running.entries()].map(([, entry]) => ({
    issue_id: entry.issue_id,
    issue_identifier: entry.issue_identifier,
    turn_count: entry.turn_count,
    started_at: new Date(entry.started_at).toISOString(),
    attempt: entry.attempt,
  }));

  const retryRows: RetryRow[] = [...state.retry_attempts.entries()].map(([, entry]) => ({
    issue_id: entry.issue_id,
    identifier: entry.identifier,
    attempt: entry.attempt,
    due_at_ms: entry.due_at_ms,
    error: entry.error,
  }));

  return {
    generated_at: new Date().toISOString(),
    counts: {
      running: state.running.size,
      retrying: state.retry_attempts.size,
    },
    running: runningRows,
    retrying: retryRows,
    agent_totals: state.agent_totals,
    rate_limits: state.agent_rate_limits,
  };
};
