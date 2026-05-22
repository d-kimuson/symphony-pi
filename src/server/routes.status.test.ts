import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import type { HonoContext } from './app.js';

import { mountStatusRoutes } from './app/status/routes.js';
import { routes } from './routes.js';

const makeApp = (): Hono<HonoContext> => new Hono<HonoContext>();

describe('routes (status API)', () => {
  it('GET /api/v1/state returns snapshot', async () => {
    const app = makeApp();
    mountStatusRoutes(app);
    const res = await app.request('/api/v1/state');
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('generated_at');
    expect(body).toHaveProperty('counts');
    expect(body).toHaveProperty('running');
    expect(body).toHaveProperty('retrying');
  });

  it('GET /api/v1/:identifier returns 404 for unknown', async () => {
    const app = makeApp();
    mountStatusRoutes(app);
    const res = await app.request('/api/v1/NONEXISTENT');
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) throw new Error('expected object');
    // oxlint-disable-next-line no-unsafe-type-assertion
    const b = body as { found: boolean };
    expect(b['found']).toBe(false);
  });

  it('POST /api/v1/refresh returns acknowledged', async () => {
    const app = makeApp();
    mountStatusRoutes(app);
    const res = await app.request('/api/v1/refresh', { method: 'POST' });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) throw new Error('expected object');
    // oxlint-disable-next-line no-unsafe-type-assertion
    const b = body as { status: string };
    expect(b['status']).toBe('refresh_requested');
  });

  it('GET /info still works', async () => {
    const app = makeApp();
    routes(app);
    const res = await app.request('/info');
    expect(res.status).toBe(200);
  });
});
