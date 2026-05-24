import { describe, expect, it } from 'vitest';

import type { TrackerAdapter } from '../adapters/trackerAdapter.ts';
import type { Issue } from '../model.ts';

import { fetchIssues, fetchIssueStatesByIds, fetchIssuesByStates } from './fetchIssues.ts';

const makeAdapter = (behavior: 'success' | 'error' | 'null' = 'success'): TrackerAdapter => ({
  fetchCandidateIssues: async () => {
    if (behavior === 'error') throw new Error('API down');
    if (behavior === 'null') return null as unknown as readonly Issue[];
    return [
      {
        id: 'i1',
        identifier: 'T-1',
        title: 'Test',
        description: null,
        priority: 1,
        state: 'Todo',
        branch_name: null,
        url: null,
        labels: [],
        blocked_by: [],
        created_at: null,
        updated_at: null,
      },
    ];
  },
  fetchIssuesByStates: async () => {
    if (behavior === 'error') throw new Error('API down');
    return [
      {
        id: 'i2',
        identifier: 'T-2',
        title: 'Done Issue',
        description: null,
        priority: null,
        state: 'Done',
        branch_name: null,
        url: null,
        labels: [],
        blocked_by: [],
        created_at: null,
        updated_at: null,
      },
    ];
  },
  fetchIssueStatesByIds: async () => {
    if (behavior === 'error') throw new Error('API down');
    return [
      {
        id: 'i1',
        identifier: 'T-1',
        title: 'Test',
        description: null,
        priority: 1,
        state: 'In Progress',
        branch_name: null,
        url: null,
        labels: [],
        blocked_by: [],
        created_at: null,
        updated_at: null,
      },
    ];
  },
});

describe('fetchIssues', () => {
  it('delegates to adapter', async () => {
    const result = await fetchIssues(makeAdapter('success'));
    expect(result).not.toBeNull();
    if (result) expect(result.length).toBe(1);
  });

  it('returns null on adapter error', async () => {
    const result = await fetchIssues(makeAdapter('error'));
    expect(result).toBeNull();
  });
});

describe('fetchIssueStatesByIds', () => {
  it('returns empty array when no ids requested', async () => {
    const result = await fetchIssueStatesByIds(makeAdapter('success'), []);
    expect(result).toEqual([]);
  });

  it('delegates to adapter', async () => {
    const result = await fetchIssueStatesByIds(makeAdapter('success'), ['i1']);
    expect(result).not.toBeNull();
    if (result) expect(result[0]?.state).toBe('In Progress');
  });
});

describe('fetchIssuesByStates', () => {
  it('returns rows on success', async () => {
    const result = await fetchIssuesByStates(makeAdapter('success'), ['Done']);
    expect(result).not.toBeNull();
    if (result) expect(result[0]?.identifier).toBe('T-2');
  });

  it('returns null on adapter error', async () => {
    const result = await fetchIssuesByStates(makeAdapter('error'), ['Done']);
    expect(result).toBeNull();
  });
});
