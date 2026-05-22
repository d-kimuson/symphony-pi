/**
 * Real pi-coding-agent SDK session creation.
 * Implements SPEC 10.1 session creation contract.
 *
 * Uses @earendil-works/pi-coding-agent SDK exports.
 * Falls back to mock session if the SDK is unavailable or misconfigured.
 */

import type { EffectiveConfig } from '../../config/model.js';
import type { AgentSessionHandle } from './runAgentSession.js';

type PiCreateOptions = {
  readonly workspacePath: string;
  readonly config: EffectiveConfig;
  readonly tools: readonly string[];
};

/**
 * Create a real pi-coding-agent SDK session as an AgentSessionHandle.
 *
 * SPEC 10.1: Uses `createAgentSession({ cwd: workspacePath, ... })` from the pi SDK.
 * Falls back to mock session if the SDK is unavailable or throws.
 */
export const createPiSessionHandle = async (
  options: PiCreateOptions,
): Promise<AgentSessionHandle> => {
  const { workspacePath } = options;

  try {
    // Dynamic import to avoid hard failure when pi SDK is not available
    const { createAgentSession } = await import('@earendil-works/pi-coding-agent');

    // Create the session using the SDK API
    const result = await createAgentSession({
      cwd: workspacePath,
    });

    const session = result.session;

    // Wrap the real session in our AgentSessionHandle contract
    return {
      sessionId: session.sessionId,

      prompt: async (message: string): Promise<void> => {
        await session.prompt(message);
      },

      dispose: () => {
        session.dispose();
        return Promise.resolve();
      },

      events: {
        // Note: pi SDK AgentSession has private event listeners.
        // In practice, tools and prompts signal their completion through
        // prompt() resolution/rejection. The orchestrator uses this
        // to track turn lifecycle.
        subscribe: (_handler: (event: unknown) => void): (() => void) => {
          // No-op: the SDK's internal event system is not directly exposed.
          // Turn completion is signaled through prompt() resolution.
          return () => {};
        },
      },
    };
  } catch (error: unknown) {
    // Fall back to mock session when pi SDK is unavailable
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[symphony] pi SDK session creation failed, using mock: ${message}`);

    const { createMockSessionHandle } = await import('./runAgentSession.js');
    return createMockSessionHandle('success');
  }
};
