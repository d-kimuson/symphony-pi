import { describe, expect, it } from 'vitest';

import { typedIncludes } from './typedIncludes.ts';

describe('typedIncludes', () => {
  const colors = ['red', 'green', 'blue'] as const;

  it('returns true when value is in array', () => {
    expect(typedIncludes(colors, 'red')).toBe(true);
    expect(typedIncludes(colors, 'blue')).toBe(true);
  });

  it('returns false when value is not in array', () => {
    expect(typedIncludes(colors, 'yellow')).toBe(false);
  });

  it('works as type guard when used in conditional', () => {
    const value: unknown = 'red';
    const included = typedIncludes(colors, value);
    expect(included).toBe(true);
    if (!included) {
      throw new Error('unexpected: value not in array');
    }
    // value is narrowed to "red" | "green" | "blue"
    const _: 'red' | 'green' | 'blue' = value;
    expect(_).toBe('red');
  });

  it('works with numeric arrays', () => {
    const nums = [1, 2, 3] as const;
    expect(typedIncludes(nums, 2)).toBe(true);
    expect(typedIncludes(nums, 5)).toBe(false);
  });
});
