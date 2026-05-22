/** Side-effectful workspace creation, cleanup, and lifecycle-hook workflows. */

import { existsSync, mkdirSync, rmSync } from 'node:fs';

import type { EffectiveConfig } from '../../config/model.js';
import type { Workspace } from '../model.js';

import { execShellScript } from '../../../lib/process/index.js';
import {
  sanitizeWorkspaceKey,
  buildWorkspacePath,
  isWorkspacePathContained,
} from '../services/workspacePaths.js';

export type WorkspaceResult =
  | { readonly type: 'created'; readonly workspace: Workspace }
  | { readonly type: 'reused'; readonly workspace: Workspace }
  | { readonly type: 'error'; readonly error: string };

/**
 * Result of hook execution.
 */
export type HookResult =
  | { readonly type: 'success'; readonly stdout: string }
  | { readonly type: 'failure'; readonly error: string }
  | { readonly type: 'timeout'; readonly error: string };

/**
 * Run a workspace hook script if configured.
 * Executes in the workspace directory as cwd with timeout from config.
 */
const runHook = async (
  hookScript: string | null,
  workspacePath: string,
  timeoutMs: number,
  hookName: string,
): Promise<HookResult> => {
  if (hookScript === null || hookScript.trim().length === 0) {
    return { type: 'success', stdout: '' };
  }

  try {
    const result = await execShellScript(hookScript, workspacePath, timeoutMs);
    if (result.exitCode === 0) {
      return { type: 'success', stdout: result.stdout };
    }
    return {
      type: 'failure',
      error: `${hookName} failed with exit code ${result.exitCode}: ${result.stderr}`,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { type: 'failure', error: `${hookName} threw: ${message}` };
  }
};

/**
 * Ensure a workspace exists for the given issue identifier.
 * Sanitizes the identifier, creates the directory if needed, and validates containment.
 */
export const ensureWorkspace = (identifier: string, workspaceRoot: string): WorkspaceResult => {
  const workspaceKey = sanitizeWorkspaceKey(identifier);
  const path = buildWorkspacePath(workspaceRoot, workspaceKey);

  // Validate containment
  if (!isWorkspacePathContained(path, workspaceRoot)) {
    return { type: 'error', error: `Workspace path outside root: ${path}` };
  }

  const alreadyExists = existsSync(path);
  if (!alreadyExists) {
    try {
      mkdirSync(path, { recursive: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { type: 'error', error: `Failed to create workspace: ${message}` };
    }
  }

  const workspace: Workspace = {
    path,
    workspace_key: workspaceKey,
    created_now: !alreadyExists,
  };

  return alreadyExists ? { type: 'reused', workspace } : { type: 'created', workspace };
};

/**
 * Run the after_create hook for a newly created workspace.
 * Fatal on failure or timeout (SPEC 9.4).
 */
export const runAfterCreateHook = async (
  workspace: Workspace,
  config: EffectiveConfig,
): Promise<HookResult> => {
  const result = await runHook(
    config.hooks.after_create,
    workspace.path,
    config.hooks.timeout_ms,
    'after_create',
  );
  return result;
};

/**
 * Run the before_run hook before an agent attempt.
 * Fatal on failure or timeout (SPEC 9.4).
 */
export const runBeforeRunHook = async (
  workspacePath: string,
  config: EffectiveConfig,
): Promise<HookResult> => {
  const result = await runHook(
    config.hooks.before_run,
    workspacePath,
    config.hooks.timeout_ms,
    'before_run',
  );
  return result;
};

/**
 * Run the after_run hook after an agent attempt.
 * Failure/timeout is logged and ignored (SPEC 9.4).
 */
export const runAfterRunHook = async (
  workspacePath: string,
  config: EffectiveConfig,
): Promise<HookResult> => {
  const result = await runHook(
    config.hooks.after_run,
    workspacePath,
    config.hooks.timeout_ms,
    'after_run',
  );
  return result;
};

/**
 * Run the before_remove hook before workspace deletion.
 * Failure/timeout is logged and ignored; cleanup proceeds (SPEC 9.4).
 */
export const runBeforeRemoveHook = async (
  workspacePath: string,
  config: EffectiveConfig,
): Promise<HookResult> => {
  const result = await runHook(
    config.hooks.before_remove,
    workspacePath,
    config.hooks.timeout_ms,
    'before_remove',
  );
  return result;
};

/**
 * Remove a workspace directory, running before_remove hook first.
 */
export const removeWorkspace = async (
  workspacePath: string,
  config: EffectiveConfig,
): Promise<void> => {
  if (!existsSync(workspacePath)) {
    return;
  }

  // before_remove hook: failure logged, cleanup continues (SPEC 9.4)
  await runBeforeRemoveHook(workspacePath, config);

  try {
    rmSync(workspacePath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
};
