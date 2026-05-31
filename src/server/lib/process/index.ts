import { execa, execaCommand } from 'execa';

/** Server-only process/subprocess helpers using execa. */

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

/**
 * Execute a shell command with a timeout.
 * Uses execa for robust process management (SPEC 9.4).
 *
 * @param script - Shell script to execute
 * @param cwd - Working directory
 * @param timeoutMs - Timeout in milliseconds
 */
export const execShellScript = async (
  script: string,
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<ExecResult> => {
  try {
    const result = await execaCommand(script, {
      shell: true,
      cwd,
      timeout: timeoutMs,
      reject: false,
      env,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? (result.timedOut ? 124 : 0),
      timedOut: result.timedOut,
    };
  } catch (err: unknown) {
    // Handle spawn failures or other unexpected errors
    const message = err instanceof Error ? err.message : String(err);
    return {
      stdout: '',
      stderr: message,
      exitCode: 1,
      timedOut: false,
    };
  }
};

/**
 * Execute a command with arguments and a timeout.
 * Uses execa to avoid shell-quoting issues for structured commands.
 */
export const execCommand = async (
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<ExecResult> => {
  try {
    const result = await execa(command, args, {
      cwd,
      timeout: timeoutMs,
      reject: false,
      env,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? (result.timedOut ? 124 : 0),
      timedOut: result.timedOut,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      stdout: '',
      stderr: message,
      exitCode: 1,
      timedOut: false,
    };
  }
};
