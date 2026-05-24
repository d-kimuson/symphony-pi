import { describe, expect, it } from 'vitest';

import { createHonoApp } from './app.ts';
import { startServer } from './server.ts';

describe('startServer', () => {
  it('exports a function', () => {
    expect(typeof startServer).toBe('function');
  });

  it('returns server and cleanUp', async () => {
    const result = await startServer({ app: createHonoApp() });
    expect(result).toHaveProperty('server');
    expect(result).toHaveProperty('cleanUp');
    expect(typeof result.cleanUp).toBe('function');

    result.cleanUp();
  });

  it('can be called with preferredPort option', async () => {
    const result = await startServer({ app: createHonoApp(), preferredPort: 48484 });
    expect(result).toHaveProperty('server');
    expect(result).toHaveProperty('cleanUp');

    result.cleanUp();
  });
});
