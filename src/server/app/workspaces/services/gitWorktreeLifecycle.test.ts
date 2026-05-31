import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('../../../lib/process/index.js', () => ({
  execCommand: vi.fn(),
}));

import { existsSync, rmSync } from 'node:fs';

import { execCommand } from '../../../lib/process/index.ts';
import {
  buildWorktreeBranchName,
  createGitWorktree,
  removeGitWorktree,
  resolveGitRepoRoot,
} from './gitWorktreeLifecycle.ts';

const mockExecCommand = vi.mocked(execCommand);

const successResult = (stdout: string) => ({
  stdout,
  stderr: '',
  exitCode: 0,
  timedOut: false,
});

const failureResult = (stderr: string) => ({
  stdout: '',
  stderr,
  exitCode: 1,
  timedOut: false,
});

describe('buildWorktreeBranchName', () => {
  it('uses the symphony-pi prefix and a 7-char suffix', () => {
    expect(buildWorktreeBranchName(() => 'abc1234')).toBe('symphony-pi/abc1234');
  });
});

describe('resolveGitRepoRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the resolved git repo root', async () => {
    mockExecCommand.mockResolvedValueOnce(successResult('/repo\n'));

    const result = await resolveGitRepoRoot('/repo/subdir', 1000);

    expect(result).toEqual({ type: 'success', repoRoot: '/repo' });
    expect(mockExecCommand).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--show-toplevel'],
      '/repo/subdir',
      1000,
    );
  });

  it('returns an error when rev-parse fails', async () => {
    mockExecCommand.mockResolvedValueOnce(failureResult('not a git repository'));

    const result = await resolveGitRepoRoot('/repo/subdir', 1000);

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.error).toContain('git rev-parse --show-toplevel failed');
    }
  });
});

describe('createGitWorktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it('fetches origin/defaultBranch and creates a worktree from it', async () => {
    mockExecCommand
      .mockResolvedValueOnce(successResult('/repo\n'))
      .mockResolvedValueOnce(successResult(''))
      .mockResolvedValueOnce(successResult('origin/main'))
      .mockResolvedValueOnce(successResult('Preparing worktree'));

    const result = await createGitWorktree({
      workflowDir: '/repo/apps/symphony',
      workspacePath: '/tmp/ws/TEST-1',
      defaultBranch: 'main',
      timeoutMs: 5000,
      generateBranchSuffix: () => 'abc1234',
    });

    expect(result).toEqual({
      type: 'success',
      repoRoot: '/repo',
      branchName: 'symphony-pi/abc1234',
      attempts: 1,
    });
    expect(mockExecCommand).toHaveBeenNthCalledWith(
      2,
      'git',
      ['fetch', 'origin', 'main'],
      '/repo',
      5000,
    );
    expect(mockExecCommand).toHaveBeenNthCalledWith(
      4,
      'git',
      ['worktree', 'add', '-b', 'symphony-pi/abc1234', '/tmp/ws/TEST-1', 'origin/main'],
      '/repo',
      5000,
    );
  });

  it('retries with a new branch name when the generated name collides', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockExecCommand
      .mockResolvedValueOnce(successResult('/repo\n'))
      .mockResolvedValueOnce(successResult(''))
      .mockResolvedValueOnce(successResult('origin/main'))
      .mockResolvedValueOnce(
        failureResult("fatal: a branch named 'symphony-pi/abc1234' already exists"),
      )
      .mockResolvedValueOnce(successResult('Preparing worktree'));

    const suffixes = ['abc1234', 'xyz9876'];
    let index = 0;

    const result = await createGitWorktree({
      workflowDir: '/repo/apps/symphony',
      workspacePath: '/tmp/ws/TEST-1',
      defaultBranch: 'main',
      timeoutMs: 5000,
      generateBranchSuffix: () => {
        const suffix = suffixes[index];
        index += 1;
        return suffix ?? 'fallback';
      },
    });

    expect(result).toEqual({
      type: 'success',
      repoRoot: '/repo',
      branchName: 'symphony-pi/xyz9876',
      attempts: 2,
    });
    expect(rmSync).toHaveBeenCalledWith('/tmp/ws/TEST-1', { recursive: true, force: true });
    expect(mockExecCommand).toHaveBeenNthCalledWith(
      5,
      'git',
      ['worktree', 'add', '-b', 'symphony-pi/xyz9876', '/tmp/ws/TEST-1', 'origin/main'],
      '/repo',
      5000,
    );
  });

  it('cleans up partial state and returns an error when worktree creation fails', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockExecCommand
      .mockResolvedValueOnce(successResult('/repo\n'))
      .mockResolvedValueOnce(successResult(''))
      .mockResolvedValueOnce(successResult('origin/main'))
      .mockResolvedValueOnce(failureResult('fatal: cannot lock ref'))
      .mockResolvedValueOnce(successResult(''))
      .mockResolvedValueOnce(successResult(''));

    const result = await createGitWorktree({
      workflowDir: '/repo/apps/symphony',
      workspacePath: '/tmp/ws/TEST-1',
      defaultBranch: 'main',
      timeoutMs: 5000,
      generateBranchSuffix: () => 'abc1234',
    });

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.error).toContain('git worktree add failed for symphony-pi/abc1234');
    }
    expect(mockExecCommand).toHaveBeenNthCalledWith(
      5,
      'git',
      ['worktree', 'remove', '--force', '/tmp/ws/TEST-1'],
      '/repo',
      5000,
    );
    expect(mockExecCommand).toHaveBeenNthCalledWith(
      6,
      'git',
      ['branch', '--delete', '--force', 'symphony-pi/abc1234'],
      '/repo',
      5000,
    );
    expect(rmSync).toHaveBeenCalledWith('/tmp/ws/TEST-1', { recursive: true, force: true });
  });

  it('returns an error when branch-name retries are exhausted', async () => {
    mockExecCommand
      .mockResolvedValueOnce(successResult('/repo\n'))
      .mockResolvedValueOnce(successResult(''))
      .mockResolvedValueOnce(successResult('origin/main'))
      .mockResolvedValueOnce(
        failureResult("fatal: a branch named 'symphony-pi/abc1234' already exists"),
      )
      .mockResolvedValueOnce(
        failureResult("fatal: a branch named 'symphony-pi/abc1234' already exists"),
      );

    const result = await createGitWorktree({
      workflowDir: '/repo/apps/symphony',
      workspacePath: '/tmp/ws/TEST-1',
      defaultBranch: 'main',
      timeoutMs: 5000,
      maxBranchNameAttempts: 2,
      generateBranchSuffix: () => 'abc1234',
    });

    expect(result).toEqual({
      type: 'error',
      error: 'Failed to create unique worktree branch after 2 attempts',
    });
  });
});

describe('removeGitWorktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the worktree from the resolved repo root', async () => {
    mockExecCommand
      .mockResolvedValueOnce(successResult('/repo\n'))
      .mockResolvedValueOnce(successResult(''));

    const result = await removeGitWorktree({
      workflowDir: '/repo/apps/symphony',
      workspacePath: '/tmp/ws/TEST-1',
      timeoutMs: 5000,
    });

    expect(result).toEqual({ type: 'success', repoRoot: '/repo' });
    expect(mockExecCommand).toHaveBeenNthCalledWith(
      2,
      'git',
      ['worktree', 'remove', '--force', '/tmp/ws/TEST-1'],
      '/repo',
      5000,
    );
  });

  it('surfaces removal failures', async () => {
    mockExecCommand
      .mockResolvedValueOnce(successResult('/repo\n'))
      .mockResolvedValueOnce(failureResult('fatal: worktree contains modified files'));

    const result = await removeGitWorktree({
      workflowDir: '/repo/apps/symphony',
      workspacePath: '/tmp/ws/TEST-1',
      timeoutMs: 5000,
    });

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.error).toContain('git worktree remove failed');
    }
  });
});
