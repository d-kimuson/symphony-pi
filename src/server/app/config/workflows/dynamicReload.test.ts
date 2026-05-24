import { watchFile, unwatchFile } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startDynamicReload } from './dynamicReload.ts';
import { loadConfig } from './loadConfig.ts';

vi.mock('./loadConfig.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('node:fs', () => ({
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
}));

describe('startDynamicReload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a cleanup function', () => {
    const cleanup = startDynamicReload(
      '/path/to/WORKFLOW.md',
      () => {},
      () => {},
    );
    expect(typeof cleanup).toBe('function');
  });

  it('sets up file watcher for the workflow path', () => {
    startDynamicReload(
      '/path/to/WORKFLOW.md',
      () => {},
      () => {},
    );
    expect(watchFile).toHaveBeenCalled();
  });

  it('reloads config and calls onReload when valid', () => {
    const onReload = vi.fn();
    const onError = vi.fn();

    vi.mocked(loadConfig).mockReturnValue({ type: 'loaded', config: {} as never });

    startDynamicReload('/path/to/WORKFLOW.md', onReload, onError);

    const calls = vi.mocked(watchFile).mock.calls;
    const listener = calls[0]?.at(-1);
    expect(typeof listener).toBe('function');
    if (typeof listener === 'function') listener({} as never, {} as never);

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reloads config and calls onError when invalid (keeps last good config)', () => {
    const onReload = vi.fn();
    const onError = vi.fn();

    vi.mocked(loadConfig).mockReturnValue({ type: 'error', error: 'Parse error' });

    startDynamicReload('/path/to/WORKFLOW.md', onReload, onError);

    const calls = vi.mocked(watchFile).mock.calls;
    const listener = calls[0]?.at(-1);
    expect(typeof listener).toBe('function');
    if (typeof listener === 'function') listener({} as never, {} as never);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
  });

  it('cleanup removes the watcher', () => {
    const cleanup = startDynamicReload(
      '/path/to/WORKFLOW.md',
      () => {},
      () => {},
    );
    cleanup();
    expect(unwatchFile).toHaveBeenCalled();
  });
});
