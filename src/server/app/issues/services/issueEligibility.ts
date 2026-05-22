/** Pure issue normalization and eligibility helpers. */

import type { Issue } from '../model.js';

/**
 * Normalize labels to lowercase.
 */
export const normalizeLabels = (labels: readonly string[]): readonly string[] =>
  labels.map((l) => l.toLowerCase());

/**
 * Coerce priority to integer or null.
 * Non-integer values become null.
 */
export const normalizePriority = (priority: unknown): number | null => {
  if (typeof priority !== 'number') return null;
  if (!Number.isInteger(priority)) return null;
  return priority;
};

/**
 * Check if a state is in the active states list (case-insensitive).
 */
export const isActiveState = (state: string, activeStates: readonly string[]): boolean =>
  activeStates.some((s) => s.toLowerCase() === state.toLowerCase());

/**
 * Check if a state is in the terminal states list (case-insensitive).
 */
export const isTerminalState = (state: string, terminalStates: readonly string[]): boolean =>
  terminalStates.some((s) => s.toLowerCase() === state.toLowerCase());

/**
 * Check if a state is in the handoff states list (case-insensitive).
 */
export const isHandoffState = (state: string, handoffStates: readonly string[]): boolean =>
  handoffStates.some((s) => s.toLowerCase() === state.toLowerCase());

/**
 * Check if an issue has all required fields for dispatch.
 */
export const hasRequiredFields = (issue: Partial<Issue>): issue is Issue =>
  typeof issue.id === 'string' &&
  issue.id.length > 0 &&
  typeof issue.identifier === 'string' &&
  issue.identifier.length > 0 &&
  typeof issue.title === 'string' &&
  issue.title.length > 0 &&
  typeof issue.state === 'string' &&
  issue.state.length > 0;

/**
 * Blocker rule for dispatch: if the issue is in Todo state,
 * it can only be dispatched when all blockers are terminal.
 */
export const canDispatchBlockerRule = (
  issue: Issue,
  terminalStates: readonly string[],
): boolean => {
  if (issue.state.toLowerCase() !== 'todo') return true;
  if (issue.blocked_by.length === 0) return true;

  return issue.blocked_by.every((blocker) => {
    if (blocker.state === null) return false;
    return terminalStates.some((s) => s.toLowerCase() === blocker.state?.toLowerCase());
  });
};
