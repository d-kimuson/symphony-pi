import { parseCliArgs } from './server/cli.js';
import { startServer } from './server/server.js';

const args = parseCliArgs(process.argv);

startServer({
  preferredPort: args.port,
}).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Failed to start server: ${message}`);
  process.exit(1);
});
