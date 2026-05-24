/**
 * Project runtime bootstrap.
 *
 * Each project owns an isolated tracker adapter, orchestrator state, poll loop,
 * dynamic reload watcher, and shutdown lifecycle.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { EffectiveConfig, TrackerConfig } from './config/model.ts';
import type { TrackerAdapter } from './issues/adapters/trackerAdapter.ts';
import type { OrchestratorState } from './orchestrator/model.ts';
import type { ProjectRuntime } from './runtime/model.ts';

import { startDynamicReload } from './config/workflows/dynamicReload.ts';
import { loadConfig } from './config/workflows/loadConfig.ts';
import { fetchIssuesByStates } from './issues/workflows/fetchIssues.ts';
import {
  handleRetryFire,
  pollTick,
  type SessionHandleFactory,
  type PollTickDeps,
} from './orchestrator/workflows/pollTick.ts';
import { removeWorkspace } from './workspaces/workflows/ensureWorkspace.ts';

export type BootstrapError = {
  readonly type: 'bootstrap_error';
  readonly phase: string;
  readonly message: string;
};

export type CreateTrackerAdapter = (config: TrackerConfig) => TrackerAdapter | BootstrapError;

export type BootstrapOptions = {
  readonly projectId: string;
  readonly projectRoot: string;
  /** Path to WORKFLOW.md */
  readonly workflowPath: string;
  /** Factory for creating a tracker adapter from config */
  readonly createTrackerAdapter: CreateTrackerAdapter;
  /** Factory for creating an agent session handle from workspace path */
  readonly createSessionHandle: SessionHandleFactory;
};

const createInitialState = (config: EffectiveConfig): OrchestratorState => {
  return {
    poll_interval_ms: config.polling.interval_ms,
    max_concurrent_agents: config.agent.max_concurrent_agents,
    running: new Map(),
    claimed: new Set(),
    retry_attempts: new Map(),
    completed: new Set(),
    agent_totals: { input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0 },
    agent_rate_limits: null,
  };
};

const formatPrefix = (projectId: string): string => {
  return `[symphony][project:${projectId}]`;
};

const createPollDeps = (
  tracker: TrackerAdapter,
  config: EffectiveConfig,
  projectId: string,
  createSessionHandle: SessionHandleFactory,
): PollTickDeps => {
  return {
    tracker,
    promptTemplate: config.prompt_template ?? null,
    createSessionHandle,
    notify: () => {
      return;
    },
    projectId,
  };
};

const runStartupCleanup = async (
  tracker: TrackerAdapter,
  config: EffectiveConfig,
  projectId: string,
): Promise<void> => {
  try {
    const terminalIssues = await fetchIssuesByStates(
      tracker,
      config.tracker.terminal_states,
      projectId,
    );
    if (terminalIssues === null) {
      console.warn(
        `${formatPrefix(projectId)} Startup cleanup: failed to fetch terminal issues, skipping`,
      );
      return;
    }

    const { sanitizeWorkspaceKey, buildWorkspacePath } =
      await import('./workspaces/services/workspacePaths.ts');
    let removedCount = 0;
    for (const issue of terminalIssues) {
      const wsKey = sanitizeWorkspaceKey(issue.identifier);
      const wsPath = buildWorkspacePath(config.workspace.root, wsKey);
      if (existsSync(wsPath)) {
        await removeWorkspace(wsPath, config);
        removedCount++;
      }
    }
    console.log(
      `${formatPrefix(projectId)} Startup cleanup: removed ${removedCount} terminal workspaces`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`${formatPrefix(projectId)} Startup cleanup error (continuing): ${msg}`);
  }
};

export const bootstrapProjectRuntime = async (
  options: BootstrapOptions,
): Promise<ProjectRuntime | BootstrapError> => {
  const workflowPath = resolve(options.workflowPath);

  if (!existsSync(workflowPath)) {
    return {
      type: 'bootstrap_error',
      phase: 'workflow_discovery',
      message: `WORKFLOW.md not found at ${workflowPath}`,
    };
  }
  console.log(`${formatPrefix(options.projectId)} Loading workflow from: ${workflowPath}`);

  const configResult = loadConfig(workflowPath);
  if (configResult.type !== 'loaded') {
    return { type: 'bootstrap_error', phase: 'config_validation', message: configResult.error };
  }
  let config = configResult.config;
  console.log(`${formatPrefix(options.projectId)} Config loaded: tracker=${config.tracker.kind}`);

  const adapterResult = options.createTrackerAdapter(config.tracker);
  if ('type' in adapterResult) {
    return adapterResult;
  }
  let tracker = adapterResult;
  console.log(`${formatPrefix(options.projectId)} Tracker adapter created: ${config.tracker.kind}`);

  const state = createInitialState(config);
  await runStartupCleanup(tracker, config, options.projectId);

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let currentTick: (() => Promise<void>) | null = null;

  const startPollLoop = (currentConfig: EffectiveConfig, currentTracker: TrackerAdapter) => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }

    const tick = async () => {
      const deps = createPollDeps(
        currentTracker,
        currentConfig,
        options.projectId,
        options.createSessionHandle,
      );

      try {
        await pollTick(state, currentConfig, deps);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${formatPrefix(options.projectId)} Poll tick error: ${msg}`);
      }

      const now = Date.now();
      const dueIssueIds = [...state.retry_attempts.entries()]
        .filter(([, entry]) => entry.due_at_ms <= now)
        .map(([issueId]) => issueId);

      for (const issueId of dueIssueIds) {
        await handleRetryFire(state, issueId, currentConfig, deps);
      }
    };

    currentTick = tick;
    void tick();
    console.log(`${formatPrefix(options.projectId)} Poll loop started`);

    pollTimer = setInterval(() => {
      void tick();
    }, currentConfig.polling.interval_ms);
  };

  startPollLoop(config, tracker);

  const stopReload = startDynamicReload(
    workflowPath,
    (newConfig: EffectiveConfig) => {
      const newAdapterResult = options.createTrackerAdapter(newConfig.tracker);
      if ('type' in newAdapterResult) {
        console.error(
          `${formatPrefix(options.projectId)} Dynamic reload rejected: ${newAdapterResult.message}`,
        );
        return;
      }

      config = newConfig;
      tracker = newAdapterResult;
      state.poll_interval_ms = newConfig.polling.interval_ms;
      state.max_concurrent_agents = newConfig.agent.max_concurrent_agents;
      startPollLoop(newConfig, newAdapterResult);
      console.log(`${formatPrefix(options.projectId)} Config reloaded successfully`);
    },
    (error: string) => {
      console.error(`${formatPrefix(options.projectId)} Dynamic reload error: ${error}`);
    },
  );

  const refresh = async (): Promise<void> => {
    if (currentTick !== null) {
      await currentTick();
    }
  };

  const shutdown = (): Promise<void> => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    stopReload();
    console.log(`${formatPrefix(options.projectId)} Shutdown complete`);
    return Promise.resolve();
  };

  return {
    projectId: options.projectId,
    projectRoot: options.projectRoot,
    workflowPath,
    getConfig: () => config,
    getState: () => state,
    refresh,
    shutdown,
  };
};

export const bootstrap = bootstrapProjectRuntime;
