/** Runtime state, session state, retry queue, and metrics models. */

export type RetryEntry = {
  readonly issue_id: string;
  readonly identifier: string;
  readonly attempt: number;
  readonly due_at_ms: number;
  readonly timer_handle?: ReturnType<typeof setTimeout>;
  readonly error: string | null;
};

export type RunningEntry = {
  readonly issue_id: string;
  readonly issue_identifier: string;
  readonly issue_state: string;
  readonly workspace_path: string;
  readonly started_at: number;
  readonly attempt: number | null;
  readonly turn_count: number;
  /** Last agent event timestamp for stall detection (SPEC 8.5) */
  readonly last_agent_timestamp?: number;
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
  readonly agent_totals: AgentTotals;
  readonly agent_rate_limits: Record<string, unknown> | null;
};
