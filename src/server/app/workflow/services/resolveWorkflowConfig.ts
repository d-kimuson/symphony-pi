/** Pure helpers for workflow defaults, env indirection, and path normalization. */

import { homedir, tmpdir } from 'node:os';
import { isAbsolute, resolve, dirname } from 'node:path';

/** Environment variable name pattern: letters, digits, underscore */
const ENV_VAR_RE = /^\$([A-Za-z_][A-Za-z0-9_]*)(.*)$/;

/**
 * Resolve environment variable indirection.
 * Values like $VAR_NAME or $VAR_NAME/rest are resolved.
 */
export const resolveEnvVar = (value: string, env: NodeJS.ProcessEnv = process.env): string => {
  const match = ENV_VAR_RE.exec(value);
  if (match) {
    const varName = match[1];
    if (varName === undefined) return value;
    const suffix = match[2] ?? '';
    return (env[varName] ?? '') + suffix;
  }
  return value;
};

/**
 * Resolve a path string with ~ expansion and relative path resolution.
 */
export const resolvePath = (
  value: string,
  baseDir: string,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  let resolved = value;

  // $VAR_NAME resolution
  if (resolved.startsWith('$')) {
    resolved = resolveEnvVar(resolved, env);
  }

  // ~ expansion
  if (resolved.startsWith('~')) {
    resolved = resolved.replace(/^~/, homedir());
  }

  // Relative path resolution
  if (!isAbsolute(resolved)) {
    resolved = resolve(baseDir, resolved);
  }

  return resolved;
};

/**
 * Resolve the workspace root path.
 * Default: <system-temp>/symphony_workspaces
 */
export const resolveWorkspaceRoot = (
  configValue: string | undefined,
  workflowDir: string,
): string => {
  const raw = configValue ?? '$TMPDIR';
  if (raw === '$TMPDIR' || raw === '') {
    // Default to system temp
    return resolve(tmpdir(), 'symphony_workspaces');
  }
  return resolvePath(raw, workflowDir);
};

/**
 * Compute transition_states default from active, terminal, and handoff states.
 */
export const resolveTransitionStates = (
  activeStates: readonly string[],
  terminalStates: readonly string[],
  handoffStates: readonly string[],
): readonly string[] => [...activeStates, ...terminalStates, ...handoffStates];

/**
 * Get the directory containing the workflow file.
 */
export const getWorkflowDir = (workflowPath: string): string => dirname(resolve(workflowPath));
