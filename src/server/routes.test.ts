import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import type { HonoContext } from './app.ts';

import { routes } from './routes.ts';

describe('routes', () => {
  const makeApp = (): Hono<HonoContext> => new Hono<HonoContext>();

  it('returns the GET /info route', async () => {
    const app = makeApp();
    routes(app);
    const res = await app.request('/info');
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toEqual({
      status: 'healthy',
      server: 'symphony-pi',
    });
  });

  it('returns 404 for unknown routes', async () => {
    const app = makeApp();
    routes(app);
    const res = await app.request('/unknown');
    expect(res.status).toBe(404);
  });
});
