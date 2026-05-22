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

  mountStatusRoutes(app);
  return app;
};

export type RouteType = ReturnType<typeof routes>;

export type ApiSchema = RouteType extends Hono<HonoContext, infer S> ? S : never;
