/** Pure workspace-key sanitization and path safety helpers. */

import { isAbsolute, resolve, relative } from 'node:path';

/**
 * Sanitize an issue identifier into a safe workspace key.
 * Replace any character not in [A-Za-z0-9._-] with _.
 */
export const sanitizeWorkspaceKey = (identifier: string): string =>
  identifier.replace(/[^A-Za-z0-9._-]/g, '_');

/**
 * Build the absolute workspace path for an issue.
 * workspace_root must be absolute.
 */
export const buildWorkspacePath = (workspaceRoot: string, workspaceKey: string): string => {
  const normalizedRoot = isAbsolute(workspaceRoot) ? workspaceRoot : resolve(workspaceRoot);
  return resolve(normalizedRoot, workspaceKey);
};

/**
 * Validate that workspace_path is inside workspace_root.
 * Both must be absolute paths.
 */
export const isWorkspacePathContained = (workspacePath: string, workspaceRoot: string): boolean => {
  const normalizedPath = resolve(workspacePath);
  const normalizedRoot = resolve(workspaceRoot);

  const rel = relative(normalizedRoot, normalizedPath);

  // If relative starts with .. or is empty (same path), we need to check
  return !rel.startsWith('..') && rel !== '';
};
