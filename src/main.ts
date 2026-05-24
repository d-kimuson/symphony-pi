/** Symphony-pi entry point. */

import { resolve, basename } from 'node:path';

import { createHonoApp } from './server/app.ts';
import { createRealSessionHandle } from './server/app/agents/workflows/runAgentSession.ts';
import { bootstrapProjectRuntime } from './server/app/bootstrap.ts';
import { createTrackerAdapter } from './server/app/issues/adapters/adapterFactory.ts';
import { createProjectRegistry, type ProjectRuntime } from './server/app/runtime/model.ts';
import { parseCliArgs } from './server/cli.ts';
import { routes } from './server/routes.ts';
import { startServer } from './server/server.ts';
import {
  inferProjectRootFromWorkflow,
  sanitizeProjectId,
} from './server/serviceConfig/services/projectConfig.ts';
import { loadServiceConfig } from './server/serviceConfig/workflows/loadServiceConfig.ts';

const exitWithError = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const bootstrapSingleProject = async (workflowPath: string): Promise<ProjectRuntime> => {
  const resolvedWorkflowPath = resolve(workflowPath);
  const projectRoot = inferProjectRootFromWorkflow(resolvedWorkflowPath);
  const projectId = sanitizeProjectId(basename(projectRoot));

  const result = await bootstrapProjectRuntime({
    projectId,
    projectRoot,
    workflowPath: resolvedWorkflowPath,
    createTrackerAdapter,
    createSessionHandle: createRealSessionHandle,
  });

  if ('type' in result) {
    return exitWithError(
      `[symphony] Bootstrap failed at phase "${result.phase}": ${result.message}`,
    );
  }

  return result;
};

const bootstrapConfiguredProjects = async (
  configPath: string,
): Promise<readonly ProjectRuntime[]> => {
  const configResult = loadServiceConfig(configPath);
  if (configResult.type !== 'loaded') {
    return exitWithError(`[symphony] Failed to load service config: ${configResult.error}`);
  }

  const serviceConfig = configResult.config;
  const runtimes: ProjectRuntime[] = [];
  for (const project of serviceConfig.projects) {
    const runtime = await bootstrapProjectRuntime({
      projectId: project.id,
      projectRoot: project.root,
      workflowPath: project.workflowPath,
      createTrackerAdapter,
      createSessionHandle: createRealSessionHandle,
    });

    if ('type' in runtime) {
      return exitWithError(
        `[symphony] Bootstrap failed for project "${project.id}" at phase "${runtime.phase}": ${runtime.message}`,
      );
    }

    runtimes.push(runtime);
  }

  return runtimes;
};

const installShutdownHandlers = (
  runtimes: readonly ProjectRuntime[],
  shutdownServer: () => void,
): void => {
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    await Promise.all(runtimes.map(async (runtime) => runtime.shutdown()));
    shutdownServer();
    console.log('[symphony] Shutdown complete');
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
};

const main = async (): Promise<void> => {
  const args = parseCliArgs(process.argv);

  const runtimes =
    args.mode === 'config'
      ? await bootstrapConfiguredProjects(args.configPath)
      : [await bootstrapSingleProject(args.workflowPath)];

  const mode = runtimes.length > 1 ? 'multi-project' : 'single-project';
  const registry = createProjectRegistry(mode, runtimes);
  const app = createHonoApp();
  routes(app, registry);

  const firstRuntime = runtimes[0];
  if (firstRuntime === undefined) {
    return exitWithError('[symphony] No project runtimes were created.');
  }

  const firstConfig = firstRuntime.getConfig();
  const serverResult = await startServer({
    app,
    preferredPort: args.port ?? firstConfig.server.port,
    host: firstConfig.server.host,
  });

  installShutdownHandlers(runtimes, serverResult.cleanUp);
  console.log(`[symphony] Service started successfully (${mode}, ${runtimes.length} project(s))`);
};

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[symphony] Fatal bootstrap error: ${message}`);
  process.exit(1);
});
