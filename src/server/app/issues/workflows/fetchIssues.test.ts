import { describe, expect, it } from 'vitest';

import type { TrackerAdapter } from '../adapters/trackerAdapter.ts';
import type { Issue } from '../model.ts';

import {
  setTrackerAdapter,
  fetchIssues,
  fetchIssueStatesByIds,
  fetchIssuesByStates,
} from './fetchIssues.ts';

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
  it('returns null when adapter is null', async () => {
    setTrackerAdapter(null as unknown as TrackerAdapter);
    const result = await fetchIssues({} as never);
    expect(result).toBeNull();
  });

  it('delegates to adapter', async () => {
    setTrackerAdapter(makeAdapter('success'));
    const result = await fetchIssues({} as never);
    expect(result).not.toBeNull();
    if (result) expect(result.length).toBe(1);
  });

  it('returns null on adapter error', async () => {
    setTrackerAdapter(makeAdapter('error'));
    const result = await fetchIssues({} as never);
    expect(result).toBeNull();
  });
});

describe('fetchIssueStatesByIds', () => {
  it('returns null when adapter null', async () => {
    setTrackerAdapter(null as unknown as TrackerAdapter);
    const result = await fetchIssueStatesByIds({} as never, []);
    expect(result).toBeNull();
  });

  it('delegates to adapter', async () => {
    setTrackerAdapter(makeAdapter('success'));
    const result = await fetchIssueStatesByIds({} as never, ['i1']);
    expect(result).not.toBeNull();
    if (result) expect(result[0]?.state).toBe('In Progress');
  });
});

describe('fetchIssuesByStates', () => {
  it('returns null on adapter error', async () => {
    setTrackerAdapter(makeAdapter('error'));
    const result = await fetchIssuesByStates({} as never, ['Done']);
    expect(result).toBeNull();
  });
});
