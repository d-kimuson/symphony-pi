import { describe, expect, it } from 'vitest';

import type { AgentRunnerEvent, LiveSession, RunAttempt, RunAttemptStatus } from './model.ts';

describe('RunAttemptStatus', () => {
  const allStatuses: readonly RunAttemptStatus[] = [
    'PreparingWorkspace',
    'BuildingPrompt',
    'LaunchingAgentProcess',
    'InitializingSession',
    'StreamingTurn',
    'Finishing',
    'Succeeded',
    'Failed',
    'TimedOut',
    'Stalled',
    'CanceledByReconciliation',
  ];

  it('has 11 statuses', () => {
    expect(allStatuses).toHaveLength(11);
  });
});

describe('RunAttempt', () => {
  const attempt: RunAttempt = {
    issue_id: 'abc123',
    issue_identifier: 'ABC-123',
    attempt: null,
    workspace_path: '/tmp/workspaces/ABC-123',
    started_at: 1700000000000,
    status: 'Succeeded',
    error: null,
  } as const satisfies RunAttempt;

  it('has all fields', () => {
    expect(attempt.issue_id).toBe('abc123');
    expect(attempt.status).toBe('Succeeded');
    expect(attempt.attempt).toBeNull();
    expect(attempt.error).toBeNull();
  });

  it('attempt can be an integer for retries', () => {
    const retry: RunAttempt = { ...attempt, attempt: 2 };
    expect(retry.attempt).toBe(2);
  });
});

describe('LiveSession', () => {
  const session: LiveSession = {
    session_id: 'pi:thread-1:turn-1',
    thread_id: 'thread-1',
    turn_id: 'turn-1',
    agent_process_pid: null,
    last_agent_event: 'turn_completed',
    last_agent_timestamp: 1700000000000,
    last_agent_message: 'completed',
    agent_input_tokens: 100,
    agent_output_tokens: 50,
    agent_total_tokens: 150,
    last_reported_input_tokens: 100,
    last_reported_output_tokens: 50,
    last_reported_total_tokens: 150,
    turn_count: 1,
  } as const satisfies LiveSession;

  it('composes session_id from thread_id and turn_id', () => {
    expect(session.session_id).toBe('pi:thread-1:turn-1');
  });

  it('tracks token counts', () => {
    expect(session.agent_total_tokens).toBe(150);
  });
});

describe('AgentRunnerEvent (discriminated union)', () => {
  const base = {
    timestamp: '2024-01-01T00:00:00Z',
    session_id: 'pi:thread-1:turn-1',
    thread_id: 'thread-1',
    turn_id: 'turn-1',
  } as const;

  it('session_started event', () => {
    const evt: AgentRunnerEvent = { ...base, event: 'session_started', agent_process_pid: null };
    expect(evt.event).toBe('session_started');
    expect(evt.agent_process_pid).toBeNull();
  });

  it('startup_failed event', () => {
    const evt: AgentRunnerEvent = { ...base, event: 'startup_failed', error: 'failed' };
    expect(evt.event).toBe('startup_failed');
    expect(evt.error).toBe('failed');
  });

  it('turn_completed event with tokens', () => {
    const evt: AgentRunnerEvent = {
      ...base,
      event: 'turn_completed',
      input_tokens: 100,
      output_tokens: 50,
    };
    expect(evt.event).toBe('turn_completed');
    expect(evt.input_tokens).toBe(100);
  });

  it('turn_failed event', () => {
    const evt: AgentRunnerEvent = { ...base, event: 'turn_failed', error: 'timeout' };
    expect(evt.event).toBe('turn_failed');
    expect(evt.error).toBe('timeout');
  });

  it('turn_cancelled event', () => {
    const evt: AgentRunnerEvent = { ...base, event: 'turn_cancelled' };
    expect(evt.event).toBe('turn_cancelled');
  });

  it('tool_execution_start event', () => {
    const evt: AgentRunnerEvent = {
      ...base,
      event: 'tool_execution_start',
      tool_name: 'read',
    };
    expect(evt.event).toBe('tool_execution_start');
    expect(evt.tool_name).toBe('read');
  });

  it('malformed event', () => {
    const evt: AgentRunnerEvent = { ...base, event: 'malformed', error: 'invalid json' };
    expect(evt.event).toBe('malformed');
    expect(evt.error).toBe('invalid json');
  });
});
