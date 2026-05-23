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

// Ticket tool definitions (SPEC 10.5)
// Registered as custom tools on the pi session so the agent can operate on tickets.
const ticketToolDefs = {
  ticket_get: {
    name: 'ticket_get',
    description: 'Fetch details for the active issue ticket from the tracker',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  ticket_comment: {
    name: 'ticket_comment',
    description: 'Add a comment to the active issue ticket via the tracker API',
    parameters: {
      type: 'object',
      properties: {
        comment: { type: 'string', description: 'Comment text to add to the ticket' },
      },
      required: ['comment'],
    },
  },
  ticket_transition: {
    name: 'ticket_transition',
    description: 'Move the active issue ticket to a target state',
    parameters: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'Target state name to transition to' },
      },
      required: ['state'],
    },
  },
};

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

    // Register ticket tools as custom tools (SPEC 10.5)
    sdkOptions['customTools'] = [
      ticketToolDefs.ticket_get,
      ticketToolDefs.ticket_comment,
      ticketToolDefs.ticket_transition,
    ];

    // Pass configured tools (SPEC 10.1)
    sdkOptions['initialActiveToolNames'] = [
      ...config.pi.tools,
      'ticket_get',
      'ticket_comment',
      'ticket_transition',
    ];

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
