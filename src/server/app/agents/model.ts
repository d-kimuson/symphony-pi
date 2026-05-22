/** Agent session, prompt rendering, and stream event models. */

export type RunAttemptStatus =
  | 'PreparingWorkspace'
  | 'BuildingPrompt'
  | 'LaunchingAgentProcess'
  | 'InitializingSession'
  | 'StreamingTurn'
  | 'Finishing'
  | 'Succeeded'
  | 'Failed'
  | 'TimedOut'
  | 'Stalled'
  | 'CanceledByReconciliation';

export type RunAttempt = {
  readonly issue_id: string;
  readonly issue_identifier: string;
  readonly attempt: number | null;
  readonly workspace_path: string;
  readonly started_at: number;
  readonly status: RunAttemptStatus;
  readonly error: string | null;
};

export type LiveSession = {
  readonly session_id: string;
  readonly thread_id: string;
  readonly turn_id: string;
  readonly agent_process_pid: string | null;
  readonly last_agent_event: string | null;
  readonly last_agent_timestamp: number | null;
  readonly last_agent_message: string | null;
  readonly agent_input_tokens: number;
  readonly agent_output_tokens: number;
  readonly agent_total_tokens: number;
  readonly last_reported_input_tokens: number;
  readonly last_reported_output_tokens: number;
  readonly last_reported_total_tokens: number;
  readonly turn_count: number;
};

export type AgentRunnerEvent =
  | {
      readonly event: 'session_started';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
      readonly agent_process_pid: null;
    }
  | {
      readonly event: 'startup_failed';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
      readonly error: string;
    }
  | {
      readonly event: 'turn_completed';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
      readonly input_tokens?: number;
      readonly output_tokens?: number;
      readonly cache_read_input_tokens?: number;
      readonly cache_creation_input_tokens?: number;
    }
  | {
      readonly event: 'turn_failed';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
      readonly error: string;
    }
  | {
      readonly event: 'turn_cancelled';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
    }
  | {
      readonly event: 'turn_ended_with_error';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
      readonly error: string;
    }
  | {
      readonly event: 'turn_input_required';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
    }
  | {
      readonly event: 'tool_execution_start';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
      readonly tool_name: string;
    }
  | {
      readonly event: 'tool_execution_update';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
      readonly tool_name: string;
    }
  | {
      readonly event: 'tool_execution_end';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
      readonly tool_name: string;
    }
  | {
      readonly event: 'notification';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
      readonly message: string;
    }
  | {
      readonly event: 'other_message';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
    }
  | {
      readonly event: 'malformed';
      readonly timestamp: string;
      readonly session_id: string;
      readonly thread_id: string;
      readonly turn_id: string;
      readonly error: string;
    };
