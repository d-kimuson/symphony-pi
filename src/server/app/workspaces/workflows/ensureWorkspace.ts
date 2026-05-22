/** Side-effectful workspace creation, cleanup, and lifecycle-hook workflows. */

import { mkdirSync, existsSync } from 'node:fs';

import type { Workspace, WorkspaceHook } from '../model.js';

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
 * Get workspace hook default status.
 * Used for hook lifecycle tracking.
 */
export const workspaceHookKey = (hook: WorkspaceHook): string => hook;
