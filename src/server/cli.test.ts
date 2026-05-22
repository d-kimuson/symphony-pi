import { describe, expect, it } from 'vitest';

import { parseCliArgs } from './cli.js';

describe('parseCliArgs', () => {
  it('returns empty object for no args', () => {
    const result = parseCliArgs(['node', 'main.ts']);
    expect(result).toEqual({});
  });

  it('parses --port flag', () => {
    const result = parseCliArgs(['node', 'main.ts', '--port', '9999']);
    expect(result).toEqual({ port: 9999 });
  });

  it('returns undefined port for invalid value', () => {
    const result = parseCliArgs(['node', 'main.ts', '--port', 'not-a-number']);
    expect(result).toEqual({});
  });

  it('handles multiple args', () => {
    const result = parseCliArgs(['node', 'main.ts', '--port', '5555', '--other']);
    expect(result).toEqual({ port: 5555 });
  });
});
