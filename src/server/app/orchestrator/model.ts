/** Runtime state, session state, retry queue, and metrics models. */

export type RetryEntry = {
  readonly issue_id: string;
  readonly identifier: string;
  readonly attempt: number;
  readonly due_at_ms: number;
  readonly timer_handle?: ReturnType<typeof setTimeout>;
  readonly error: string | null;
  readonly session_file: string | null;
  readonly dirty_auto_resume_count: number;
};

export type RunningEntry = {
  readonly issue_id: string;
  readonly issue_identifier: string;
  issue_state: string;
  readonly workspace_path: string;
  readonly started_at: number;
  attempt: number | null;
  session_id: string | null;
  session_file: string | null;
  dirty_auto_resume_count: number;
  turn_count: number;
  /** Last agent event timestamp for stall detection (SPEC 8.5) */
  last_agent_timestamp?: number;
  /** Abort controller for cancelling the background worker during reconciliation (SPEC 8.5) */
  readonly abortController: AbortController;
};

export type AgentTotals = {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly total_tokens: number;
  readonly seconds_running: number;
};

export type OrchestratorState = {
  poll_interval_ms: number;
  max_concurrent_agents: number;
  readonly running: Map<string, RunningEntry>;
  readonly claimed: Set<string>;
  readonly retry_attempts: Map<string, RetryEntry>;
  readonly completed: Set<string>;
  agent_totals: AgentTotals;
  agent_rate_limits: Record<string, unknown> | null;
};
