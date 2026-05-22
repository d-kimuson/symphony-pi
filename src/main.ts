import { parseCliArgs } from './server/cli.js';
import { startServer } from './server/server.js';

const cliArgs = parseCliArgs(process.argv);

const server = await startServer({
  preferredPort: cliArgs.port ?? 48484,
  host: '127.0.0.1',
});

console.log(`Symphony PI started on port ${server.port}`);
