import { describe, expect, it } from 'vitest';

import type { ProjectStateSnapshot, RuntimeSnapshot, RunningRow, RetryRow } from './model.ts';

describe('RunningRow', () => {
  const row: RunningRow = {
    project_id: 'alpha',
    project_root: '/repos/alpha',
    workflow_path: '/repos/alpha/WORKFLOW.md',
    issue_id: 'abc123',
    issue_identifier: 'ABC-123',
    turn_count: 3,
    started_at: '2024-01-01T00:00:00Z',
    attempt: null,
  } as const satisfies RunningRow;

  it('has all fields for status display', () => {
    expect(row.project_id).toBe('alpha');
    expect(row.issue_id).toBe('abc123');
    expect(row.turn_count).toBe(3);
  });
});

describe('RetryRow', () => {
  const row: RetryRow = {
    project_id: 'alpha',
    project_root: '/repos/alpha',
    workflow_path: '/repos/alpha/WORKFLOW.md',
    issue_id: 'def456',
    identifier: 'DEF-456',
    attempt: 2,
    due_at_ms: 1700000005000,
    error: 'timeout',
  } as const satisfies RetryRow;

  it('has all fields for retry display', () => {
    expect(row.project_id).toBe('alpha');
    expect(row.attempt).toBe(2);
    expect(row.error).toBe('timeout');
  });
});

describe('RuntimeSnapshot', () => {
  const snapshot: RuntimeSnapshot = {
    mode: 'multi-project',
    generated_at: '2024-01-01T12:00:00Z',
    counts: { projects: 2, running: 2, retrying: 1 },
    running: [
      {
        project_id: 'alpha',
        project_root: '/repos/alpha',
        workflow_path: '/repos/alpha/WORKFLOW.md',
        issue_id: 'a',
        issue_identifier: 'A-1',
        turn_count: 1,
        started_at: '2024-01-01T11:00:00Z',
        attempt: null,
      },
    ],
    retrying: [
      {
        project_id: 'beta',
        project_root: '/repos/beta',
        workflow_path: '/repos/beta/WORKFLOW.md',
        issue_id: 'b',
        identifier: 'B-1',
        attempt: 1,
        due_at_ms: 1700000000000,
        error: null,
      },
    ],
    agent_totals: {
      input_tokens: 500,
      output_tokens: 250,
      total_tokens: 750,
      seconds_running: 120,
    },
    rate_limits: null,
  } as const satisfies RuntimeSnapshot;

  it('includes mode, counts, running, retrying, totals, and rate limits', () => {
    expect(snapshot.mode).toBe('multi-project');
    expect(snapshot.counts.projects).toBe(2);
    expect(snapshot.running).toHaveLength(1);
    expect(snapshot.retrying).toHaveLength(1);
  });
});

describe('ProjectStateSnapshot', () => {
  const snapshot: ProjectStateSnapshot = {
    project_id: 'alpha',
    project_root: '/repos/alpha',
    workflow_path: '/repos/alpha/WORKFLOW.md',
    generated_at: '2024-01-01T12:00:00Z',
    counts: { running: 1, retrying: 0, completed: 2 },
    poll_interval_ms: 30000,
    max_concurrent_agents: 10,
    running: [],
    retrying: [],
    agent_totals: {
      input_tokens: 1,
      output_tokens: 2,
      total_tokens: 3,
      seconds_running: 4,
    },
    rate_limits: null,
  } as const satisfies ProjectStateSnapshot;

  it('includes project metadata and project-local counts', () => {
    expect(snapshot.project_id).toBe('alpha');
    expect(snapshot.counts.completed).toBe(2);
    expect(snapshot.poll_interval_ms).toBe(30000);
  });
});
