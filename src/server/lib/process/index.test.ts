import { describe, expect, it } from 'vitest';

import { execShellScript } from './index.js';

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

  it('times out via execa timeout option', async () => {
    const result = await execShellScript('sleep 10', process.cwd(), 500);
    // execa kills the process on timeout; exitCode may be undefined
    // but timedOut flag should be true
    expect(result.timedOut).toBe(true);
  });
});
