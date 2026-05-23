import { describe, expect, it } from 'vitest';

import { expandHome, isSubPath, normalizePath, resolveAbsolute } from './index.ts';

describe('expandHome', () => {
  it('expands ~ to home directory', () => {
    const result = expandHome('~/projects');
    expect(result).not.toContain('~');
    expect(result.endsWith('/projects')).toBe(true);
  });

  it('expands bare ~ correctly', () => {
    const result = expandHome('~');
    expect(result).not.toBe('~');
    expect(result.length).toBeGreaterThan(0);
  });

  it('leaves non-tilde paths unchanged', () => {
    expect(expandHome('/usr/local/bin')).toBe('/usr/local/bin');
    expect(expandHome('./relative')).toBe('./relative');
  });
});

describe('resolveAbsolute', () => {
  it('resolves absolute paths as-is', () => {
    expect(resolveAbsolute('/usr/local')).toBe('/usr/local');
  });

  it('resolves tilde paths', () => {
    const result = resolveAbsolute('~/test');
    expect(result).not.toContain('~');
  });

  it('resolves relative paths against baseDir', () => {
    const result = resolveAbsolute('./src', '/base');
    expect(result).toBe('/base/src');
  });

  it('resolves relative paths against cwd when no baseDir', () => {
    const result = resolveAbsolute('./src');
    expect(result).toBeTruthy();
    expect(result.endsWith('/src')).toBe(true);
  });
});

describe('isSubPath', () => {
  it('returns true for direct child', () => {
    expect(isSubPath('/parent', '/parent/child')).toBe(true);
  });

  it('returns true for nested child', () => {
    expect(isSubPath('/parent', '/parent/a/b/c')).toBe(true);
  });

  it('returns false for sibling', () => {
    expect(isSubPath('/parent', '/other/child')).toBe(false);
  });

  it('returns false when child is shorter but not subpath', () => {
    expect(isSubPath('/parent/deep', '/parent')).toBe(false);
  });

  it('returns false for path traversal attempt', () => {
    expect(isSubPath('/workspace', '/workspace/../escape')).toBe(false);
  });

  it('returns true for identical paths', () => {
    expect(isSubPath('/parent', '/parent')).toBe(true);
  });
});

describe('normalizePath', () => {
  it('resolves relative paths to absolute', () => {
    const result = normalizePath('foo/bar');
    expect(result.startsWith('/')).toBe(true);
  });

  it('resolves .. segments', () => {
    const result = normalizePath('/foo/bar/../baz');
    expect(result).toBe('/foo/baz');
  });
});
