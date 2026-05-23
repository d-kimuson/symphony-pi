/** Poll tick workflow. The orchestrator is the only owner of scheduling state mutations. */

import type { AgentRunnerEvent } from '../../agents/model.js';
import type { EffectiveConfig } from '../../config/model.js';
import type { Issue } from '../../issues/model.js';
import type { OrchestratorState, RunningEntry } from '../model.js';

import { renderPrompt } from '../../agents/services/buildPrompt.js';
import {
  runAgentSession,
  type AgentSessionHandle,
} from '../../agents/workflows/runAgentSession.js';
import { fetchIssues, fetchIssueStatesByIds } from '../../issues/workflows/fetchIssues.js';
import {
  ensureWorkspace,
  runAfterCreateHook,
  runBeforeRunHook,
  runAfterRunHook,
} from '../../workspaces/workflows/ensureWorkspace.js';
import {
  sortCandidatesByPriority,
  isDispatchEligible,
  hasGlobalSlots,
  createRetryEntry,
  isSessionStalled,
  determineReconciliationAction,
} from '../services/stateTransitions.js';

export type SessionHandleFactory = (
  workspacePath: string,
  config: EffectiveConfig,
) => Promise<AgentSessionHandle>;

// Module-level storage for workflow prompt template (set during bootstrap)
let workflowPromptTemplate: string | null = null;

export const setWorkflowPromptTemplate = (template: string): void => {
  workflowPromptTemplate = template;
};

// Injected by bootstrap
let sessionFactory: SessionHandleFactory | null = null;

export const setSessionHandleFactory = (factory: SessionHandleFactory): void => {
  sessionFactory = factory;
};

/**
 * Execute one poll tick.
 * Implements the tick sequence: reconcile → validate → fetch → sort → dispatch → notify.
 */
export const pollTick = async (
  state: OrchestratorState,
  config: EffectiveConfig,
  onNotify: () => void,
): Promise<void> => {
  // 1. Reconcile running issues
  await reconcileRunningIssues(state, config);

  // 2. Fetch candidate issues
  const candidates = await fetchIssues(config);
  if (candidates === null) {
    // Fetch failed, skip dispatch for this tick
    return;
  }

  // 3. Sort by dispatch priority
  const sorted = sortCandidatesByPriority(candidates);

  // 4. Dispatch eligible issues while slots remain
  for (const issue of sorted) {
    if (!hasGlobalSlots(config, state.running)) break;
    if (!isDispatchEligible(issue, config, state.running, state.claimed)) continue;

    // Claim and dispatch
    dispatchIssue(state, issue, config);
  }

  // 5. Notify observability
  onNotify();
};

/**
 * Reconcile running issues: stall detection (Part A) and tracker state refresh (Part B).
 * SPEC 8.5.
 */
const reconcileRunningIssues = async (
  state: OrchestratorState,
  config: EffectiveConfig,
): Promise<void> => {
  const runningIds = Array.from(state.running.keys());

  if (runningIds.length === 0) return;

  // Part A: Stall detection
  for (const [issueId, entry] of state.running) {
    if (isSessionStalled(entry, config.pi.stall_timeout_ms, null)) {
      // Terminate and queue retry
      const retry = createRetryEntry(
        issueId,
        entry.issue_identifier,
        (entry.attempt ?? 0) + 1,
        false,
        config.agent.max_retry_backoff_ms,
        'Stalled session',
      );
      state.running.delete(issueId);
      state.claimed.delete(issueId);
      state.retry_attempts.set(issueId, retry);
    }
  }

  // Part B: Tracker state refresh (SPEC 8.5 Part B)
  const refreshed = await fetchIssueStatesByIds(config, runningIds);

  if (refreshed === null) {
    // Fetch failed: keep workers running, retry next tick (SPEC 8.5)
    return;
  }

  for (const issue of refreshed) {
    const entry = state.running.get(issue.id);
    if (entry === undefined) continue;

    const action = determineReconciliationAction(issue.state, config);

    switch (action.action) {
      case 'stop_and_cleanup': {
        // Terminal state: terminate worker + clean workspace (SPEC 8.5)
        state.running.delete(issue.id);
        state.claimed.delete(issue.id);
        state.completed.add(issue.id);
        // Workspace cleanup is handled by orchestrator caller
        break;
      }
      case 'keep_running':
        // Active state: update in-memory issue snapshot (SPEC 8.5)
        // Keep running, snapshot is updated via the running entry
        break;
      case 'stop_without_cleanup': {
        // Neither active nor terminal: terminate without workspace cleanup (SPEC 8.5)
        state.running.delete(issue.id);
        state.claimed.delete(issue.id);
        break;
      }
      default:
        break;
    }
  }
};

/**
 * Dispatch an issue: create workspace, run hooks, build prompt, start agent.
 * Runs asynchronously (fire-and-forget from the poll tick perspective).
 */
const dispatchIssue = (state: OrchestratorState, issue: Issue, config: EffectiveConfig): void => {
  state.claimed.add(issue.id);

  // Create workspace
  const wsResult = ensureWorkspace(issue.identifier, config.workspace.root);
  if (wsResult.type === 'error') {
    console.error(`[symphony] dispatch failed: ${wsResult.error}`);
    state.claimed.delete(issue.id);
    return;
  }

  const workspace = wsResult.workspace;

  const entry: RunningEntry = {
    issue_id: issue.id,
    issue_identifier: issue.identifier,
    workspace_path: workspace.path,
    started_at: Date.now(),
    attempt: null,
    turn_count: 0,
  };
  state.running.set(issue.id, entry);

  // Fire-and-forget: run the agent in the background
  void runDispatchWorker(state, entry, issue, workspace.path, config, wsResult.type === 'created');
};

/**
 * Run the full dispatch worker lifecycle:
 * hooks → prompt → agent session → hooks → exit handling.
 */
const runDispatchWorker = async (
  state: OrchestratorState,
  entry: RunningEntry,
  issue: Issue,
  workspacePath: string,
  config: EffectiveConfig,
  isNewWorkspace: boolean,
): Promise<void> => {
  try {
    // Run after_create hook for newly created workspaces (SPEC 9.4)
    if (isNewWorkspace && config.hooks.after_create !== null && config.hooks.after_create !== '') {
      const result = await runAfterCreateHook(
        { path: workspacePath, workspace_key: entry.issue_identifier, created_now: true },
        config,
      );
      if (result.type === 'failure' || result.type === 'timeout') {
        console.error(`[symphony] after_create hook failed: ${result.error}`);
        handleWorkerExit(
          state,
          entry.issue_id,
          false,
          `after_create hook: ${result.error}`,
          config,
        );
        return;
      }
    }

    // Run before_run hook (SPEC 9.4)
    const beforeResult = await runBeforeRunHook(workspacePath, config);
    if (beforeResult.type === 'failure' || beforeResult.type === 'timeout') {
      console.error(`[symphony] before_run hook failed: ${beforeResult.error}`);
      handleWorkerExit(
        state,
        entry.issue_id,
        false,
        `before_run hook: ${beforeResult.error}`,
        config,
      );
      return;
    }

    // Build prompt from workflow template (SPEC 12)
    const template =
      workflowPromptTemplate ??
      `Work on issue {{ issue.identifier }}: {{ issue.title }}

{% if issue.description %}{{ issue.description }}{% endif %}`;
    const promptResult = renderPrompt(template, { issue, attempt: entry.attempt });
    let promptContent: string;
    if (promptResult.type !== 'rendered') {
      handleWorkerExit(
        state,
        entry.issue_id,
        false,
        `Prompt render error: ${promptResult.message}`,
        config,
      );
      return;
    }
    promptContent = promptResult.content;

    // Create pi session handle
    if (sessionFactory === null) {
      handleWorkerExit(state, entry.issue_id, false, 'Session factory not initialized', config);
      return;
    }

    let sessionHandle: AgentSessionHandle;
    try {
      sessionHandle = await sessionFactory(workspacePath, config);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      handleWorkerExit(state, entry.issue_id, false, `Session creation failed: ${msg}`, config);
      return;
    }

    // Run agent session (SPEC 10)
    const onEvent = (_event: AgentRunnerEvent): void => {
      // Events are logged by the runner; we could accumulate token usage here
    };

    const checkState = async (issueId: string): Promise<string | null> => {
      const refreshed = await fetchIssueStatesByIds(config, [issueId]);
      if (refreshed === null || refreshed.length === 0) return null;
      return refreshed[0]?.state ?? null;
    };

    const runResult = await runAgentSession(
      sessionHandle,
      promptContent,
      issue,
      config,
      onEvent,
      checkState,
    );

    // Run after_run hook (SPEC 9.4 — failure logged but ignored)
    const afterResult = await runAfterRunHook(workspacePath, config);
    if (afterResult.type === 'failure' || afterResult.type === 'timeout') {
      console.warn(`[symphony] after_run hook failed (ignored): ${afterResult.error}`);
    }

    // Handle completion
    const success = runResult.status === 'completed';
    handleWorkerExit(state, entry.issue_id, success, runResult.error, config);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    handleWorkerExit(state, entry.issue_id, false, `Worker error: ${msg}`, config);
  }
};

export const handleWorkerExit = (
  state: OrchestratorState,
  issueId: string,
  success: boolean,
  error: string | null,
  config: EffectiveConfig,
): void => {
  const entry = state.running.get(issueId);
  state.running.delete(issueId);

  if (entry === undefined) return;

  if (success) {
    state.completed.add(issueId);

    // Schedule continuation retry (1 second) — SPEC 7.1, 8.4
    state.claimed.delete(issueId);
    const retry = createRetryEntry(
      issueId,
      entry.issue_identifier,
      1,
      true,
      config.agent.max_retry_backoff_ms,
      null,
    );
    state.retry_attempts.set(issueId, retry);
  } else {
    // Schedule exponential backoff retry — SPEC 8.4
    state.claimed.delete(issueId);
    const attempt = (entry.attempt ?? 0) + 1;
    const retry = createRetryEntry(
      issueId,
      entry.issue_identifier,
      attempt,
      false,
      config.agent.max_retry_backoff_ms,
      error,
    );
    state.retry_attempts.set(issueId, retry);
  }
};

/**
 * Handle retry timer fired.
 * SPEC 8.4: On retry fire, re-fetch active candidates and attempt re-dispatch.
 */
export const handleRetryFire = async (
  state: OrchestratorState,
  issueId: string,
  config: EffectiveConfig,
): Promise<void> => {
  const retryEntry = state.retry_attempts.get(issueId);
  if (retryEntry === undefined) return;

  state.retry_attempts.delete(issueId);
  state.claimed.delete(issueId);

  // Re-fetch active candidates and check eligibility (SPEC 8.4)
  const candidates = await fetchIssues(config);
  if (candidates === null) {
    // Fetch failed — requeue with error
    const retry = createRetryEntry(
      issueId,
      retryEntry.identifier,
      retryEntry.attempt + 1,
      false,
      config.agent.max_retry_backoff_ms,
      'Retry fire: candidate fetch failed',
    );
    state.retry_attempts.set(issueId, retry);
    return;
  }

  const issue = candidates.find((c) => c.id === issueId);
  if (issue === undefined) {
    // Issue not found in candidates — release claim (SPEC 8.4)
    return;
  }

  // Check if still eligible
  if (!isDispatchEligible(issue, config, state.running, state.claimed)) {
    // No longer active — release claim
    return;
  }

  // Check if slots available
  if (!hasGlobalSlots(config, state.running)) {
    // No slots — requeue (SPEC 8.4)
    const retry = createRetryEntry(
      issueId,
      retryEntry.identifier,
      retryEntry.attempt,
      false,
      config.agent.max_retry_backoff_ms,
      'no available orchestrator slots',
    );
    state.retry_attempts.set(issueId, retry);
    return;
  }

  // Re-dispatch
  dispatchIssue(state, issue, config);
};
