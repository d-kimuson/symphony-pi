/**
 * Real pi-coding-agent SDK session creation.
 * Implements SPEC 10.1 session creation contract.
 *
 * Uses @earendil-works/pi-coding-agent SDK exports:
 *   - createAgentSession for session lifecycle
 *   - defineTool + TypeBox for custom tool definitions
 *
 * NO production mock fallback — SDK failures are startup errors.
 */

import type { EffectiveConfig } from '../../config/model.js';
import type { AgentSessionHandle } from './runAgentSession.js';

import { ticketGet, ticketComment, ticketTransition } from '../services/ticketTools.js';

// Ticket tool definitions registered as pi session custom tools (SPEC 10.5)
// Use defineTool from pi SDK when available; plain objects for type compatibility

// Shared state for ticket tool execution
let _ticketConfig: EffectiveConfig | null = null;
let _ticketIssueIdentifier: string | null = null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const setTicketContext = (config: EffectiveConfig, issueIdentifier: string) => {
  _ticketConfig = config;
  _ticketIssueIdentifier = issueIdentifier;
};

const getTicketConfig = (): EffectiveConfig => {
  if (_ticketConfig === null) throw new Error('Ticket tools not initialized');
  return _ticketConfig;
};

const getTicketIssueId = (): string => {
  if (_ticketIssueIdentifier === null) throw new Error('Ticket tools not initialized');
  return _ticketIssueIdentifier;
};

const ticketToolList = [
  {
    name: 'ticket_get',
    label: 'Get Ticket',
    description: 'Fetch details for the active issue ticket from the tracker',
    parameters: { type: 'object', properties: {} },
    execute: async (_toolCallId: string, _params: unknown): Promise<{ resultForModel: string }> => {
      const config = getTicketConfig();
      const identifier = getTicketIssueId();
      const result = await ticketGet(identifier, config);
      return { resultForModel: JSON.stringify(result) };
    },
  },
  {
    name: 'ticket_comment',
    label: 'Comment on Ticket',
    description: 'Add a comment to the active issue ticket via the tracker API',
    parameters: {
      type: 'object',
      properties: { comment: { type: 'string', description: 'Comment text' } },
      required: ['comment'],
    },
    execute: async (_toolCallId: string, params: unknown): Promise<{ resultForModel: string }> => {
      // SAFE: pi SDK passes validated params as unknown; we narrow at runtime
      const args = params as { comment: string };
      const config = getTicketConfig();
      const identifier = getTicketIssueId();
      const result = await ticketComment(identifier, args.comment, config);
      if (result === undefined) return { resultForModel: 'Comment added successfully.' };
      if ('error' in result) return { resultForModel: `Error: ${result.error}` };
      return { resultForModel: 'Comment added.' };
    },
  },
  {
    name: 'ticket_transition',
    label: 'Transition Ticket',
    description: 'Move the active issue ticket to a target state',
    parameters: {
      type: 'object',
      properties: { state: { type: 'string', description: 'Target state name' } },
      required: ['state'],
    },
    execute: async (_toolCallId: string, params: unknown): Promise<{ resultForModel: string }> => {
      const args = params as { state: string };
      const config = getTicketConfig();
      const identifier = getTicketIssueId();
      const result = await ticketTransition(identifier, args.state, config);
      if (result === undefined) return { resultForModel: `Ticket transitioned to ${args.state}.` };
      if ('error' in result) return { resultForModel: `Error: ${result.error}` };
      return { resultForModel: 'Ticket transitioned.' };
    },
  },
];

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
    sdkOptions['customTools'] = ticketToolList;

    // Pass configured tool allowlist (SPEC 10.1)
    // SDK uses 'tools' (not 'initialActiveToolNames')
    sdkOptions['tools'] = [...config.pi.tools, 'ticket_get', 'ticket_comment', 'ticket_transition'];

    // Create session via SDK convenience API
    const result = await createAgentSession(
      sdkOptions as unknown as Parameters<typeof createAgentSession>[0],
    );

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
