/** Poll tick workflow. The orchestrator is the only owner of scheduling state mutations. */

import type { AgentRunnerEvent } from '../../agents/model.ts';
import type { EffectiveConfig } from '../../config/model.ts';
import type { TrackerAdapter } from '../../issues/adapters/trackerAdapter.ts';
import type { Issue } from '../../issues/model.ts';
import type { OrchestratorState, RunningEntry } from '../model.ts';

import {
  buildDirtyWorktreePrompt,
  buildResumePrompt,
  renderPrompt,
} from '../../agents/services/buildPrompt.ts';
import {
  runAgentSession,
  type AgentSessionHandle,
} from '../../agents/workflows/runAgentSession.ts';
import { fetchIssues, fetchIssueStatesByIds } from '../../issues/workflows/fetchIssues.ts';
import { inspectGitWorktree } from '../../workspaces/services/gitWorktree.ts';
import {
  readWorkspaceRunState,
  writeWorkspaceRunState,
} from '../../workspaces/services/runState.ts';
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
  resumeSessionFile?: string | null,
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

const maxDirtyAutoResumes = 3;

type DispatchOptions = {
  readonly attempt: number | null;
  readonly resumeSessionFile: string | null;
  readonly resumeReason: 'retry' | 'restart_recovery' | 'continuation' | null;
  readonly resumeError: string | null;
  readonly dirtyAutoResumeCount: number | null;
};

type AgentCycleResult = {
  readonly success: boolean;
  readonly error: string | null;
  readonly turns: number;
  readonly status: string;
};

const formatPrefix = (projectId?: string): string => {
  return projectId === undefined ? '[symphony]' : `[symphony][project:${projectId}]`;
};

const parseEventTimestamp = (timestamp: string): number => {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const persistRunningEntry = (entry: RunningEntry, lastError: string | null): void => {
  try {
    writeWorkspaceRunState(entry.workspace_path, {
      issue_id: entry.issue_id,
      issue_identifier: entry.issue_identifier,
      session_id: entry.session_id,
      session_file: entry.session_file,
      attempt: entry.attempt ?? 0,
      dirty_auto_resume_count: entry.dirty_auto_resume_count,
      last_error: lastError,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[symphony] Failed to persist run state for ${entry.issue_identifier}: ${msg}`);
  }
};

const applyAgentRunnerEvent = (
  state: OrchestratorState,
  issueId: string,
  event: AgentRunnerEvent,
): void => {
  const entry = state.running.get(issueId);
  if (entry === undefined) return;

  entry.last_agent_timestamp = parseEventTimestamp(event.timestamp);

  if (event.event === 'turn_completed') {
    entry.turn_count += 1;

    const inputTokens = event.input_tokens ?? 0;
    const outputTokens = event.output_tokens ?? 0;
    const cacheReadTokens = event.cache_read_input_tokens ?? 0;
    const cacheCreationTokens = event.cache_creation_input_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;

    state.agent_totals = {
      input_tokens:
        state.agent_totals.input_tokens + inputTokens + cacheReadTokens + cacheCreationTokens,
      output_tokens: state.agent_totals.output_tokens + outputTokens,
      total_tokens: state.agent_totals.total_tokens + totalTokens,
      seconds_running: Math.max(
        state.agent_totals.seconds_running,
        Math.floor((Date.now() - entry.started_at) / 1000),
      ),
    };
  }
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
    if (state.retry_attempts.has(issue.id)) continue;
    if (!isDispatchEligible(issue, config, state.running, state.claimed)) continue;

    dispatchIssue(state, issue, config, deps, {
      attempt: null,
      resumeSessionFile: null,
      resumeReason: null,
      resumeError: null,
      dirtyAutoResumeCount: null,
    });
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
    if (isSessionStalled(entry, config.pi.stall_timeout_ms, entry.last_agent_timestamp ?? null)) {
      entry.abortController.abort();
      const attempt = (entry.attempt ?? 0) + 1;
      entry.attempt = attempt;
      const retry = createRetryEntry(
        issueId,
        entry.issue_identifier,
        attempt,
        false,
        config.agent.max_retry_backoff_ms,
        'Stalled session',
        entry.session_file,
        entry.dirty_auto_resume_count,
      );
      persistRunningEntry(entry, 'Stalled session');
      state.running.delete(issueId);
      state.retry_attempts.set(issueId, retry);
      console.warn(
        `${formatPrefix(deps.projectId)} Worker stalled for ${entry.issue_identifier}; retry queued`,
      );
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
        entry.issue_state = action.updatedState;
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
  options: DispatchOptions,
): void => {
  state.claimed.add(issue.id);

  const wsResult = ensureWorkspace(issue.identifier, config.workspace.root);
  if (wsResult.type === 'error') {
    console.error(`${formatPrefix(deps.projectId)} dispatch failed: ${wsResult.error}`);
    state.claimed.delete(issue.id);
    return;
  }

  const workspace = wsResult.workspace;
  const rawRunState = readWorkspaceRunState(workspace.path);
  const savedRunState = rawRunState?.issue_id === issue.id ? rawRunState : null;
  const resumeSessionFile = options.resumeSessionFile ?? savedRunState?.session_file ?? null;
  const attempt = options.attempt ?? savedRunState?.attempt ?? null;
  const dirtyAutoResumeCount =
    options.dirtyAutoResumeCount ?? savedRunState?.dirty_auto_resume_count ?? 0;
  const resumeReason =
    options.resumeReason ?? (resumeSessionFile === null ? null : 'restart_recovery');
  const resumeError = options.resumeError ?? savedRunState?.last_error ?? null;

  const abortController = new AbortController();

  const entry: RunningEntry = {
    issue_id: issue.id,
    issue_identifier: issue.identifier,
    issue_state: issue.state,
    workspace_path: workspace.path,
    started_at: Date.now(),
    attempt,
    session_id: savedRunState?.session_id ?? null,
    session_file: resumeSessionFile,
    dirty_auto_resume_count: dirtyAutoResumeCount,
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
    resumeReason,
    resumeError,
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
  resumeReason: DispatchOptions['resumeReason'],
  resumeError: string | null,
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
        await removeWorkspace(workspacePath, config);
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

    let promptContent: string;
    if (resumeReason !== null) {
      promptContent = buildResumePrompt(issue, resumeReason, resumeError);
    } else {
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
      promptContent = promptResult.content;
    }

    while (!signal.aborted) {
      const cycle = await runAgentCycle(
        state,
        entry,
        issue,
        workspacePath,
        config,
        deps,
        signal,
        promptContent,
      );

      console.log(
        `${formatPrefix(deps.projectId)} Agent run ${cycle.status} for ${entry.issue_identifier} (${cycle.turns} turn(s)${cycle.error === null ? '' : `: ${cycle.error}`})`,
      );

      if (!cycle.success) {
        handleWorkerExit(state, entry.issue_id, false, cycle.error, config, deps.projectId);
        return;
      }

      const inspection = await inspectGitWorktree(workspacePath);
      if (inspection.type === 'dirty') {
        if (entry.dirty_auto_resume_count >= maxDirtyAutoResumes) {
          handleWorkerExit(
            state,
            entry.issue_id,
            false,
            `Dirty worktree remained after ${maxDirtyAutoResumes} auto-resume attempt(s)`,
            config,
            deps.projectId,
          );
          return;
        }

        entry.dirty_auto_resume_count += 1;
        persistRunningEntry(entry, 'Dirty worktree after completed run');
        promptContent = buildDirtyWorktreePrompt(
          issue,
          inspection.status,
          entry.dirty_auto_resume_count,
        );
        console.warn(
          `${formatPrefix(deps.projectId)} Dirty worktree remains for ${entry.issue_identifier}; auto-resuming (${entry.dirty_auto_resume_count}/${maxDirtyAutoResumes})`,
        );
        continue;
      }

      if (inspection.type === 'error') {
        console.warn(
          `${formatPrefix(deps.projectId)} Git worktree inspection failed for ${entry.issue_identifier} (ignored): ${inspection.error}`,
        );
      }

      handleWorkerExit(state, entry.issue_id, true, cycle.error, config, deps.projectId);
      return;
    }

    handleWorkerExit(
      state,
      entry.issue_id,
      false,
      'Cancelled by reconciliation',
      config,
      deps.projectId,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    handleWorkerExit(state, entry.issue_id, false, `Worker error: ${msg}`, config, deps.projectId);
  }
};

const runAgentCycle = async (
  state: OrchestratorState,
  entry: RunningEntry,
  issue: Issue,
  workspacePath: string,
  config: EffectiveConfig,
  deps: PollTickDeps,
  signal: AbortSignal,
  promptContent: string,
): Promise<AgentCycleResult> => {
  let sessionHandle: AgentSessionHandle;
  try {
    const isResume = entry.session_file !== null;
    sessionHandle = await deps.createSessionHandle(
      workspacePath,
      config,
      issue.identifier,
      entry.session_file,
    );
    entry.session_id = sessionHandle.sessionId;
    entry.session_file = sessionHandle.sessionFile ?? entry.session_file;
    persistRunningEntry(entry, null);
    console.log(
      `${formatPrefix(deps.projectId)} Agent session ${isResume ? 'resumed' : 'created'}: ${sessionHandle.sessionId} for ${issue.identifier}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `${formatPrefix(deps.projectId)} Session creation failed for ${issue.identifier}: ${msg}`,
    );
    return {
      success: false,
      error: `Session creation failed: ${msg}`,
      turns: 0,
      status: 'failed',
    };
  }

  const onEvent = (event: AgentRunnerEvent): void => {
    applyAgentRunnerEvent(state, entry.issue_id, event);
    deps.notify();
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

  return {
    success: runResult.status === 'completed',
    error: runResult.error,
    turns: runResult.turns,
    status: runResult.status,
  };
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
    entry.attempt = 1;
    entry.dirty_auto_resume_count = 0;
    persistRunningEntry(entry, null);
    const retry = createRetryEntry(
      issueId,
      entry.issue_identifier,
      1,
      true,
      config.agent.max_retry_backoff_ms,
      null,
      entry.session_file,
      0,
    );
    state.retry_attempts.set(issueId, retry);
    console.log(`${formatPrefix(projectId)} Worker completed for ${entry.issue_identifier}`);
  } else {
    const attempt = (entry.attempt ?? 0) + 1;
    entry.attempt = attempt;
    persistRunningEntry(entry, error ?? 'unknown error');
    const retry = createRetryEntry(
      issueId,
      entry.issue_identifier,
      attempt,
      false,
      config.agent.max_retry_backoff_ms,
      error,
      entry.session_file,
      entry.dirty_auto_resume_count,
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

  state.claimed.add(issueId);
  state.retry_attempts.delete(issueId);

  const candidates = await fetchIssues(deps.tracker, deps.projectId);
  if (candidates === null) {
    const retry = createRetryEntry(
      issueId,
      retryEntry.identifier,
      retryEntry.attempt + 1,
      false,
      config.agent.max_retry_backoff_ms,
      'Retry fire: candidate fetch failed',
      retryEntry.session_file,
      retryEntry.dirty_auto_resume_count,
    );
    state.retry_attempts.set(issueId, retry);
    return;
  }

  const issue = candidates.find((candidate) => candidate.id === issueId);
  if (issue === undefined) {
    state.claimed.delete(issueId);
    return;
  }

  const claimedExcludingRetriedIssue = new Set(state.claimed);
  claimedExcludingRetriedIssue.delete(issueId);

  if (!isDispatchEligible(issue, config, state.running, claimedExcludingRetriedIssue)) {
    state.claimed.delete(issueId);
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
      retryEntry.session_file,
      retryEntry.dirty_auto_resume_count,
    );
    state.retry_attempts.set(issueId, retry);
    return;
  }

  dispatchIssue(state, issue, config, deps, {
    attempt: retryEntry.attempt,
    resumeSessionFile: retryEntry.session_file,
    resumeReason:
      retryEntry.session_file === null
        ? null
        : retryEntry.error === null
          ? 'continuation'
          : 'retry',
    resumeError: retryEntry.error,
    dirtyAutoResumeCount: retryEntry.dirty_auto_resume_count,
  });
};
