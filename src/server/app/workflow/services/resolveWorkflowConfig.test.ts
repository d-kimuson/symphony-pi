import { describe, expect, it } from 'vitest';

import {
  resolveEnvVar,
  resolvePath,
  resolveWorkspaceRoot,
  resolveTransitionStates,
  getWorkflowDir,
} from './resolveWorkflowConfig.js';

describe('resolveEnvVar', () => {
  it('returns value without $ prefix as-is', () => {
    expect(resolveEnvVar('hello', {})).toBe('hello');
  });

  it('resolves $VAR_NAME from env', () => {
    expect(resolveEnvVar('$MY_VAR', { MY_VAR: 'resolved' })).toBe('resolved');
  });

  it('returns empty string for missing env var', () => {
    expect(resolveEnvVar('$MISSING', {})).toBe('');
  });
});

describe('resolvePath', () => {
  it('expands ~ to home directory', () => {
    const result = resolvePath('~/projects', '/base');
    expect(result).not.toContain('~');
    expect(result.endsWith('/projects')).toBe(true);
  });

  it('resolves relative path against baseDir', () => {
    const result = resolvePath('relative/path', '/base/dir');
    expect(result).toBe('/base/dir/relative/path');
  });

  it('keeps absolute path as-is', () => {
    expect(resolvePath('/absolute/path', '/base')).toBe('/absolute/path');
  });

  it('resolves $VAR in path', () => {
    const result = resolvePath('$HOME/projects', '/base', { HOME: '/home/user' });
    expect(result).toBe('/home/user/projects');
  });
});

describe('resolveWorkspaceRoot', () => {
  it('returns temp/symphony_workspaces when undefined', () => {
    const result = resolveWorkspaceRoot(undefined, '/workflow/dir');
    expect(result).toContain('symphony_workspaces');
  });

  it('resolves explicit value', () => {
    const result = resolveWorkspaceRoot('/custom/ws', '/workflow/dir');
    expect(result).toBe('/custom/ws');
  });
});

describe('resolveTransitionStates', () => {
  it('merges active, terminal, and handoff states', () => {
    const result = resolveTransitionStates(
      ['Todo', 'In Progress'],
      ['Closed', 'Done'],
      ['Human Review'],
    );
    expect(result).toEqual(['Todo', 'In Progress', 'Closed', 'Done', 'Human Review']);
  });

  it('returns only active and terminal when no handoff', () => {
    const result = resolveTransitionStates(['Todo'], ['Done'], []);
    expect(result).toEqual(['Todo', 'Done']);
  });
});

describe('getWorkflowDir', () => {
  it('returns the directory of the workflow file', () => {
    const result = getWorkflowDir('/projects/repo/WORKFLOW.md');
    expect(result).toBe('/projects/repo');
  });
});
