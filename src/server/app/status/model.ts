/** Read models for runtime status and operational debugging APIs. */

import type { AgentTotals } from '../orchestrator/model.js';

export type RunningRow = {
  readonly issue_id: string;
  readonly issue_identifier: string;
  readonly turn_count: number;
  readonly started_at: string;
  readonly attempt: number | null;
};

export type RetryRow = {
  readonly issue_id: string;
  readonly identifier: string;
  readonly attempt: number;
  readonly due_at_ms: number;
  readonly error: string | null;
};

export type RuntimeSnapshot = {
  readonly generated_at: string;
  readonly counts: {
    readonly running: number;
    readonly retrying: number;
  };
  readonly running: readonly RunningRow[];
  readonly retrying: readonly RetryRow[];
  readonly agent_totals: AgentTotals;
  readonly rate_limits: Record<string, unknown> | null;
};
