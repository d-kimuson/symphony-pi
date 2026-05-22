/** HTTP routes for `/api/v1/*` status and control surfaces. */

import type { Hono } from 'hono';

import type { HonoContext } from '../../app.js';
import type { OrchestratorState } from '../orchestrator/model.js';

import { buildRuntimeSnapshot } from './services/runtimeSnapshot.js';

let orchestratorState: OrchestratorState | null = null;

/**
 * Set the orchestrator state reference for the status API.
 */
export const setOrchestratorState = (state: OrchestratorState): void => {
  orchestratorState = state;
};

const getState = (): OrchestratorState => {
  if (orchestratorState === null) {
    return {
      poll_interval_ms: 30000,
      max_concurrent_agents: 10,
      running: new Map(),
      claimed: new Set(),
      retry_attempts: new Map(),
      completed: new Set(),
      agent_totals: { input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0 },
      agent_rate_limits: null,
    };
  }
  return orchestratorState;
};

/**
 * Mount status API routes on the Hono app.
 */
export const mountStatusRoutes = <T extends Hono<HonoContext>>(app: T): T => {
  app.get('/api/v1/state', (c) => {
    const state = getState();
    const snapshot = buildRuntimeSnapshot(state);
    return c.json(snapshot);
  });

  app.get('/api/v1/:identifier', (c) => {
    const identifier = c.req.param('identifier');

    const state = getState();

    // Search running entries
    for (const [, entry] of state.running) {
      if (entry.issue_identifier === identifier) {
        return c.json({
          found: true,
          type: 'running',
          issue_id: entry.issue_id,
          issue_identifier: entry.issue_identifier,
          turn_count: entry.turn_count,
          started_at: new Date(entry.started_at).toISOString(),
          attempt: entry.attempt,
        });
      }
    }

    // Search retry entries
    for (const [, entry] of state.retry_attempts) {
      if (entry.identifier === identifier) {
        return c.json({
          found: true,
          type: 'retrying',
          issue_id: entry.issue_id,
          identifier: entry.identifier,
          attempt: entry.attempt,
          due_at_ms: entry.due_at_ms,
          error: entry.error,
        });
      }
    }

    return c.json(
      {
        found: false,
        identifier,
        message: 'Issue not found in running or retry state',
      },
      404,
    );
  });

  app.post('/api/v1/refresh', (c) => {
    // Trigger a poll tick refresh (no-op in this context, orchestrator handles it)
    return c.json({ status: 'refresh_requested' });
  });

  return app;
};
