import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ensureDir, isDirectory, pathExists, removeDir } from './index.ts';

describe('ensureDir', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'symphony-test-')));

  it('creates a new directory and returns true', async () => {
    const dir = join(base, 'new-dir');
    const created = await ensureDir(dir);
    expect(created).toBe(true);
    expect(await isDirectory(dir)).toBe(true);
  });

  it('returns false for existing directory', async () => {
    const dir = join(base, 'existing-dir');
    await ensureDir(dir);
    const created = await ensureDir(dir);
    expect(created).toBe(false);
  });

  it('creates nested directories', async () => {
    const dir = join(base, 'a', 'b', 'c');
    const created = await ensureDir(dir);
    expect(created).toBe(true);
    expect(await isDirectory(dir)).toBe(true);
  });
});

describe('isDirectory', () => {
  it('returns true for directory', async () => {
    expect(await isDirectory(tmpdir())).toBe(true);
  });

  it('returns false for non-existent path', async () => {
    expect(await isDirectory('/definitely-not-a-real-path-12345')).toBe(false);
  });
});

describe('pathExists', () => {
  it('returns true for existing path', async () => {
    expect(await pathExists(tmpdir())).toBe(true);
  });

  it('returns false for non-existent path', async () => {
    expect(await pathExists('/definitely-not-a-real-path-12345')).toBe(false);
  });
});

describe('removeDir', () => {
  it('removes a directory', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'symphony-test-')));
    const dir = join(base, 'to-remove');
    await ensureDir(dir);
    expect(await isDirectory(dir)).toBe(true);
    await removeDir(dir);
    expect(await isDirectory(dir)).toBe(false);
  });
});
