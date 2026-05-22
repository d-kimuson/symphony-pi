/** Runtime schemas for issue-tracker payload boundaries. */

import type { Issue } from './model.js';

export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly string[] };

/**
 * Validate that a tracker payload conforms to the Issue model.
 * Returns validation errors for missing required fields.
 */
export const validateIssuePayload = (payload: Record<string, unknown>): ValidationResult => {
  const errors: string[] = [];

  if (typeof payload['id'] !== 'string' || payload['id'].length === 0) {
    errors.push('Missing or invalid id');
  }
  if (typeof payload['identifier'] !== 'string' || payload['identifier'].length === 0) {
    errors.push('Missing or invalid identifier');
  }
  if (typeof payload['title'] !== 'string' || payload['title'].length === 0) {
    errors.push('Missing or invalid title');
  }
  if (typeof payload['state'] !== 'string' || payload['state'].length === 0) {
    errors.push('Missing or invalid state');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
};

/**
 * Check if a value looks like a valid Issue after validation.
 */
export const isIssue = (value: unknown): value is Issue => {
  if (value === null || typeof value !== 'object') return false;
  // oxlint-disable-next-line no-unsafe-type-assertion
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['id'] === 'string' &&
    obj['id'].length > 0 &&
    typeof obj['identifier'] === 'string' &&
    obj['identifier'].length > 0 &&
    typeof obj['title'] === 'string' &&
    obj['title'].length > 0 &&
    typeof obj['state'] === 'string' &&
    obj['state'].length > 0
  );
};
