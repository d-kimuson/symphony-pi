/** Domain types for resolved runtime configuration. */

export type TrackerKind = 'linear' | 'jira';

export type LinearTrackerConfig = {
  readonly kind: 'linear';
  readonly api_key: string;
  readonly endpoint: string;
  readonly project_slug: string;
  readonly active_states: readonly string[];
  readonly terminal_states: readonly string[];
  readonly handoff_states: readonly string[];
  readonly transition_states: readonly string[];
};

export type JiraTrackerConfig = {
  readonly kind: 'jira';
  readonly api_key: string;
  readonly email: string;
  readonly base_url: string;
  readonly project_key: string | null;
  readonly jql: string | null;
  readonly active_states: readonly string[];
  readonly terminal_states: readonly string[];
  readonly handoff_states: readonly string[];
  readonly transition_states: readonly string[];
};

export type TrackerConfig = LinearTrackerConfig | JiraTrackerConfig;

export type EffectiveConfig = {
  readonly tracker: TrackerConfig;
  readonly polling: {
    readonly interval_ms: number;
  };
  readonly workspace: {
    readonly root: string;
  };
  readonly hooks: {
    readonly after_create: string | null;
    readonly before_run: string | null;
    readonly after_run: string | null;
    readonly before_remove: string | null;
    readonly timeout_ms: number;
  };
  readonly agent: {
    readonly max_concurrent_agents: number;
    readonly max_turns: number;
    readonly max_retry_backoff_ms: number;
    readonly max_concurrent_agents_by_state: Readonly<Record<string, number>>;
  };
  readonly pi: {
    readonly model: string | null;
    readonly thinking: string | null;
    readonly tools: readonly string[];
    readonly session_dir: string | null;
    readonly turn_timeout_ms: number;
    readonly stall_timeout_ms: number;
  };
  readonly server: {
    readonly port: number;
    readonly host: string;
  };
  /** Rendered prompt template from WORKFLOW.md */
  readonly prompt_template?: string | null;
};
