import { describe, expect, it } from 'vitest';

import type { BlockerRef, Issue } from './model.ts';

describe('Issue type', () => {
  const sampleIssue: Issue = {
    id: 'abc-123-id',
    identifier: 'ABC-123',
    title: 'Test issue',
    description: 'A test issue description',
    priority: 1,
    state: 'Todo',
    branch_name: null,
    url: 'https://linear.app/issue/ABC-123',
    labels: ['bug', 'frontend'],
    blocked_by: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  } as const satisfies Issue;

  it('has all required fields', () => {
    expect(sampleIssue.id).toBe('abc-123-id');
    expect(sampleIssue.identifier).toBe('ABC-123');
    expect(sampleIssue.title).toBe('Test issue');
    expect(sampleIssue.state).toBe('Todo');
  });

  it('allows null description', () => {
    const issue: Issue = { ...sampleIssue, description: null };
    expect(issue.description).toBeNull();
  });

  it('allows null priority', () => {
    const issue: Issue = { ...sampleIssue, priority: null };
    expect(issue.priority).toBeNull();
  });

  it('has labels as readonly string array', () => {
    expect(sampleIssue.labels).toEqual(['bug', 'frontend']);
  });
});

describe('BlockerRef', () => {
  it('has required fields', () => {
    const b: BlockerRef = { id: 'blocker-1', identifier: 'TEAM-1', state: 'In Progress' };
    expect(b.id).toBe('blocker-1');
    expect(b.identifier).toBe('TEAM-1');
    expect(b.state).toBe('In Progress');
  });

  it('can have all null fields', () => {
    const empty: BlockerRef = { id: null, identifier: null, state: null };
    expect(empty.id).toBeNull();
    expect(empty.identifier).toBeNull();
    expect(empty.state).toBeNull();
  });

  it('can have partial info', () => {
    const partial: BlockerRef = { id: 'id1', identifier: null, state: 'Done' };
    expect(partial.id).toBe('id1');
    expect(partial.state).toBe('Done');
  });
});
