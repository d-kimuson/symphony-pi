import type { Hono } from 'hono';

import type { HonoAppType, HonoContext } from './app.ts';
import type { ProjectRegistry } from './app/runtime/model.ts';

import { mountStatusRoutes } from './app/status/routes.ts';

const renderDashboard = (registry: ProjectRegistry): string => {
  const projectCount = registry.list().length;
  const modeLabel = registry.mode === 'multi-project' ? 'multi-project' : 'single-project';

  return `<!DOCTYPE html>
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
  <p class="subtitle">Coding agent orchestration service · ${modeLabel} · ${projectCount} project(s)</p>
  <div class="endpoints">
    <div class="endpoint">
      <span class="method">GET</span>
      <span class="path">/api/v1/state</span>
      <p class="desc">Aggregate runtime snapshot for all projects</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span>
      <span class="path">/api/v1/projects</span>
      <p class="desc">Project list and per-project summary</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span>
      <span class="path">/api/v1/projects/:projectId/state</span>
      <p class="desc">Project-specific runtime snapshot</p>
    </div>
    <div class="endpoint">
      <span class="method">POST</span>
      <span class="path">/api/v1/projects/:projectId/refresh</span>
      <p class="desc">Trigger a project-specific poll tick</p>
    </div>
    <div class="endpoint">
      <span class="method">POST</span>
      <span class="path">/api/v1/refresh</span>
      <p class="desc">Trigger refresh for all projects</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span>
      <span class="path">/info</span>
      <p class="desc">Health check</p>
    </div>
  </div>
</body>
</html>`;
};

export const routes = (app: HonoAppType, registry: ProjectRegistry) => {
  app.get('/info', (c) => {
    return c.json({
      status: 'healthy',
      server: 'symphony-pi',
      mode: registry.mode,
      projects: registry.list().length,
    } as const);
  });

  app.get('/', (c) => c.html(renderDashboard(registry)));

  mountStatusRoutes(app, registry);
  return app;
};

export type RouteType = ReturnType<typeof routes>;

export type ApiSchema = RouteType extends Hono<HonoContext, infer S> ? S : never;
