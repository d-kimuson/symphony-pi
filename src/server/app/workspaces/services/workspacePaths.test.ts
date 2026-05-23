import { describe, expect, it } from 'vitest';

import {
  sanitizeWorkspaceKey,
  buildWorkspacePath,
  isWorkspacePathContained,
} from './workspacePaths.ts';

describe('sanitizeWorkspaceKey', () => {
  it('preserves alphanumeric, dots, underscores, and hyphens', () => {
    expect(sanitizeWorkspaceKey('ABC-123')).toBe('ABC-123');
    expect(sanitizeWorkspaceKey('feature.branch_v2')).toBe('feature.branch_v2');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeWorkspaceKey('ABC 123')).toBe('ABC_123');
  });

  it('replaces special characters', () => {
    expect(sanitizeWorkspaceKey('issue/name@test')).toBe('issue_name_test');
  });

  it('handles empty string', () => {
    expect(sanitizeWorkspaceKey('')).toBe('');
  });
});

describe('buildWorkspacePath', () => {
  it('builds path from root and key', () => {
    const result = buildWorkspacePath('/tmp/workspaces', 'ABC-123');
    expect(result).toBe('/tmp/workspaces/ABC-123');
  });

  it('resolves relative root', () => {
    const result = buildWorkspacePath('./workspaces', 'ABC-123');
    expect(result.endsWith('/workspaces/ABC-123')).toBe(true);
  });
});

describe('isWorkspacePathContained', () => {
  it('returns true for path inside root', () => {
    expect(isWorkspacePathContained('/tmp/ws/ABC-123', '/tmp/ws')).toBe(true);
  });

  it('returns false for path outside root (traversal)', () => {
    expect(isWorkspacePathContained('/tmp/other/ABC-123', '/tmp/ws')).toBe(false);
  });

  it('returns false for path outside root via ..', () => {
    expect(isWorkspacePathContained('/tmp/ws/../other', '/tmp/ws')).toBe(false);
  });

  it('returns false for same path as root', () => {
    expect(isWorkspacePathContained('/tmp/ws', '/tmp/ws')).toBe(false);
  });
});
