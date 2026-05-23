/**
 * Real pi-coding-agent SDK session creation.
 * Implements SPEC 10.1 session creation contract.
 *
 * Uses @earendil-works/pi-coding-agent SDK exports.
 * Configures model, thinking, tools, session_dir from EffectiveConfig.
 * NO production mock fallback — SDK failures are startup_failed errors.
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
 * - Passes cwd = workspacePath
 * - Passes pi.model as model option
 * - Passes pi.thinking as thinkingLevel
 * - Passes pi.tools as initialActiveToolNames
 * - Passes pi.session_dir as sessionDir
 *
 * Returns error on SDK failure — NO mock fallback in production.
 */
export const createPiSessionHandle = async (options: PiCreateOptions): Promise<PiSessionResult> => {
  const { workspacePath, config } = options;

  try {
    const { createAgentSession } = await import('@earendil-works/pi-coding-agent');

    // Build SDK options object matching CreateAgentSessionOptions shape
    // Note: pi.model is a string identifier; the SDK resolves it via ModelRegistry.
    // We use Record<string, unknown> because CreateAgentSessionOptions types vary by SDK version.
    const sdkOptions: Record<string, unknown> = {
      cwd: workspacePath,
    };

    if (config.pi.model !== null) {
      sdkOptions['model'] = config.pi.model;
    }
    if (config.pi.thinking !== null) {
      sdkOptions['thinkingLevel'] = config.pi.thinking;
    }
    if (config.pi.tools.length > 0) {
      sdkOptions['initialActiveToolNames'] = [...config.pi.tools];
    }
    if (config.pi.session_dir !== null) {
      sdkOptions['sessionDir'] = config.pi.session_dir;
    }

    // The SDK function signature accepts CreateAgentSessionOptions which may vary.
    // We use a Record to pass config values; the SDK validates at runtime.
    // Safe because createAgentSession accepts a superset of these options.
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
          subscribe: (_handler: (event: unknown) => void): (() => void) => {
            // pi SDK has private event listeners; turn completion via prompt() resolution
            return () => {};
          },
        },
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { type: 'error', error: `pi SDK session creation failed: ${message}` };
  }
};
