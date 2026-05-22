import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** Server-only process/subprocess helpers. */

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Execute a shell command with a timeout.
 * Uses `sh -lc <script>` as per SPEC.
 */
export const execShellScript = async (
  script: string,
  cwd: string,
  timeoutMs: number,
): Promise<ExecResult> => {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const { stdout, stderr } = await execAsync(script, {
      cwd,
      signal: controller.signal,
      shell: '/bin/sh',
      env: { ...process.env },
      timeout: timeoutMs,
    });

    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode: 0,
    };
  } catch (err: unknown) {
    let stdout = '';
    let stderr = '';
    let code: number | undefined;
    if (err !== null && typeof err === 'object') {
      const errObj = err as { stdout?: unknown; stderr?: unknown; code?: unknown };
      if (typeof errObj.stdout === 'string') stdout = errObj.stdout;
      if (typeof errObj.stderr === 'string') stderr = errObj.stderr;
      if (typeof errObj.code === 'number') code = errObj.code;
    }
    return {
      stdout,
      stderr,
      exitCode: code ?? (controller.signal.aborted ? 124 : 1),
    };
  } finally {
    clearTimeout(timeout);
  }
};
