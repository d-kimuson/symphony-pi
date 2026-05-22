import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

/** Server-only path helpers. */

/**
 * Expand `~` to the user's home directory.
 * Only expands a leading `~` followed by `/` or end-of-string.
 */
export const expandHome = (path: string): string => {
  if (path.startsWith('~/') || path === '~') {
    return resolve(homedir(), path.slice(1));
  }
  return path;
};

/**
 * Resolve a path to absolute. Relative paths are resolved against the
 * given base directory.
 */
export const resolveAbsolute = (path: string, baseDir?: string): string => {
  const expanded = expandHome(path);
  if (isAbsolute(expanded)) {
    return resolve(expanded);
  }
  return resolve(baseDir ?? process.cwd(), expanded);
};

/**
 * Check whether `child` is a subdirectory of `parent`.
 * Both paths must be normalized to absolute first.
 */
export const isSubPath = (parent: string, child: string): boolean => {
  const normalizedParent = resolve(parent) + '/';
  const normalizedChild = resolve(child) + '/';
  return normalizedChild.startsWith(normalizedParent);
};

/**
 * Normalize a path to absolute and resolve `..` segments.
 */
export const normalizePath = (path: string): string => resolve(path);
