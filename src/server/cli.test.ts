import { describe, expect, it } from 'vitest';

import { parseCliArgs } from './cli.ts';

describe('parseCliArgs', () => {
  it('parses start command', () => {
    expect(parseCliArgs(['node', 'cli.ts', 'start'])).toEqual({
      command: 'start',
      port: undefined,
    });
  });

  it('parses start --port', () => {
    expect(parseCliArgs(['node', 'cli.ts', 'start', '--port', '9999'])).toEqual({
      command: 'start',
      port: 9999,
    });
  });

  it('parses start -p shorthand', () => {
    expect(parseCliArgs(['node', 'cli.ts', 'start', '-p', '4242'])).toEqual({
      command: 'start',
      port: 4242,
    });
  });

  it('parses projects list command', () => {
    expect(parseCliArgs(['node', 'cli.ts', 'projects', 'list'])).toEqual({
      command: 'projects-list',
    });
  });

  it('parses projects add command', () => {
    expect(parseCliArgs(['node', 'cli.ts', 'projects', 'add'])).toEqual({
      command: 'projects-add',
    });
  });

  it('parses projects delete command', () => {
    expect(parseCliArgs(['node', 'cli.ts', 'projects', 'delete'])).toEqual({
      command: 'projects-delete',
    });
  });

  it('rejects invalid port values', () => {
    expect(() => parseCliArgs(['node', 'cli.ts', 'start', '--port', 'not-a-number'])).toThrow(
      'Invalid port',
    );
    expect(() => parseCliArgs(['node', 'cli.ts', 'start', '--port', '0'])).toThrow('Invalid port');
    expect(() => parseCliArgs(['node', 'cli.ts', 'start', '--port', '99999'])).toThrow(
      'Invalid port',
    );
  });

  it('requires an explicit command', () => {
    expect(() => parseCliArgs(['node', 'cli.ts'])).toThrow('process.exit unexpectedly called');
  });
});
