import { describe, expect, it } from 'vitest';

import type { Issue } from '../model.ts';

import {
  canDispatchBlockerRule,
  hasRequiredFields,
  isActiveState,
  isHandoffState,
  isTerminalState,
  normalizeLabels,
  normalizePriority,
} from './issueEligibility.ts';

const activeStates = ['Todo', 'In Progress'] as const;
const terminalStates = ['Closed', 'Cancelled', 'Done'] as const;
const handoffStates = ['Human Review', 'Code Review'] as const;

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: '1',
  identifier: 'TEST-1',
  title: 'Test',
  description: null,
  priority: null,
  state: 'Todo',
  branch_name: null,
  url: null,
  labels: [],
  blocked_by: [],
  created_at: null,
  updated_at: null,
  ...overrides,
});

describe('normalizeLabels', () => {
  it('lowercases all labels', () => {
    expect(normalizeLabels(['Bug', 'FrontEnd', 'HIGH'])).toEqual(['bug', 'frontend', 'high']);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeLabels([])).toEqual([]);
  });
});

describe('normalizePriority', () => {
  it('returns integer as-is', () => {
    expect(normalizePriority(1)).toBe(1);
  });

  it('returns null for non-integer number', () => {
    expect(normalizePriority(1.5)).toBeNull();
  });

  it('returns null for string', () => {
    expect(normalizePriority('high')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizePriority(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(normalizePriority(null)).toBeNull();
  });
});

describe('isActiveState', () => {
  it('matches exact state', () => {
    expect(isActiveState('Todo', activeStates)).toBe(true);
  });

  it('matches case-insensitive', () => {
    expect(isActiveState('todo', activeStates)).toBe(true);
    expect(isActiveState('TODO', activeStates)).toBe(true);
  });

  it('does not match non-active state', () => {
    expect(isActiveState('Done', activeStates)).toBe(false);
  });
});

describe('isTerminalState', () => {
  it('matches exact terminal state', () => {
    expect(isTerminalState('Closed', terminalStates)).toBe(true);
  });

  it('matches case-insensitive', () => {
    expect(isTerminalState('done', terminalStates)).toBe(true);
    expect(isTerminalState('CANCELLED', terminalStates)).toBe(true);
  });

  it('does not match active state', () => {
    expect(isTerminalState('Todo', terminalStates)).toBe(false);
  });
});

describe('isHandoffState', () => {
  it('matches exact handoff state', () => {
    expect(isHandoffState('Human Review', handoffStates)).toBe(true);
  });

  it('matches case-insensitive', () => {
    expect(isHandoffState('code review', handoffStates)).toBe(true);
  });

  it('does not match non-handoff state', () => {
    expect(isHandoffState('Todo', handoffStates)).toBe(false);
  });
});

describe('hasRequiredFields', () => {
  it('returns true for complete issue', () => {
    expect(hasRequiredFields(makeIssue())).toBe(true);
  });

  it('returns false when id is missing', () => {
    expect(hasRequiredFields({ ...makeIssue(), id: undefined })).toBe(false);
  });

  it('returns false when identifier is missing', () => {
    expect(hasRequiredFields({ ...makeIssue(), identifier: undefined })).toBe(false);
  });

  it('returns false when title is missing', () => {
    expect(hasRequiredFields({ ...makeIssue(), title: undefined })).toBe(false);
  });

  it('returns false when state is missing', () => {
    expect(hasRequiredFields({ ...makeIssue(), state: undefined })).toBe(false);
  });
});

describe('canDispatchBlockerRule', () => {
  it('allows dispatch when state is not Todo', () => {
    const issue = makeIssue({
      state: 'In Progress',
      blocked_by: [{ id: 'b1', identifier: null, state: 'Todo' }],
    });
    expect(canDispatchBlockerRule(issue, terminalStates)).toBe(true);
  });

  it('allows dispatch when Todo and no blockers', () => {
    const issue = makeIssue({ state: 'Todo', blocked_by: [] });
    expect(canDispatchBlockerRule(issue, terminalStates)).toBe(true);
  });

  it('allows dispatch when Todo and all blockers are terminal', () => {
    const issue = makeIssue({
      state: 'Todo',
      blocked_by: [
        { id: 'b1', identifier: 'B-1', state: 'Done' },
        { id: 'b2', identifier: 'B-2', state: 'Closed' },
      ],
    });
    expect(canDispatchBlockerRule(issue, terminalStates)).toBe(true);
  });

  it('blocks dispatch when Todo and a blocker is not terminal', () => {
    const issue = makeIssue({
      state: 'Todo',
      blocked_by: [
        { id: 'b1', identifier: 'B-1', state: 'Done' },
        { id: 'b2', identifier: 'B-2', state: 'In Progress' },
      ],
    });
    expect(canDispatchBlockerRule(issue, terminalStates)).toBe(false);
  });

  it('blocks dispatch when a blocker has null state', () => {
    const issue = makeIssue({
      state: 'Todo',
      blocked_by: [{ id: 'b1', identifier: 'B-1', state: null }],
    });
    expect(canDispatchBlockerRule(issue, terminalStates)).toBe(false);
  });
});
