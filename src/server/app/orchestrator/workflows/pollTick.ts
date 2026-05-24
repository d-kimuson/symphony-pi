/** Poll tick workflow. The orchestrator is the only owner of scheduling state mutations. */

import type { AgentRunnerEvent } from '../../agents/model.ts';
import type { EffectiveConfig } from '../../config/model.ts';
import type { TrackerAdapter } from '../../issues/adapters/trackerAdapter.ts';
import type { Issue } from '../../issues/model.ts';
import type { OrchestratorState, RunningEntry } from '../model.ts';

import { renderPrompt } from '../../agents/services/buildPrompt.ts';
import {
  runAgentSession,
  type AgentSessionHandle,
} from '../../agents/workflows/runAgentSession.ts';
import { fetchIssues, fetchIssueStatesByIds } from '../../issues/workflows/fetchIssues.ts';
import {
  ensureWorkspace,
  runAfterCreateHook,
  runBeforeRunHook,
  runAfterRunHook,
  removeWorkspace,
} from '../../workspaces/workflows/ensureWorkspace.ts';
import {
  sortCandidatesByPriority,
  isDispatchEligible,
  hasGlobalSlots,
  hasStateSlots,
  createRetryEntry,
  isSessionStalled,
  determineReconciliationAction,
} from '../services/stateTransitions.ts';

export type SessionHandleFactory = (
  workspacePath: string,
  config: EffectiveConfig,
  issueIdentifier: string,
) => Promise<AgentSessionHandle>;

export type PollTickDeps = {
  readonly tracker: TrackerAdapter;
  readonly promptTemplate: string | null;
  readonly createSessionHandle: SessionHandleFactory;
  readonly notify: () => void;
  readonly projectId?: string;
};

const defaultPromptTemplate = `Work on issue {{ issue.identifier }}: {{ issue.title }}

{% if issue.description %}{{ issue.description }}{% endif %}`;

const formatPrefix = (projectId?: string): string => {
  return projectId === undefined ? '[symphony]' : `[symphony][project:${projectId}]`;
};

/**
 * Execute one poll tick.
 * Implements the tick sequence: reconcile → validate → fetch → sort → dispatch → notify.
 */
export const pollTick = async (
  state: OrchestratorState,
  config: EffectiveConfig,
  deps: PollTickDeps,
): Promise<void> => {
  await reconcileRunningIssues(state, config, deps);

  const candidates = await fetchIssues(deps.tracker, deps.projectId);
  if (candidates === null) {
    return;
  }

  console.log(`${formatPrefix(deps.projectId)} Poll tick: ${candidates.length} candidate(s)`);

  const sorted = sortCandidatesByPriority(candidates);

  for (const issue of sorted) {
    if (!hasGlobalSlots(config, state.running)) break;
    if (!hasStateSlots(issue.state, config, state.running)) continue;
    if (!isDispatchEligible(issue, config, state.running, state.claimed)) continue;

    dispatchIssue(state, issue, config, deps);
  }

  deps.notify();
};

/**
 * Reconcile running issues: stall detection (Part A) and tracker state refresh (Part B).
 * SPEC 8.5.
 */
const reconcileRunningIssues = async (
  state: OrchestratorState,
  config: EffectiveConfig,
  deps: PollTickDeps,
): Promise<void> => {
  const runningIds = Array.from(state.running.keys());

  if (runningIds.length === 0) return;

  for (const [issueId, entry] of state.running) {
    if (isSessionStalled(entry, config.pi.stall_timeout_ms, null)) {
      entry.abortController.abort();
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

  const refreshed = await fetchIssueStatesByIds(deps.tracker, runningIds, deps.projectId);

  if (refreshed === null) {
    return;
  }

  for (const issue of refreshed) {
    const entry = state.running.get(issue.id);
    if (entry === undefined) continue;

    const action = determineReconciliationAction(issue.state, config);

    switch (action.action) {
      case 'stop_and_cleanup': {
        entry.abortController.abort();
        state.running.delete(issue.id);
        state.claimed.delete(issue.id);
        state.completed.add(issue.id);
        void removeWorkspace(entry.workspace_path, config).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `${formatPrefix(deps.projectId)} Workspace cleanup failed for ${issue.id}: ${msg}`,
          );
        });
        break;
      }
      case 'keep_running':
        break;
      case 'stop_without_cleanup': {
        entry.abortController.abort();
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
const dispatchIssue = (
  state: OrchestratorState,
  issue: Issue,
  config: EffectiveConfig,
  deps: PollTickDeps,
): void => {
  state.claimed.add(issue.id);

  const wsResult = ensureWorkspace(issue.identifier, config.workspace.root);
  if (wsResult.type === 'error') {
    console.error(`${formatPrefix(deps.projectId)} dispatch failed: ${wsResult.error}`);
    state.claimed.delete(issue.id);
    return;
  }

  const workspace = wsResult.workspace;

  const abortController = new AbortController();

  const entry: RunningEntry = {
    issue_id: issue.id,
    issue_identifier: issue.identifier,
    issue_state: issue.state,
    workspace_path: workspace.path,
    started_at: Date.now(),
    attempt: null,
    turn_count: 0,
    abortController,
  };
  state.running.set(issue.id, entry);

  console.log(`${formatPrefix(deps.projectId)} Dispatching ${issue.identifier}: ${issue.title}`);

  void runDispatchWorker(
    state,
    entry,
    issue,
    workspace.path,
    config,
    wsResult.type === 'created',
    abortController.signal,
    deps,
  );
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
  signal: AbortSignal,
  deps: PollTickDeps,
): Promise<void> => {
  if (signal.aborted) {
    handleWorkerExit(
      state,
      entry.issue_id,
      false,
      'Cancelled by reconciliation',
      config,
      deps.projectId,
    );
    return;
  }

  try {
    if (isNewWorkspace && config.hooks.after_create !== null && config.hooks.after_create !== '') {
      const result = await runAfterCreateHook(
        { path: workspacePath, workspace_key: entry.issue_identifier, created_now: true },
        config,
      );
      if (result.type === 'failure' || result.type === 'timeout') {
        console.error(`${formatPrefix(deps.projectId)} after_create hook failed: ${result.error}`);
        handleWorkerExit(
          state,
          entry.issue_id,
          false,
          `after_create hook: ${result.error}`,
          config,
          deps.projectId,
        );
        return;
      }
    }

    const beforeResult = await runBeforeRunHook(workspacePath, config);
    if (beforeResult.type === 'failure' || beforeResult.type === 'timeout') {
      console.error(
        `${formatPrefix(deps.projectId)} before_run hook failed: ${beforeResult.error}`,
      );
      handleWorkerExit(
        state,
        entry.issue_id,
        false,
        `before_run hook: ${beforeResult.error}`,
        config,
        deps.projectId,
      );
      return;
    }

    const template = deps.promptTemplate ?? defaultPromptTemplate;
    const promptResult = renderPrompt(template, { issue, attempt: entry.attempt });
    if (promptResult.type !== 'rendered') {
      handleWorkerExit(
        state,
        entry.issue_id,
        false,
        `Prompt render error: ${promptResult.message}`,
        config,
        deps.projectId,
      );
      return;
    }
    const promptContent = promptResult.content;

    let sessionHandle: AgentSessionHandle;
    try {
      sessionHandle = await deps.createSessionHandle(workspacePath, config, issue.identifier);
      console.log(
        `${formatPrefix(deps.projectId)} Agent session created: ${sessionHandle.sessionId} for ${issue.identifier}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `${formatPrefix(deps.projectId)} Session creation failed for ${issue.identifier}: ${msg}`,
      );
      handleWorkerExit(
        state,
        entry.issue_id,
        false,
        `Session creation failed: ${msg}`,
        config,
        deps.projectId,
      );
      return;
    }

    const onEvent = (_event: AgentRunnerEvent): void => {
      return;
    };

    const checkState = async (issueId: string): Promise<string | null> => {
      const refreshed = await fetchIssueStatesByIds(deps.tracker, [issueId], deps.projectId);
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
      signal,
    );

    const afterResult = await runAfterRunHook(workspacePath, config);
    if (afterResult.type === 'failure' || afterResult.type === 'timeout') {
      console.warn(
        `${formatPrefix(deps.projectId)} after_run hook failed (ignored): ${afterResult.error}`,
      );
    }

    const success = runResult.status === 'completed';
    handleWorkerExit(state, entry.issue_id, success, runResult.error, config, deps.projectId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    handleWorkerExit(state, entry.issue_id, false, `Worker error: ${msg}`, config, deps.projectId);
  }
};

export const handleWorkerExit = (
  state: OrchestratorState,
  issueId: string,
  success: boolean,
  error: string | null,
  config: EffectiveConfig,
  projectId?: string,
): void => {
  const entry = state.running.get(issueId);
  state.running.delete(issueId);

  if (entry === undefined) return;

  if (success) {
    state.completed.add(issueId);
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
    console.log(`${formatPrefix(projectId)} Worker completed for ${entry.issue_identifier}`);
  } else {
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
    console.warn(
      `${formatPrefix(projectId)} Worker failed for ${entry.issue_identifier}: ${error ?? 'unknown error'}`,
    );
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
  deps: PollTickDeps,
): Promise<void> => {
  const retryEntry = state.retry_attempts.get(issueId);
  if (retryEntry === undefined) return;

  state.retry_attempts.delete(issueId);
  state.claimed.delete(issueId);

  const candidates = await fetchIssues(deps.tracker, deps.projectId);
  if (candidates === null) {
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

  const issue = candidates.find((candidate) => candidate.id === issueId);
  if (issue === undefined) {
    return;
  }

  if (!isDispatchEligible(issue, config, state.running, state.claimed)) {
    return;
  }

  if (!hasGlobalSlots(config, state.running)) {
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

  dispatchIssue(state, issue, config, deps);
};
