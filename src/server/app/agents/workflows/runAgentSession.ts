/** Side-effectful pi-coding-agent session lifecycle workflow. */

import type { EffectiveConfig } from '../../config/model.ts';
import type { Issue } from '../../issues/model.ts';
import type { AgentRunnerEvent } from '../model.ts';

import { buildContinuationPrompt } from '../services/buildPrompt.ts';

export type AgentSessionHandle = {
  readonly sessionId: string;
  readonly sessionFile: string | null;
  prompt: (message: string) => Promise<void>;
  dispose: () => Promise<void>;
  /** Abort the in-flight prompt and session. Used by reconciliation. */
  abort: () => Promise<void>;
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

type TokenUsage = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
};

type TurnResult =
  | { readonly status: 'success' }
  | { readonly status: 'timed_out' }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'aborted' };

const emptyUsage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

const getNumber = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const extractUsage = (value: unknown): TokenUsage | null => {
  const record = asRecord(value);
  const usage = asRecord(record?.['usage']);
  if (usage === null) return null;

  return {
    input: getNumber(usage, 'input'),
    output: getNumber(usage, 'output'),
    cacheRead: getNumber(usage, 'cacheRead'),
    cacheWrite: getNumber(usage, 'cacheWrite'),
  };
};

const extractUsageFromSdkEvent = (event: unknown): TokenUsage | null => {
  const record = asRecord(event);
  if (record === null) return null;

  return extractUsage(record['message']);
};

const toSdkEventType = (event: unknown): string | null => {
  const record = asRecord(event);
  const type = record?.['type'];
  return typeof type === 'string' ? type : null;
};

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
  let abortPromise: Promise<void> | null = null;
  let lastUsage: TokenUsage = emptyUsage;

  const requestAbort = (): Promise<void> => {
    if (abortPromise !== null) {
      return abortPromise;
    }

    abortPromise = sessionHandle.abort().catch(() => {
      return;
    });
    return abortPromise;
  };

  const waitForAbort = async (): Promise<void> => {
    if (abortPromise === null) {
      return;
    }

    await abortPromise;
  };

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

  const unsubscribe = sessionHandle.events.subscribe((sdkEvent: unknown) => {
    const usage = extractUsageFromSdkEvent(sdkEvent);
    if (usage !== null) {
      lastUsage = usage;
    }

    const eventType = toSdkEventType(sdkEvent);
    if (eventType === null) return;

    const turnId = `turn-${Math.max(turnCount, 1)}`;
    const sessionId = `pi:${threadId}:${turnId}`;
    const timestamp = new Date().toISOString();

    if (eventType === 'tool_execution_start') {
      const record = asRecord(sdkEvent);
      const toolName = record?.['toolName'];
      onEvent({
        event: 'tool_execution_start',
        timestamp,
        session_id: sessionId,
        thread_id: threadId,
        turn_id: turnId,
        tool_name: typeof toolName === 'string' ? toolName : 'unknown',
      });
      return;
    }

    if (eventType === 'tool_execution_update') {
      const record = asRecord(sdkEvent);
      const toolName = record?.['toolName'];
      onEvent({
        event: 'tool_execution_update',
        timestamp,
        session_id: sessionId,
        thread_id: threadId,
        turn_id: turnId,
        tool_name: typeof toolName === 'string' ? toolName : 'unknown',
      });
      return;
    }

    if (eventType === 'tool_execution_end') {
      const record = asRecord(sdkEvent);
      const toolName = record?.['toolName'];
      onEvent({
        event: 'tool_execution_end',
        timestamp,
        session_id: sessionId,
        thread_id: threadId,
        turn_id: turnId,
        tool_name: typeof toolName === 'string' ? toolName : 'unknown',
      });
      return;
    }

    onEvent({
      event: 'other_message',
      timestamp,
      session_id: sessionId,
      thread_id: threadId,
      turn_id: turnId,
    });
  });

  // Listen for external abort signal (from reconciliation) and abort session
  let abortListener: (() => void) | undefined;
  if (signal !== undefined) {
    abortListener = () => {
      abortController.abort();
      void requestAbort();
    };
    signal.addEventListener('abort', abortListener, { once: true });
    // If already aborted, abort immediately
    if (signal.aborted) {
      abortListener();
    }
  }

  try {
    while (turnCount < config.agent.max_turns) {
      // Check external abort signal (from reconciliation)
      if (signal !== undefined && signal.aborted) {
        await requestAbort();
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

      if (turnResult.status === 'aborted') {
        await requestAbort();
        return { status: 'cancelled', turns: turnCount, error: 'Session aborted' };
      }

      if (turnResult.status === 'timed_out') {
        abortController.abort();
        await requestAbort();
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

      if (turnResult.status === 'failed') {
        onEvent({
          event: 'turn_failed',
          timestamp: new Date().toISOString(),
          session_id: sessionId,
          thread_id: threadId,
          turn_id: turnId,
          error: turnResult.error,
        });
        return { status: 'failed', turns: turnCount, error: turnResult.error };
      }

      // Emit turn completed
      onEvent({
        event: 'turn_completed',
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        thread_id: threadId,
        turn_id: turnId,
        input_tokens: lastUsage.input,
        output_tokens: lastUsage.output,
        cache_read_input_tokens: lastUsage.cacheRead,
        cache_creation_input_tokens: lastUsage.cacheWrite,
      });
      lastUsage = emptyUsage;

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
    // Remove external abort listener to prevent leaks
    if (abortListener !== undefined && signal !== undefined) {
      signal.removeEventListener('abort', abortListener);
    }
    unsubscribe();
    await waitForAbort();
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
 * Timeout is reported to the caller, which must abort the underlying session
 * before disposing it.
 */
const runTurnWithTimeout = async (
  sessionHandle: AgentSessionHandle,
  prompt: string,
  timeoutMs: number,
  abortSignal: AbortSignal,
): Promise<TurnResult> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<TurnResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({ status: 'timed_out' });
    }, timeoutMs);
  });

  const abortPromise = new Promise<TurnResult>((resolve) => {
    const onAbort = () => {
      resolve({ status: 'aborted' });
      abortSignal.removeEventListener('abort', onAbort);
    };
    if (abortSignal.aborted) {
      resolve({ status: 'aborted' });
    } else {
      abortSignal.addEventListener('abort', onAbort);
    }
  });

  try {
    const turnPromise = sessionHandle
      .prompt(prompt)
      .then((): TurnResult => ({ status: 'success' }))
      .catch((err: unknown): TurnResult => {
        const message = err instanceof Error ? err.message : String(err);
        return { status: 'failed', error: message };
      });

    const result = await Promise.race([turnPromise, timeoutPromise, abortPromise]);

    // Clean up timer on non-timeout paths
    if (result.status !== 'timed_out' && timer !== undefined) {
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
    sessionFile: null,
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
    abort: () => {
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
  issueIdentifier: string,
  resumeSessionFile?: string | null,
): Promise<AgentSessionHandle> => {
  const { createPiSessionHandle } = await import('./createPiSession.ts');
  const result = await createPiSessionHandle({
    workspacePath,
    config,
    issueIdentifier,
    resumeSessionFile: resumeSessionFile ?? null,
  });
  if (result.type === 'error') {
    throw new Error(result.error);
  }
  return result.handle;
};
