import type { AgentTotals } from '../orchestrator/model.ts';
import type { RuntimeMode } from '../runtime/model.ts';

export type RunningRow = {
  readonly project_id: string;
  readonly project_root: string;
  readonly workflow_path: string;
  readonly issue_id: string;
  readonly issue_identifier: string;
  readonly turn_count: number;
  readonly started_at: string;
  readonly attempt: number | null;
};

export type RetryRow = {
  readonly project_id: string;
  readonly project_root: string;
  readonly workflow_path: string;
  readonly issue_id: string;
  readonly identifier: string;
  readonly attempt: number;
  readonly due_at_ms: number;
  readonly error: string | null;
};

export type RuntimeSnapshot = {
  readonly mode: RuntimeMode;
  readonly generated_at: string;
  readonly counts: {
    readonly projects: number;
    readonly running: number;
    readonly retrying: number;
  };
  readonly running: readonly RunningRow[];
  readonly retrying: readonly RetryRow[];
  readonly agent_totals: AgentTotals;
  readonly rate_limits: Record<string, unknown> | null;
};

export type ProjectStateSnapshot = {
  readonly project_id: string;
  readonly project_root: string;
  readonly workflow_path: string;
  readonly generated_at: string;
  readonly counts: {
    readonly running: number;
    readonly retrying: number;
    readonly completed: number;
  };
  readonly poll_interval_ms: number;
  readonly max_concurrent_agents: number;
  readonly running: readonly RunningRow[];
  readonly retrying: readonly RetryRow[];
  readonly agent_totals: AgentTotals;
  readonly rate_limits: Record<string, unknown> | null;
};

export type ProjectSummary = {
  readonly project_id: string;
  readonly project_root: string;
  readonly workflow_path: string;
  readonly counts: {
    readonly running: number;
    readonly retrying: number;
    readonly completed: number;
  };
  readonly poll_interval_ms: number;
  readonly max_concurrent_agents: number;
};

export type ProjectsSnapshot = {
  readonly mode: RuntimeMode;
  readonly generated_at: string;
  readonly projects: readonly ProjectSummary[];
};
