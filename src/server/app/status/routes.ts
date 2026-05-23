/** HTTP routes for `/api/v1/*` status and control surfaces. */

import type { Hono } from 'hono';

import type { HonoContext } from '../../app.ts';
import type { OrchestratorState } from '../orchestrator/model.ts';

import { buildRuntimeSnapshot } from './services/runtimeSnapshot.ts';

let orchestratorState: OrchestratorState | null = null;
let refreshTrigger: (() => void) | null = null;

/**
 * Set the orchestrator state reference for the status API.
 */
export const setOrchestratorState = (state: OrchestratorState): void => {
  orchestratorState = state;
};

/**
 * Set the refresh trigger (called from orchestrator to trigger poll).
 */
export const setRefreshTrigger = (trigger: () => void): void => {
  refreshTrigger = trigger;
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
  // Dashboard at /
  app.get('/', (c) => {
    const state = getState();
    const snapshot = buildRuntimeSnapshot(state);
    const runningCount = state.running.size;
    const retryingCount = state.retry_attempts.size;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Symphony Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f1117; color: #d4d4d8; padding: 24px; }
    h1 { font-size: 1.5rem; color: #a78bfa; margin-bottom: 8px; }
    .subtitle { color: #71717a; font-size: 0.875rem; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; }
    .card-label { font-size: 0.75rem; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; }
    .card-value { font-size: 1.5rem; font-weight: 600; color: #e4e4e7; margin-top: 4px; }
    .card-unit { font-size: 0.75rem; color: #52525b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { text-align: left; padding: 8px 12px; font-size: 0.75rem; color: #71717a; border-bottom: 1px solid #27272a; }
    td { padding: 8px 12px; font-size: 0.875rem; border-bottom: 1px solid #1c1c21; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; }
    .badge-active { background: #064e3b; color: #6ee7b7; }
    .badge-retry { background: #78350f; color: #fcd34d; }
    .badge-completed { background: #1e3a5f; color: #93c5fd; }
    pre { background: #18181b; border-radius: 4px; padding: 12px; overflow-x: auto; font-size: 0.75rem; color: #a1a1aa; }
  </style>
</head>
<body>
  <h1>Symphony Dashboard</h1>
  <p class="subtitle">Runtime status — updated at ${snapshot.generated_at}</p>

  <div class="grid">
    <div class="card">
      <div class="card-label">Active Sessions</div>
      <div class="card-value">${runningCount}</div>
    </div>
    <div class="card">
      <div class="card-label">Retrying</div>
      <div class="card-value">${retryingCount}</div>
    </div>
    <div class="card">
      <div class="card-label">Input Tokens</div>
      <div class="card-value">${snapshot.agent_totals.input_tokens.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">Output Tokens</div>
      <div class="card-value">${snapshot.agent_totals.output_tokens.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">Runtime</div>
      <div class="card-value">${snapshot.agent_totals.seconds_running}s</div>
    </div>
  </div>

  ${
    snapshot.running.length > 0
      ? `
  <h2 style="font-size: 1rem; margin-bottom: 8px; color: #a1a1aa;">Running Sessions</h2>
  <table>
    <thead><tr><th>Issue</th><th>Turns</th><th>Started</th></tr></thead>
    <tbody>
      ${snapshot.running
        .map(
          (r) => `
        <tr>
          <td><span class="badge badge-active">active</span> ${r.issue_identifier}</td>
          <td>${r.turn_count}</td>
          <td>${r.started_at}</td>
        </tr>`,
        )
        .join('')}
    </tbody>
  </table>
  `
      : '<p style="color: #52525b;">No active sessions</p>'
  }

  ${
    snapshot.retrying.length > 0
      ? `
  <h2 style="font-size: 1rem; margin-bottom: 8px; color: #a1a1aa;">Retry Queue</h2>
  <table>
    <thead><tr><th>Issue</th><th>Attempt</th><th>Due (ms)</th><th>Error</th></tr></thead>
    <tbody>
      ${snapshot.retrying
        .map(
          (r) => `
        <tr>
          <td><span class="badge badge-retry">retry</span> ${r.identifier}</td>
          <td>${r.attempt}</td>
          <td>${r.due_at_ms}</td>
          <td style="color: #fca5a5;">${r.error ?? '-'}</td>
        </tr>`,
        )
        .join('')}
    </tbody>
  </table>
  `
      : '<p style="color: #52525b;">No pending retries</p>'
  }

  <p style="margin-top: 24px; color: #52525b; font-size: 0.75rem;">
    API: <a href="/api/v1/state" style="color: #a78bfa;">/api/v1/state</a>
  </p>
</body>
</html>`;
    return c.html(html);
  });

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
          workspace_path: entry.workspace_path,
          last_agent_timestamp:
            entry.last_agent_timestamp !== undefined
              ? new Date(entry.last_agent_timestamp).toISOString()
              : null,
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

    // Search completed
    if (state.completed.has(identifier)) {
      return c.json({
        found: true,
        type: 'completed',
        identifier,
      });
    }

    return c.json(
      {
        found: false,
        identifier,
        message: 'Issue not found in running, retry, or completed state',
      },
      404,
    );
  });

  app.post('/api/v1/refresh', (c) => {
    if (refreshTrigger) {
      refreshTrigger();
    }
    return c.json({ status: 'refresh_requested' });
  });

  return app;
};
