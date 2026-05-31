/** Persisted per-workspace orchestration state for restart-safe resume. */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import * as v from 'valibot';

const sidecarDirName = '.symphony-pi';
const gitSidecarDirName = 'symphony-pi';
const runStateFileName = 'run-state.json';

const runStateSchema = v.object({
  issue_id: v.string(),
  issue_identifier: v.string(),
  session_id: v.nullable(v.string()),
  session_file: v.nullable(v.string()),
  attempt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  dirty_auto_resume_count: v.pipe(v.number(), v.integer(), v.minValue(0)),
  last_error: v.nullable(v.string()),
  updated_at: v.string(),
});

export type WorkspaceRunState = v.InferOutput<typeof runStateSchema>;

export type WorkspaceRunStateInput = {
  readonly issue_id: string;
  readonly issue_identifier: string;
  readonly session_id: string | null;
  readonly session_file: string | null;
  readonly attempt: number;
  readonly dirty_auto_resume_count: number;
  readonly last_error: string | null;
};

const getGitSidecarDir = (workspacePath: string): string | null => {
  const dotGitPath = join(workspacePath, '.git');
  if (!existsSync(dotGitPath)) return null;

  try {
    const content = readFileSync(dotGitPath, 'utf8').trim();
    const prefix = 'gitdir:';
    if (content.toLowerCase().startsWith(prefix)) {
      const gitDirRaw = content.slice(prefix.length).trim();
      const gitDir = isAbsolute(gitDirRaw) ? gitDirRaw : resolve(workspacePath, gitDirRaw);
      return join(gitDir, gitSidecarDirName);
    }
  } catch {
    return join(dotGitPath, gitSidecarDirName);
  }

  return join(dotGitPath, gitSidecarDirName);
};

export const getWorkspaceRunStatePath = (workspacePath: string): string => {
  const gitSidecarDir = getGitSidecarDir(workspacePath);
  return join(gitSidecarDir ?? join(workspacePath, sidecarDirName), runStateFileName);
};

export const readWorkspaceRunState = (workspacePath: string): WorkspaceRunState | null => {
  const path = getWorkspaceRunStatePath(workspacePath);
  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, 'utf8');
    const parsed: unknown = JSON.parse(content);
    return v.parse(runStateSchema, parsed);
  } catch {
    return null;
  }
};

export const writeWorkspaceRunState = (
  workspacePath: string,
  input: WorkspaceRunStateInput,
): void => {
  const path = getWorkspaceRunStatePath(workspacePath);
  mkdirSync(dirname(path), { recursive: true });
  const payload: WorkspaceRunState = {
    ...input,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

export const deleteWorkspaceRunState = (workspacePath: string): void => {
  const gitSidecarDir = getGitSidecarDir(workspacePath);
  if (gitSidecarDir === null) {
    rmSync(join(workspacePath, sidecarDirName), { recursive: true, force: true });
    return;
  }

  rmSync(join(gitSidecarDir, runStateFileName), { force: true });
};
