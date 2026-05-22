import { access, mkdir, readdir, rm } from 'node:fs/promises';

/** Server-only filesystem helpers. */

/**
 * Check whether a path exists and is a directory.
 */
export const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const stat = await import('node:fs/promises').then((m) => m.stat(path));
    return stat.isDirectory();
  } catch {
    return false;
  }
};

/**
 * Ensure a directory exists, creating it if necessary.
 * Returns true if the directory was newly created.
 */
export const ensureDir = async (path: string): Promise<boolean> => {
  try {
    const result = await mkdir(path, { recursive: true });
    return result !== undefined;
  } catch {
    // Directory may already exist
    try {
      await access(path);
      return false;
    } catch {
      throw new Error(`Failed to create directory: ${path}`);
    }
  }
};

/**
 * Recursively remove a directory.
 */
export const removeDir = async (path: string): Promise<void> => {
  await rm(path, { recursive: true, force: true });
};

/**
 * Check if a path exists (file or directory).
 */
export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * List directory entries (names only, not full paths).
 */
export const listDir = async (path: string): Promise<readonly string[]> => {
  return readdir(path);
};
