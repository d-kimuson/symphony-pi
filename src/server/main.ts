/** Symphony-pi server entry point. */

import { basename, resolve } from 'node:path';

import { createHonoApp } from './app.ts';
import { createRealSessionHandle } from './app/agents/workflows/runAgentSession.ts';
import { bootstrapProjectRuntime } from './app/bootstrap.ts';
import { createTrackerAdapter } from './app/issues/adapters/adapterFactory.ts';
import { createProjectRegistry, type ProjectRuntime } from './app/runtime/model.ts';
import { applyBootstrapFailurePolicy } from './bootstrapFailurePolicy.ts';
import { parseCliArgs } from './cli.ts';
import { routes } from './routes.ts';
import { resolveSymphonyRuntime, type SymphonyRuntime } from './runtime.ts';
import { startServer } from './server.ts';
import {
  inferProjectRootFromWorkflow,
  sanitizeProjectId,
} from './serviceConfig/services/projectConfig.ts';
import { loadServiceConfig } from './serviceConfig/workflows/loadServiceConfig.ts';

const exitWithError = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const bootstrapSingleProject = async (
  workflowPath: string,
  runtime: SymphonyRuntime,
): Promise<readonly ProjectRuntime[]> => {
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

  const handled = applyBootstrapFailurePolicy({
    runtime,
    result,
    failureMessage: `[symphony] Bootstrap failed at phase "${'type' in result ? result.phase : 'unknown'}": ${'type' in result ? result.message : ''}`,
  });

  if (handled.warning !== null) {
    console.warn(handled.warning);
  }

  return handled.runtime === null ? [] : [handled.runtime];
};

const bootstrapConfiguredProjects = async (
  configPath: string,
  runtime: SymphonyRuntime,
): Promise<readonly ProjectRuntime[]> => {
  const configResult = loadServiceConfig(configPath);
  if (configResult.type !== 'loaded') {
    if (runtime === 'prod') {
      return exitWithError(`[symphony] Failed to load service config: ${configResult.error}`);
    }

    console.warn(
      `[symphony] Failed to load service config: ${configResult.error} (continuing without project runtime because SYMPHONY_RUNTIME=${runtime})`,
    );
    return [];
  }

  const serviceConfig = configResult.config;
  const runtimes: ProjectRuntime[] = [];
  for (const project of serviceConfig.projects) {
    const runtimeResult = await bootstrapProjectRuntime({
      projectId: project.id,
      projectRoot: project.root,
      workflowPath: project.workflowPath,
      createTrackerAdapter,
      createSessionHandle: createRealSessionHandle,
    });

    const handled = applyBootstrapFailurePolicy({
      runtime,
      result: runtimeResult,
      failureMessage: `[symphony] Bootstrap failed for project "${project.id}" at phase "${'type' in runtimeResult ? runtimeResult.phase : 'unknown'}": ${'type' in runtimeResult ? runtimeResult.message : ''}`,
    });

    if (handled.warning !== null) {
      console.warn(handled.warning);
      continue;
    }

    if (handled.runtime !== null) {
      runtimes.push(handled.runtime);
    }
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

export const runSymphonyCli = async (argv: readonly string[] = process.argv): Promise<void> => {
  const args = parseCliArgs(argv);
  const runtime = resolveSymphonyRuntime();

  const runtimes =
    args.mode === 'config'
      ? await bootstrapConfiguredProjects(args.configPath, runtime)
      : await bootstrapSingleProject(args.workflowPath, runtime);

  const mode = runtimes.length > 1 ? 'multi-project' : 'single-project';
  const registry = createProjectRegistry(mode, runtimes);
  const app = createHonoApp();
  routes(app, registry, { runtime });

  const firstRuntime = runtimes[0];
  const firstConfig = firstRuntime?.getConfig();
  const serverResult = await startServer({
    app,
    preferredPort: args.port ?? firstConfig?.server.port,
    host: firstConfig?.server.host,
  });

  installShutdownHandlers(runtimes, serverResult.cleanUp);
  console.log(
    `[symphony] Service started successfully (${mode}, ${runtimes.length} project(s), runtime=${runtime})`,
  );
};

if (import.meta.main) {
  void runSymphonyCli().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[symphony] Fatal bootstrap error: ${message}`);
    process.exit(1);
  });
}
