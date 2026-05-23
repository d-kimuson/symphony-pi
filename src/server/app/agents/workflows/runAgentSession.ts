/** Side-effectful pi-coding-agent session lifecycle workflow. */

import type { EffectiveConfig } from '../../config/model.js';
import type { Issue } from '../../issues/model.js';
import type { AgentRunnerEvent } from '../model.js';

import { buildContinuationPrompt } from '../services/buildPrompt.js';

export type AgentSessionHandle = {
  readonly sessionId: string;
  prompt: (message: string) => Promise<void>;
  dispose: () => Promise<void>;
  events: {
    subscribe: (handler: (event: unknown) => void) => () => void;
  };
};

export type AgentRunResult = {
  readonly status: 'completed' | 'failed' | 'timed_out' | 'cancelled';
  readonly turns: number;
  readonly error: string | null;
};

/**
 * Check the current tracker state for an issue.
 * Passed as a callback so the runner doesn't need to know tracker details.
 */
export type StateChecker = (issueId: string) => Promise<string | null>;

/**
 * Run an agent session for an issue.
 *
 * SPEC 7.1, 7.2, 10.3:
 * - Creates synthetic session IDs
 * - Runs turns with timeout
 * - Checks tracker state between turns
 * - Stops when state leaves active_states or max_turns reached
 * - Disposes session in all exit paths
 */
export const runAgentSession = async (
  sessionHandle: AgentSessionHandle,
  initialPrompt: string,
  issue: Issue,
  config: EffectiveConfig,
  onEvent: (event: AgentRunnerEvent) => void,
  checkState?: StateChecker,
  signal?: AbortSignal,
): Promise<AgentRunResult> => {
  const threadId = sessionHandle.sessionId;
  let turnCount = 0;

  // Emit session_started
  const startEvent: AgentRunnerEvent = {
    event: 'session_started',
    timestamp: new Date().toISOString(),
    session_id: `pi:${threadId}:turn-1`,
    thread_id: threadId,
    turn_id: 'turn-1',
    agent_process_pid: null,
  };
  onEvent(startEvent);

  // Use AbortController for proper timeout/cleanup
  const abortController = new AbortController();

  try {
    while (turnCount < config.agent.max_turns) {
      // Check external abort signal (from reconciliation)
      if (signal !== undefined && signal.aborted) {
        return { status: 'cancelled', turns: turnCount, error: 'Cancelled by reconciliation' };
      }

      turnCount++;

      const turnId = `turn-${turnCount}`;
      const sessionId = `pi:${threadId}:${turnId}`;

      // Determine prompt
      const prompt = turnCount === 1 ? initialPrompt : buildContinuationPrompt(turnCount, issue);

      // Run the prompt with timeout and abort support
      const turnResult = await runTurnWithTimeout(
        sessionHandle,
        prompt,
        config.pi.turn_timeout_ms,
        abortController.signal,
      );

      if (turnResult === 'aborted') {
        // Disposed externally or timed out with abort
        return { status: 'cancelled', turns: turnCount, error: 'Session aborted' };
      }

      if (turnResult === 'timed_out') {
        // Abort the session to prevent side effects
        abortController.abort();
        onEvent({
          event: 'turn_ended_with_error',
          timestamp: new Date().toISOString(),
          session_id: sessionId,
          thread_id: threadId,
          turn_id: turnId,
          error: 'turn_timeout',
        });
        return { status: 'timed_out', turns: turnCount, error: 'Turn timed out' };
      }

      if (turnResult === 'failed') {
        onEvent({
          event: 'turn_failed',
          timestamp: new Date().toISOString(),
          session_id: sessionId,
          thread_id: threadId,
          turn_id: turnId,
          error: 'Agent turn failed',
        });
        return { status: 'failed', turns: turnCount, error: 'Agent turn failed' };
      }

      // Emit turn completed
      onEvent({
        event: 'turn_completed',
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        thread_id: threadId,
        turn_id: turnId,
      });

      // SPEC 7.1: After each turn, re-check tracker state
      if (checkState) {
        const currentState = await checkState(issue.id);
        if (currentState === null) {
          // State check failed; continue running
          continue;
        }

        const stateLower = currentState.toLowerCase();
        const activeStates = config.tracker.active_states.map((s) => s.toLowerCase());

        if (!activeStates.includes(stateLower)) {
          // Issue is no longer active — stop the turn loop
          return {
            status: 'completed',
            turns: turnCount,
            error: `Issue state changed to ${currentState}`,
          };
        }
      }
    }

    return { status: 'completed', turns: turnCount, error: null };
  } finally {
    // Always dispose the session (SPEC 10.6)
    try {
      await sessionHandle.dispose();
    } catch {
      // Dispose errors are non-fatal
    }
  }
};

/**
 * Run a single turn with timeout and abort support.
 * On timeout, disposes the session to abort the underlying pi prompt.
 */
const runTurnWithTimeout = async (
  sessionHandle: AgentSessionHandle,
  prompt: string,
  timeoutMs: number,
  abortSignal: AbortSignal,
): Promise<'success' | 'timed_out' | 'failed' | 'aborted'> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<'timed_out'>((resolve) => {
    timer = setTimeout(() => {
      // On timeout, dispose the session to abort the underlying prompt
      sessionHandle.dispose().catch(() => {});
      resolve('timed_out');
    }, timeoutMs);
  });

  const abortPromise = new Promise<'aborted'>((resolve) => {
    const onAbort = () => {
      resolve('aborted');
      abortSignal.removeEventListener('abort', onAbort);
    };
    if (abortSignal.aborted) {
      resolve('aborted');
    } else {
      abortSignal.addEventListener('abort', onAbort);
    }
  });

  try {
    const turnPromise = sessionHandle
      .prompt(prompt)
      .then(() => 'success' as const)
      .catch(() => 'failed' as const);

    const result = await Promise.race([turnPromise, timeoutPromise, abortPromise]);

    // Clean up timer on non-timeout paths
    if (result !== 'timed_out' && timer !== undefined) {
      clearTimeout(timer);
    }

    return result;
  } finally {
    // Always clear the timer (SPEC 10.6)
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};

/**
 * Create a mock agent session handle for testing.
 */
export const createMockSessionHandle = (
  behavior: 'success' | 'failure' | 'slow_success' = 'success',
): AgentSessionHandle => {
  const sessionId = `mock-session-${Date.now()}`;
  const handlers = new Set<(event: unknown) => void>();

  return {
    sessionId,
    prompt: (_message: string) =>
      new Promise<void>((resolve, reject) => {
        if (behavior === 'failure') {
          reject(new Error('Mock agent failure'));
          return;
        }
        // Emit a mock completion event
        for (const handler of handlers) {
          handler({ type: 'turn_completed' });
        }
        resolve();
      }),
    dispose: () => {
      handlers.clear();
      return Promise.resolve();
    },
    events: {
      subscribe: (handler: (event: unknown) => void) => {
        handlers.add(handler);
        return () => {
          handlers.delete(handler);
        };
      },
    },
  };
};

/**
 * Create a real pi SDK session handle for production use.
 * Returns error if pi SDK is unavailable — NO mock fallback in production.
 */
export const createRealSessionHandle = async (
  workspacePath: string,
  config: EffectiveConfig,
): Promise<AgentSessionHandle> => {
  const { createPiSessionHandle } = await import('./createPiSession.js');
  const result = await createPiSessionHandle({ workspacePath, config });
  if (result.type === 'error') {
    throw new Error(result.error);
  }
  return result.handle;
};
