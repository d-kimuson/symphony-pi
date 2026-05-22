import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureWorkspace } from './ensureWorkspace.js';

describe('ensureWorkspace', () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `symphony-test-${randomBytes(8).toString('hex')}`);
    mkdirSync(root, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('creates a new workspace', () => {
    const result = ensureWorkspace('TEST-123', root);
    if (result.type === 'error') throw new Error(`Unexpected error: ${result.error}`);
    expect(result.type).toBe('created');
    expect(result.workspace.created_now).toBe(true);
    expect(result.workspace.workspace_key).toBe('TEST-123');
    expect(result.workspace.path).toBe(resolve(root, 'TEST-123'));
    expect(existsSync(result.workspace.path)).toBe(true);
  });

  it('reuses an existing workspace', () => {
    // First call creates
    const first = ensureWorkspace('TEST-456', root);
    if (first.type === 'error') throw new Error('unexpected error');
    expect(first.type).toBe('created');

    // Second call reuses
    const second = ensureWorkspace('TEST-456', root);
    if (second.type === 'error') throw new Error('unexpected error');
    expect(second.type).toBe('reused');
    expect(second.workspace.created_now).toBe(false);
  });

  it('sanitizes identifier with special characters', () => {
    const result = ensureWorkspace('ABC/123 test', root);
    if (result.type === 'error') throw new Error('unexpected error');
    expect(result.workspace.workspace_key).not.toContain('/');
    expect(result.workspace.workspace_key).not.toContain(' ');
  });

  it('returns error for path traversal', () => {
    // Identifier with ../ traversal
    const result = ensureWorkspace('../outside', root);
    expect(result.type).toBe('error');
  });
});
