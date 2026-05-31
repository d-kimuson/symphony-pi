/** Git worktree lifecycle helpers for built-in workspace creation/removal. */

import { existsSync, rmSync } from 'node:fs';

import { customAlphabet } from 'nanoid';

import { execCommand } from '../../../lib/process/index.ts';

const worktreeBranchPrefix = 'symphony-pi/';
const worktreeBranchLength = 7;
const defaultMaxBranchNameAttempts = 5;
const createBranchSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', worktreeBranchLength);

type ResultSuccess<T extends string, Payload extends object = object> = {
  readonly type: T;
} & Payload;

type ResultError = {
  readonly type: 'error';
  readonly error: string;
};

export type GitRepoRootResult =
  | ResultSuccess<'success', { readonly repoRoot: string }>
  | ResultError;

export type CreateGitWorktreeResult =
  | ResultSuccess<
      'success',
      {
        readonly repoRoot: string;
        readonly branchName: string;
        readonly attempts: number;
      }
    >
  | ResultError;

export type RemoveGitWorktreeResult =
  | ResultSuccess<'success', { readonly repoRoot: string }>
  | ResultError;

export type CreateGitWorktreeOptions = {
  readonly workflowDir: string;
  readonly workspacePath: string;
  readonly defaultBranch: string;
  readonly timeoutMs: number;
  readonly maxBranchNameAttempts?: number;
  readonly generateBranchSuffix?: () => string;
};

export type RemoveGitWorktreeOptions = {
  readonly workflowDir: string;
  readonly workspacePath: string;
  readonly timeoutMs: number;
};

const buildDiagnostic = (stdout: string, stderr: string): string => {
  const parts = [stderr, stdout].filter((part) => part.length > 0);
  return parts.length === 0 ? 'command failed' : parts.join('\n');
};

const isBranchCollision = (branchName: string, diagnostic: string): boolean => {
  const normalized = diagnostic.toLowerCase();
  return normalized.includes(branchName.toLowerCase()) && normalized.includes('already exists');
};

const cleanupWorkspacePath = (workspacePath: string): void => {
  if (!existsSync(workspacePath)) {
    return;
  }

  rmSync(workspacePath, { recursive: true, force: true });
};

const cleanupFailedCreate = async (
  repoRoot: string,
  workspacePath: string,
  branchName: string,
  timeoutMs: number,
): Promise<void> => {
  await execCommand('git', ['worktree', 'remove', '--force', workspacePath], repoRoot, timeoutMs);
  await execCommand('git', ['branch', '--delete', '--force', branchName], repoRoot, timeoutMs);
  cleanupWorkspacePath(workspacePath);
};

export const buildWorktreeBranchName = (
  generateSuffix: () => string = createBranchSuffix,
): string => {
  return `${worktreeBranchPrefix}${generateSuffix()}`;
};

export const resolveGitRepoRoot = async (
  workflowDir: string,
  timeoutMs: number,
): Promise<GitRepoRootResult> => {
  const result = await execCommand('git', ['rev-parse', '--show-toplevel'], workflowDir, timeoutMs);
  if (result.exitCode !== 0) {
    return {
      type: 'error',
      error: `git rev-parse --show-toplevel failed: ${buildDiagnostic(result.stdout, result.stderr)}`,
    };
  }

  const repoRoot = result.stdout.trim();
  if (repoRoot.length === 0) {
    return { type: 'error', error: 'git rev-parse --show-toplevel returned an empty path' };
  }

  return { type: 'success', repoRoot };
};

const ensureOriginBranch = async (
  repoRoot: string,
  defaultBranch: string,
  timeoutMs: number,
): Promise<ResultSuccess<'success'> | ResultError> => {
  const fetchResult = await execCommand('git', ['fetch', 'origin', defaultBranch], repoRoot, timeoutMs);
  if (fetchResult.exitCode !== 0) {
    return {
      type: 'error',
      error: `git fetch origin ${defaultBranch} failed: ${buildDiagnostic(fetchResult.stdout, fetchResult.stderr)}`,
    };
  }

  const verifyResult = await execCommand(
    'git',
    ['rev-parse', '--verify', `origin/${defaultBranch}`],
    repoRoot,
    timeoutMs,
  );
  if (verifyResult.exitCode !== 0) {
    return {
      type: 'error',
      error: `origin/${defaultBranch} could not be resolved: ${buildDiagnostic(verifyResult.stdout, verifyResult.stderr)}`,
    };
  }

  return { type: 'success' };
};

export const createGitWorktree = async (
  options: CreateGitWorktreeOptions,
): Promise<CreateGitWorktreeResult> => {
  const repoRootResult = await resolveGitRepoRoot(options.workflowDir, options.timeoutMs);
  if (repoRootResult.type === 'error') {
    return repoRootResult;
  }

  const originResult = await ensureOriginBranch(
    repoRootResult.repoRoot,
    options.defaultBranch,
    options.timeoutMs,
  );
  if (originResult.type === 'error') {
    cleanupWorkspacePath(options.workspacePath);
    return originResult;
  }

  const maxAttempts = options.maxBranchNameAttempts ?? defaultMaxBranchNameAttempts;
  const generateSuffix = options.generateBranchSuffix ?? createBranchSuffix;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const branchName = buildWorktreeBranchName(generateSuffix);
    const addResult = await execCommand(
      'git',
      ['worktree', 'add', '-b', branchName, options.workspacePath, `origin/${options.defaultBranch}`],
      repoRootResult.repoRoot,
      options.timeoutMs,
    );

    if (addResult.exitCode === 0) {
      return {
        type: 'success',
        repoRoot: repoRootResult.repoRoot,
        branchName,
        attempts: attempt,
      };
    }

    const diagnostic = buildDiagnostic(addResult.stdout, addResult.stderr);
    if (isBranchCollision(branchName, diagnostic)) {
      cleanupWorkspacePath(options.workspacePath);
      continue;
    }

    await cleanupFailedCreate(
      repoRootResult.repoRoot,
      options.workspacePath,
      branchName,
      options.timeoutMs,
    );
    return {
      type: 'error',
      error: `git worktree add failed for ${branchName}: ${diagnostic}`,
    };
  }

  cleanupWorkspacePath(options.workspacePath);
  return {
    type: 'error',
    error: `Failed to create unique worktree branch after ${maxAttempts} attempts`,
  };
};

export const removeGitWorktree = async (
  options: RemoveGitWorktreeOptions,
): Promise<RemoveGitWorktreeResult> => {
  const repoRootResult = await resolveGitRepoRoot(options.workflowDir, options.timeoutMs);
  if (repoRootResult.type === 'error') {
    return repoRootResult;
  }

  const removeResult = await execCommand(
    'git',
    ['worktree', 'remove', '--force', options.workspacePath],
    repoRootResult.repoRoot,
    options.timeoutMs,
  );
  if (removeResult.exitCode !== 0) {
    return {
      type: 'error',
      error: `git worktree remove failed: ${buildDiagnostic(removeResult.stdout, removeResult.stderr)}`,
    };
  }

  return { type: 'success', repoRoot: repoRootResult.repoRoot };
};
