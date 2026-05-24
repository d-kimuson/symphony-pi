import { serve } from '@hono/node-server';
import getPort, { portNumbers } from 'get-port';

import type { HonoAppType } from './app.ts';

export type ServerOptions = {
  readonly app: HonoAppType;
  /** Preferred starting port (default 48484). Falls back to next available using get-port. */
  readonly preferredPort?: number;
  /** Host to bind to (default 127.0.0.1). */
  readonly host?: string;
};

const DEFAULT_PORT = 48484;
const DEFAULT_HOST = '127.0.0.1';

export const startServer = async (options: ServerOptions) => {
  const { app, preferredPort = DEFAULT_PORT, host = DEFAULT_HOST } = options;

  const port = await getPort({ port: portNumbers(preferredPort, 65535), host });

  const server = serve(
    {
      fetch: app.fetch,
      port,
      hostname: host,
    },
    (info) => {
      console.log(`Server is running on http://${host}:${info.port}`);
    },
  );

  let isRunning = true;
  const cleanUp = () => {
    if (isRunning) {
      server.close();
      isRunning = false;
    }
  };

  return {
    server,
    cleanUp,
    port,
  } as const;
};
