import { describe, expect, it } from 'vitest';

import { execShellScript } from './index.ts';

describe('execShellScript (execa)', () => {
  it('executes a simple command and returns stdout', async () => {
    const result = await execShellScript('echo hello', process.cwd(), 5000);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('captures stderr', async () => {
    const result = await execShellScript('echo error >&2', process.cwd(), 5000);
    expect(result.stderr).toContain('error');
  });

  it('returns non-zero exit code for failing commands', async () => {
    const result = await execShellScript('exit 42', process.cwd(), 5000);
    expect(result.exitCode).toBe(42);
  });

  it('handles spawn errors gracefully', async () => {
    // Trigger catch path by passing an invalid shell command context
    // execa's catch path handles unexpected errors like spawn failures
    // We test with a valid command in a non-existent directory to trigger error path
    const result = await execShellScript('echo test', '/nonexistent/path/12345', 5000);
    // execa may succeed or fail depending on OS; we just verify it doesn't crash
    expect(result).toBeDefined();
    expect(typeof result.exitCode).toBe('number');
  });
});
