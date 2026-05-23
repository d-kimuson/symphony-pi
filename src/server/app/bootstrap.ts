/**
 * Service bootstrap: full startup sequence.
 *
 * Implements the complete startup pipeline:
 *   1. Discover WORKFLOW.md
 *   2. Load and validate config
 *   3. Create tracker adapter
 *   4. Start HTTP server
 *   5. Start orchestrator poll loop
 *   6. Start dynamic reload
 *   7. Startup terminal workspace cleanup
 *   8. Graceful shutdown
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AgentSessionHandle } from './agents/workflows/runAgentSession.ts';
import type { EffectiveConfig, TrackerConfig } from './config/model.ts';
import type { TrackerAdapter } from './issues/adapters/trackerAdapter.ts';
import type { OrchestratorState } from './orchestrator/model.ts';

import { startServer } from '../server.ts';
import { startDynamicReload } from './config/workflows/dynamicReload.ts';
import { loadConfig } from './config/workflows/loadConfig.ts';
import { setTrackerAdapter, fetchIssuesByStates } from './issues/workflows/fetchIssues.ts';
import {
  pollTick,
  handleRetryFire,
  setWorkflowPromptTemplate,
  setSessionHandleFactory,
} from './orchestrator/workflows/pollTick.ts';
import { setOrchestratorState, setRefreshTrigger } from './status/routes.ts';
import { removeWorkspace } from './workspaces/workflows/ensureWorkspace.ts';

// --- Public bootstrap API ---

export type BootstrapResult = {
  readonly config: EffectiveConfig;
  readonly state: OrchestratorState;
  readonly server: ReturnType<typeof startServer> extends Promise<infer T> ? T : never;
  readonly shutdown: () => void;
};

export type BootstrapError = {
  readonly type: 'bootstrap_error';
  readonly phase: string;
  readonly message: string;
};

export type CreateTrackerAdapter = (config: TrackerConfig) => TrackerAdapter | BootstrapError;

export type BootstrapOptions = {
  /** Path to WORKFLOW.md (default: cwd/WORKFLOW.md) */
  readonly workflowPath?: string;
  /** CLI --port override */
  readonly preferredPort?: number;
  /** Factory for creating a tracker adapter from config */
  readonly createTrackerAdapter: CreateTrackerAdapter;
  /** Factory for creating an agent session handle from workspace path */
  readonly createSessionHandle: (
    workspacePath: string,
    config: EffectiveConfig,
    issueIdentifier: string,
  ) => Promise<AgentSessionHandle>;
};

/**
 * Bootstrap the full service.
 * Returns the running state and a shutdown function.
 */
export const bootstrap = async (
  options: BootstrapOptions,
): Promise<BootstrapResult | BootstrapError> => {
  const cwd = process.cwd();
  const workflowPath = resolve(options.workflowPath ?? resolve(cwd, 'WORKFLOW.md'));

  // --- Phase 1: Discover and validate WORKFLOW.md ---
  if (!existsSync(workflowPath)) {
    return {
      type: 'bootstrap_error',
      phase: 'workflow_discovery',
      message: `WORKFLOW.md not found at ${workflowPath}`,
    };
  }
  console.log(`[symphony] Loading workflow from: ${workflowPath}`);

  const configResult = loadConfig(workflowPath);
  if (configResult.type !== 'loaded') {
    return { type: 'bootstrap_error', phase: 'config_validation', message: configResult.error };
  }
  let config = configResult.config;
  console.log(`[symphony] Config loaded: tracker=${config.tracker.kind}`);

  // --- Phase 2: Create tracker adapter ---
  const adapterResult = options.createTrackerAdapter(config.tracker);
  if ('type' in adapterResult) {
    return adapterResult;
  }
  setTrackerAdapter(adapterResult);
  console.log(`[symphony] Tracker adapter created: ${config.tracker.kind}`);

  // Set workflow prompt template for dispatch
  const promptTemplate = config.prompt_template;
  if (promptTemplate !== undefined && promptTemplate !== null && promptTemplate !== '') {
    setWorkflowPromptTemplate(promptTemplate);
    console.log(`[symphony] Workflow prompt template loaded (${promptTemplate.length} chars)`);
  }

  // Set session handle factory
  setSessionHandleFactory(options.createSessionHandle);

  // --- Phase 3: Start HTTP server ---
  const serverResult = await startServer({
    preferredPort: options.preferredPort ?? config.server.port,
    host: config.server.host,
  });
  console.log(
    `[symphony] HTTP server started on http://${config.server.host}:${serverResult.port}`,
  );

  // --- Phase 4: Initialize orchestrator state ---
  const state: OrchestratorState = {
    poll_interval_ms: config.polling.interval_ms,
    max_concurrent_agents: config.agent.max_concurrent_agents,
    running: new Map(),
    claimed: new Set(),
    retry_attempts: new Map(),
    completed: new Set(),
    agent_totals: { input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0 },
    agent_rate_limits: null,
  };
  setOrchestratorState(state);
  console.log('[symphony] Orchestrator state initialized');

  // --- Phase 5: Startup terminal workspace cleanup (SPEC 8.6) ---
  let cleanupComplete = false;
  try {
    const terminalIssues = await fetchIssuesByStates(config, config.tracker.terminal_states);
    if (terminalIssues !== null) {
      const { sanitizeWorkspaceKey, buildWorkspacePath } =
        await import('./workspaces/services/workspacePaths.js');
      let removedCount = 0;
      for (const issue of terminalIssues) {
        const wsKey = sanitizeWorkspaceKey(issue.identifier);
        const wsPath = buildWorkspacePath(config.workspace.root, wsKey);
        if (existsSync(wsPath)) {
          await removeWorkspace(wsPath, config);
          removedCount++;
        }
      }
      console.log(`[symphony] Startup cleanup: removed ${removedCount} terminal workspaces`);
    } else {
      console.warn('[symphony] Startup cleanup: failed to fetch terminal issues, skipping');
    }
    cleanupComplete = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[symphony] Startup cleanup error (continuing): ${msg}`);
  }

  // --- Phase 6: Poll loop ---
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let currentTick: (() => Promise<void>) | null = null;

  // Wire refresh trigger (SPEC 13.7.2: POST /api/v1/refresh)
  setRefreshTrigger(() => {
    if (currentTick !== null) {
      void currentTick();
    }
  });

  const startPollLoop = (cfg: EffectiveConfig) => {
    if (pollTimer !== null) clearInterval(pollTimer);

    const tick = async () => {
      try {
        await pollTick(state, cfg, () => {
          // Notify status consumers (no-op; status API reads state directly)
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[symphony] Poll tick error: ${msg}`);
      }

      // Fire pending retry timers (SPEC 8.4)
      const now = Date.now();
      const dueEntries: Array<{
        issueId: string;
        entry: typeof state.retry_attempts extends Map<string, infer V> ? V : never;
      }> = [];
      for (const [issueId, entry] of state.retry_attempts) {
        if (entry.due_at_ms <= now) {
          dueEntries.push({ issueId, entry });
        }
      }
      for (const { issueId } of dueEntries) {
        await handleRetryFire(state, issueId, cfg);
      }
    };

    currentTick = tick;

    // Run immediate tick
    void tick();

    // Schedule repeated ticks
    pollTimer = setInterval(() => {
      void tick();
    }, cfg.polling.interval_ms);
  };

  startPollLoop(config);

  // --- Phase 7: Dynamic reload ---
  const stopReload = startDynamicReload(
    workflowPath,
    (newConfig: EffectiveConfig) => {
      config = newConfig;
      state.poll_interval_ms = newConfig.polling.interval_ms;
      state.max_concurrent_agents = newConfig.agent.max_concurrent_agents;
      startPollLoop(newConfig);

      // Update workflow prompt template
      if (newConfig.prompt_template !== null && newConfig.prompt_template !== undefined) {
        setWorkflowPromptTemplate(newConfig.prompt_template);
      }

      // Recreate tracker adapter if kind changed (SPEC 6.2)
      const newAdapterResult = options.createTrackerAdapter(newConfig.tracker);
      if (!('type' in newAdapterResult)) {
        setTrackerAdapter(newAdapterResult);
      }

      console.log('[symphony] Config reloaded successfully');
    },
    (error: string) => {
      console.error(`[symphony] Dynamic reload error: ${error}`);
    },
  );

  // --- Phase 8: Graceful shutdown ---
  const shutdown = () => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    stopReload();
    serverResult.cleanUp();
    console.log('[symphony] Shutdown complete');
  };

  // Override SIGINT/SIGTERM from server's handler (more complete shutdown)
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (cleanupComplete) {
    console.log('[symphony] Bootstrap complete. Service is running.');
  }

  return {
    config,
    state,
    server: serverResult,
    shutdown,
  };
};
