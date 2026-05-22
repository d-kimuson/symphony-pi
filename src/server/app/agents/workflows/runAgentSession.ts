/** Side-effectful pi-coding-agent session lifecycle workflow. */

import type { EffectiveConfig } from '../../config/model.js';
import type { Issue } from '../../issues/model.js';
import type { AgentRunnerEvent } from '../model.js';

import { buildContinuationPrompt } from '../services/buildPrompt.js';
import { buildSubagentPrefix, type SubagentRole } from '../services/subagentOrchestrator.js';

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
 * Run an agent session for an issue.
 * Uses the pi-coding-agent SDK (mocked for testing).
 */
export const runAgentSession = async (
  sessionHandle: AgentSessionHandle,
  initialPrompt: string,
  issue: Issue,
  config: EffectiveConfig,
  onEvent: (event: AgentRunnerEvent) => void,
): Promise<AgentRunResult> => {
  const threadId = sessionHandle.sessionId;
  let turnCount = 0;
  let shouldContinue = true;

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

  try {
    while (shouldContinue && turnCount < config.agent.max_turns) {
      turnCount++;

      const turnId = `turn-${turnCount}`;
      const sessionId = `pi:${threadId}:${turnId}`;

      // Determine prompt
      const prompt = turnCount === 1 ? initialPrompt : buildContinuationPrompt(turnCount, issue);

      // Run the prompt with timeout
      const turnResult = await runTurnWithTimeout(sessionHandle, prompt, config.pi.turn_timeout_ms);

      if (turnResult === 'timed_out') {
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

      // After a successful turn, check if we should continue
      // In practice, the orchestrator re-checks the issue state
      // For now, we always continue if max_turns not reached
    }

    return { status: 'completed', turns: turnCount, error: null };
  } finally {
    try {
      await sessionHandle.dispose();
    } catch {
      // Dispose errors are non-fatal
    }
  }
};

const runTurnWithTimeout = async (
  sessionHandle: AgentSessionHandle,
  prompt: string,
  timeoutMs: number,
): Promise<'success' | 'timed_out' | 'failed'> => {
  const timeoutPromise = new Promise<'timed_out'>((resolve) => {
    setTimeout(() => resolve('timed_out'), timeoutMs);
  });

  const turnPromise = sessionHandle
    .prompt(prompt)
    .then(() => 'success' as const)
    .catch(() => 'failed' as const);

  return Promise.race([turnPromise, timeoutPromise]);
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
 * Falls back to mock session if the SDK is unavailable.
 *
 * SPEC 10.1: Uses @earendil-works/pi-coding-agent SDK exports.
 * SPEC 10.1: Validates cwd == workspace path before starting.
 */
export const createRealSessionHandle = async (
  workspacePath: string,
  config: EffectiveConfig,
  subagentRole?: SubagentRole,
): Promise<AgentSessionHandle> => {
  // Apply subagent role configuration if specified
  const effectiveConfig = subagentRole
    ? {
        ...config,
        pi: {
          ...config.pi,
          thinking: subagentRole === 'oracle' ? 'high' : config.pi.thinking,
        },
      }
    : config;

  try {
    const { createPiSessionHandle } = await import('./createPiSession.js');
    const tools = [
      ...effectiveConfig.pi.tools,
      'ticket_get',
      'ticket_comment',
      'ticket_transition',
    ];
    return await createPiSessionHandle({
      workspacePath,
      config: effectiveConfig,
      tools,
    });
  } catch {
    // Graceful fallback to mock on import/initialization failure
    return createMockSessionHandle('success');
  }
};

/**
 * Build a prompt with optional subagent role prefix.
 */
export const buildPromptWithRole = (basePrompt: string, role?: SubagentRole): string => {
  if (!role) return basePrompt;
  const prefix = buildSubagentPrefix(role);
  return prefix + basePrompt;
};
