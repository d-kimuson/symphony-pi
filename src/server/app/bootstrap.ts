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

import type { AgentSessionHandle } from './agents/workflows/runAgentSession.js';
import type { EffectiveConfig, TrackerConfig } from './config/model.js';
import type { TrackerAdapter } from './issues/adapters/trackerAdapter.js';
import type { OrchestratorState } from './orchestrator/model.js';

import { startServer } from '../server.js';
import { startDynamicReload } from './config/workflows/dynamicReload.js';
import { loadConfig } from './config/workflows/loadConfig.js';
import { setTrackerAdapter, fetchIssuesByStates } from './issues/workflows/fetchIssues.js';
import { pollTick } from './orchestrator/workflows/pollTick.js';
import { setOrchestratorState } from './status/routes.js';
import { removeWorkspace } from './workspaces/workflows/ensureWorkspace.js';

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
      for (const issue of terminalIssues) {
        const { ensureWorkspace: ew } = await import('./workspaces/workflows/ensureWorkspace.js');
        const wsResult = ew(issue.identifier, config.workspace.root);
        if (wsResult.type !== 'error') {
          await removeWorkspace(wsResult.workspace.path, config);
        }
      }
      console.log(
        `[symphony] Startup cleanup: removed ${terminalIssues.length} terminal workspaces`,
      );
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

      // Fire pending retry timers
      const now = Date.now();
      for (const [issueId, entry] of state.retry_attempts) {
        if (entry.due_at_ms <= now) {
          state.retry_attempts.delete(issueId);
          state.claimed.delete(issueId);
          // The issue will be re-evaluated for dispatch on the next poll tick
        }
      }
    };

    // Run immediate tick
    void tick();

    // Schedule repeated ticks
    pollTimer = setInterval(tick, cfg.polling.interval_ms);
  };

  startPollLoop(config);

  // --- Phase 7: Dynamic reload ---
  const stopReload = startDynamicReload(
    workflowPath,
    (newConfig: EffectiveConfig) => {
      config = newConfig;
      startPollLoop(newConfig);
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
