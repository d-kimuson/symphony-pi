import { describe, expect, it } from 'vitest';

import { isIssue, validateIssuePayload } from './schema.js';

describe('validateIssuePayload', () => {
  it('returns valid for a complete payload', () => {
    const result = validateIssuePayload({
      id: '123',
      identifier: 'ABC-1',
      title: 'Test',
      state: 'Todo',
    });
    expect(result.valid).toBe(true);
  });

  it('returns invalid with missing id', () => {
    const result = validateIssuePayload({
      identifier: 'ABC-1',
      title: 'Test',
      state: 'Todo',
    });
    if (result.valid) throw new Error('expected invalid');
    expect(result.errors).toContain('Missing or invalid id');
  });

  it('returns invalid with missing identifier', () => {
    const result = validateIssuePayload({
      id: '123',
      title: 'Test',
      state: 'Todo',
    });
    if (result.valid) throw new Error('expected invalid');
    expect(result.errors).toContain('Missing or invalid identifier');
  });

  it('returns invalid with missing title', () => {
    const result = validateIssuePayload({
      id: '123',
      identifier: 'ABC-1',
      state: 'Todo',
    });
    if (result.valid) throw new Error('expected invalid');
    expect(result.errors).toContain('Missing or invalid title');
  });

  it('returns invalid with missing state', () => {
    const result = validateIssuePayload({
      id: '123',
      identifier: 'ABC-1',
      title: 'Test',
    });
    if (result.valid) throw new Error('expected invalid');
    expect(result.errors).toContain('Missing or invalid state');
  });

  it('returns invalid with empty id string', () => {
    const result = validateIssuePayload({
      id: '',
      identifier: 'ABC-1',
      title: 'Test',
      state: 'Todo',
    });
    expect(result.valid).toBe(false);
  });
});

describe('isIssue', () => {
  it('returns true for valid issue', () => {
    expect(
      isIssue({
        id: '123',
        identifier: 'ABC-1',
        title: 'Test',
        state: 'Todo',
      }),
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isIssue(null)).toBe(false);
  });

  it('returns false for object missing state', () => {
    expect(isIssue({ id: '123', identifier: 'ABC-1', title: 'Test' })).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isIssue('string')).toBe(false);
  });
});
