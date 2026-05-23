import type { Hono } from 'hono';

import type { HonoAppType, HonoContext } from './app.ts';

import { mountStatusRoutes } from './app/status/routes.js';

export const routes = (app: HonoAppType) => {
  app.get('/info', (c) => {
    return c.json({
      status: 'healthy',
      server: 'symphony-pi',
    } as const);
  });

  // Dashboard at /
  app.get('/', (c) => {
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Symphony Pi — Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #0d1117; color: #c9d1d9; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .subtitle { color: #8b949e; margin-bottom: 2rem; }
  .endpoints { display: grid; gap: 1rem; }
  .endpoint { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; }
  .endpoint .method { display: inline-block; background: #238636; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; margin-right: 0.5rem; }
  .endpoint .path { font-family: monospace; font-size: 1rem; }
  .endpoint .desc { color: #8b949e; margin-top: 0.5rem; font-size: 0.9rem; }
</style>
</head>
<body>
  <h1>🎵 Symphony Pi</h1>
  <p class="subtitle">Coding agent orchestration service</p>
  <div class="endpoints">
    <div class="endpoint">
      <span class="method">GET</span>
      <span class="path">/api/v1/state</span>
      <p class="desc">Runtime snapshot: running sessions, retry queue, token totals, rate limits</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span>
      <span class="path">/api/v1/:identifier</span>
      <p class="desc">Issue details by identifier (e.g. ABC-123)</p>
    </div>
    <div class="endpoint">
      <span class="method">POST</span>
      <span class="path">/api/v1/refresh</span>
      <p class="desc">Trigger a poll tick refresh</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span>
      <span class="path">/info</span>
      <p class="desc">Health check</p>
    </div>
  </div>
</body>
</html>`);
  });

  mountStatusRoutes(app);
  return app;
};

export type RouteType = ReturnType<typeof routes>;

export type ApiSchema = RouteType extends Hono<HonoContext, infer S> ? S : never;
