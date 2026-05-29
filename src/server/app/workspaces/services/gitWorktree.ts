/** Git worktree inspection helpers used as completion gates. */

import { execShellScript } from '../../../lib/process/index.ts';

export type WorktreeInspection =
  | { readonly type: 'clean' }
  | { readonly type: 'dirty'; readonly status: string }
  | { readonly type: 'not_git' }
  | { readonly type: 'error'; readonly error: string };

const gitInspectionTimeoutMs = 10000;

const looksLikeNotGitRepository = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('not a git repository') ||
    normalized.includes('not a git work tree') ||
    normalized.includes('not a gitdir')
  );
};

export const inspectGitWorktree = async (workspacePath: string): Promise<WorktreeInspection> => {
  const result = await execShellScript(
    "git status --porcelain=v1 -- . ':(exclude).symphony-pi'",
    workspacePath,
    gitInspectionTimeoutMs,
  );

  if (result.exitCode !== 0) {
    const diagnostic = [result.stderr, result.stdout].filter((part) => part.length > 0).join('\n');
    if (looksLikeNotGitRepository(diagnostic)) {
      return { type: 'not_git' };
    }
    return { type: 'error', error: diagnostic.length > 0 ? diagnostic : 'git status failed' };
  }

  const status = result.stdout.trim();
  if (status.length === 0) {
    return { type: 'clean' };
  }

  return { type: 'dirty', status };
};
