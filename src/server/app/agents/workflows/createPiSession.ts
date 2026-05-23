/**
 * Real pi-coding-agent SDK session creation.
 * Implements SPEC 10.1 session creation contract.
 *
 * Uses @earendil-works/pi-coding-agent SDK exports.
 * Creates agent sessions via createAgentSession convenience API.
 *
 * NO production mock fallback — SDK failures are startup errors.
 */

import type { EffectiveConfig } from '../../config/model.js';
import type { AgentSessionHandle } from './runAgentSession.js';

export type PiCreateOptions = {
  readonly workspacePath: string;
  readonly config: EffectiveConfig;
};

export type PiSessionResult =
  | { readonly type: 'created'; readonly handle: AgentSessionHandle }
  | { readonly type: 'error'; readonly error: string };

/**
 * Create a real pi-coding-agent SDK session as an AgentSessionHandle.
 *
 * SPEC 10.1 compliance:
 * - Uses createAgentSession convenience API
 * - Passes cwd = workspacePath
 * - Passes pi.model as model option (string ID resolved by SDK's ModelRegistry)
 * - Passes pi.thinking as thinkingLevel
 * - Subscribes to session events via session.subscribe()
 * - Returns error on SDK failure — NO mock fallback in production
 */
export const createPiSessionHandle = async (options: PiCreateOptions): Promise<PiSessionResult> => {
  const { workspacePath, config } = options;

  try {
    const { createAgentSession } = await import('@earendil-works/pi-coding-agent');

    // Build SDK options object
    const sdkOptions: Record<string, unknown> = {
      cwd: workspacePath,
    };

    if (config.pi.model !== null) {
      sdkOptions['model'] = config.pi.model;
    }
    if (config.pi.thinking !== null) {
      sdkOptions['thinkingLevel'] = config.pi.thinking;
    }

    // Create session via SDK convenience API
    // The SDK type system is complex; we use a structured options object
    const result = await createAgentSession(sdkOptions as Parameters<typeof createAgentSession>[0]);

    const session = result.session;

    return {
      type: 'created',
      handle: {
        sessionId: session.sessionId,

        prompt: async (message: string): Promise<void> => {
          await session.prompt(message);
        },

        dispose: (): Promise<void> => {
          session.dispose();
          return Promise.resolve();
        },

        events: {
          subscribe: (handler: (event: unknown) => void): (() => void) => {
            return session.subscribe((e: unknown) => {
              handler(e);
            });
          },
        },
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { type: 'error', error: `pi SDK session creation failed: ${message}` };
  }
};
