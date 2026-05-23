import { describe, expect, it } from 'vitest';

import { parseCliArgs } from './cli.js';

describe('parseCliArgs (Commander-based)', () => {
  it('returns default workflow path when no args', () => {
    const result = parseCliArgs(['node', 'main.ts']);
    expect(result.workflowPath).toBe('./WORKFLOW.md');
    expect(result.port).toBeUndefined();
  });

  it('parses --port flag', () => {
    const result = parseCliArgs(['node', 'main.ts', '--port', '9999']);
    expect(result.workflowPath).toBe('./WORKFLOW.md');
    expect(result.port).toBe(9999);
  });

  it('parses positional workflow path', () => {
    const result = parseCliArgs(['node', 'main.ts', '/custom/WORKFLOW.md']);
    expect(result.workflowPath).toBe('/custom/WORKFLOW.md');
    expect(result.port).toBeUndefined();
  });

  it('parses both positional and --port', () => {
    const result = parseCliArgs(['node', 'main.ts', '/custom/WORKFLOW.md', '--port', '5555']);
    expect(result.workflowPath).toBe('/custom/WORKFLOW.md');
    expect(result.port).toBe(5555);
  });

  it('parses -p shorthand for port', () => {
    const result = parseCliArgs(['node', 'main.ts', '-p', '4242']);
    expect(result.port).toBe(4242);
  });

  it('parses positional before options', () => {
    const result = parseCliArgs(['node', 'main.ts', '/path/to/WORKFLOW.md', '-p', '8080']);
    expect(result.workflowPath).toBe('/path/to/WORKFLOW.md');
    expect(result.port).toBe(8080);
  });

  it('rejects invalid port values', () => {
    expect(() => parseCliArgs(['node', 'main.ts', '--port', 'not-a-number'])).toThrow(
      'Invalid port',
    );
    expect(() => parseCliArgs(['node', 'main.ts', '--port', '0'])).toThrow('Invalid port');
    expect(() => parseCliArgs(['node', 'main.ts', '--port', '99999'])).toThrow('Invalid port');
  });
});
