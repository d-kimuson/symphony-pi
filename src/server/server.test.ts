import { describe, expect, it, vi } from 'vitest';

import { startServer } from './server.ts';

describe('startServer', () => {
  it('exports a function', () => {
    expect(typeof startServer).toBe('function');
  });

  it('returns server and cleanUp', async () => {
    vi.stubGlobal('process', {
      ...process,
      on: vi.fn(),
    });

    const result = await startServer();
    expect(result).toHaveProperty('server');
    expect(result).toHaveProperty('cleanUp');
    expect(typeof result.cleanUp).toBe('function');

    result.cleanUp();
    vi.unstubAllGlobals();
  });

  it('can be called with preferredPort option', async () => {
    vi.stubGlobal('process', {
      ...process,
      on: vi.fn(),
    });

    const result = await startServer({ preferredPort: 48484 });
    expect(result).toHaveProperty('server');
    expect(result).toHaveProperty('cleanUp');

    result.cleanUp();
    vi.unstubAllGlobals();
  });
});
