/** Side-effectful workspace creation, cleanup, and lifecycle-hook workflows. */

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';

import type { EffectiveConfig } from '../../config/model.ts';
import type { Workspace } from '../model.ts';

import { execShellScript } from '../../../lib/process/index.ts';
import {
  sanitizeWorkspaceKey,
  buildWorkspacePath,
  isWorkspacePathContained,
} from '../services/workspacePaths.ts';
import {
  createGitWorktree,
  removeGitWorktree,
} from '../services/gitWorktreeLifecycle.ts';

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

export type WorkspacePreparationResult =
  | {
      readonly type: 'success';
      readonly repoRoot: string;
      readonly branchName: string;
      readonly attempts: number;
    }
  | { readonly type: 'failure'; readonly error: string };

/**
 * Run a workspace hook script if configured.
 * Executes in the workspace directory as cwd with timeout from config.
 */
const buildHookEnv = (workspacePath: string, config: EffectiveConfig): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SYMPHONY_WORKSPACE_PATH: workspacePath,
    SYMPHONY_WORKSPACE_KEY: basename(workspacePath),
  };

  if (config.workflow !== undefined) {
    env['SYMPHONY_WORKFLOW_PATH'] = config.workflow.path;
    env['SYMPHONY_WORKFLOW_DIR'] = config.workflow.dir;
  }

  return env;
};

const isExistingWorkspaceEmpty = (workspacePath: string): boolean => {
  try {
    return readdirSync(workspacePath).length === 0;
  } catch {
    return false;
  }
};

const runHook = async (
  hookScript: string | null,
  workspacePath: string,
  timeoutMs: number,
  hookName: string,
  config: EffectiveConfig,
): Promise<HookResult> => {
  if (hookScript === null || hookScript.trim().length === 0) {
    return { type: 'success', stdout: '' };
  }

  try {
    const result = await execShellScript(
      hookScript,
      workspacePath,
      timeoutMs,
      buildHookEnv(workspacePath, config),
    );
    if (result.timedOut) {
      return {
        type: 'timeout',
        error: `${hookName} timed out after ${timeoutMs}ms: ${result.stderr}`,
      };
    }
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

  const shouldRunCreateLifecycle = !alreadyExists || isExistingWorkspaceEmpty(path);

  const workspace: Workspace = {
    path,
    workspace_key: workspaceKey,
    created_now: shouldRunCreateLifecycle,
  };

  return shouldRunCreateLifecycle ? { type: 'created', workspace } : { type: 'reused', workspace };
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
    config,
  );
  return result;
};

export const prepareWorkspace = async (
  workspace: Workspace,
  config: EffectiveConfig,
): Promise<WorkspacePreparationResult> => {
  if (!workspace.created_now) {
    return {
      type: 'success',
      repoRoot: '',
      branchName: '',
      attempts: 0,
    };
  }

  if (config.workflow === undefined) {
    return { type: 'failure', error: 'workflow metadata is required for git worktree setup' };
  }

  const worktreeResult = await createGitWorktree({
    workflowDir: config.workflow.dir,
    workspacePath: workspace.path,
    defaultBranch: config.workspace.defaultBranch,
    timeoutMs: config.hooks.timeout_ms,
  });
  if (worktreeResult.type === 'error') {
    return { type: 'failure', error: worktreeResult.error };
  }

  const hookResult = await runAfterCreateHook(workspace, config);
  if (hookResult.type === 'failure' || hookResult.type === 'timeout') {
    return { type: 'failure', error: `after_create hook: ${hookResult.error}` };
  }

  return {
    type: 'success',
    repoRoot: worktreeResult.repoRoot,
    branchName: worktreeResult.branchName,
    attempts: worktreeResult.attempts,
  };
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
    config,
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
    config,
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
    config,
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

  await runBeforeRemoveHook(workspacePath, config);

  if (config.workflow === undefined) {
    throw new Error('workflow metadata is required for git worktree removal');
  }

  const result = await removeGitWorktree({
    workflowDir: config.workflow.dir,
    workspacePath,
    timeoutMs: config.hooks.timeout_ms,
  });
  if (result.type === 'error') {
    throw new Error(result.error);
  }
};
