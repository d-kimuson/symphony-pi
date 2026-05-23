/**
 * Symphony-pi entry point.
 *
 * Complete startup sequence:
 *   1. Parse CLI args
 *   2. Discover WORKFLOW.md
 *   3. Load and validate config
 *   4. Create tracker adapter
 *   5. Start HTTP server + dashboard
 *   6. Initialize orchestrator + poll loop
 *   7. Start dynamic reload
 *   8. Startup terminal cleanup
 *   9. Graceful shutdown on SIGINT/SIGTERM
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createRealSessionHandle } from './server/app/agents/workflows/runAgentSession.js';
import { bootstrap } from './server/app/bootstrap.js';
import { createTrackerAdapter } from './server/app/issues/adapters/adapterFactory.js';
import { setSessionHandleFactory } from './server/app/orchestrator/workflows/pollTick.js';
import { parseCliArgs } from './server/cli.js';

const args = parseCliArgs(process.argv);

// Set session factory before bootstrap (dependency injection)
setSessionHandleFactory(createRealSessionHandle);

// Resolve workflow path — validate existence for explicit paths
const workflowPath = resolve(args.workflowPath);
if (args.workflowPath !== './WORKFLOW.md' && !existsSync(workflowPath)) {
  console.error(`[symphony] WORKFLOW.md not found at: ${workflowPath}`);
  console.error('[symphony] Provide a valid path or omit the argument to use ./WORKFLOW.md');
  process.exit(1);
}

bootstrap({
  workflowPath,
  preferredPort: args.port,
  createTrackerAdapter,
  createSessionHandle: createRealSessionHandle,
})
  .then((result) => {
    if ('type' in result) {
      console.error(`[symphony] Bootstrap failed at phase "${result.phase}": ${result.message}`);
      process.exit(1);
    }

    console.log('[symphony] Service started successfully');
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[symphony] Fatal bootstrap error: ${message}`);
    process.exit(1);
  });
