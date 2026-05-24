import { Hono } from 'hono';

export type HonoContext = {
  Variables: Record<string, never>;
};

export type HonoAppType = Hono<HonoContext>;

export const createHonoApp = (): HonoAppType => new Hono<HonoContext>();
