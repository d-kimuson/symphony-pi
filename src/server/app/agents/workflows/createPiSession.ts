/**
 * Real pi-coding-agent SDK session creation.
 * Implements SPEC 10.1 session creation contract.
 *
 * Uses @earendil-works/pi-coding-agent SDK exports:
 *   - createAgentSession for session lifecycle
 *   - defineTool + TypeBox for custom tool definitions (SPEC 10.5)
 *
 * Each session gets its own tool closure (no module-level shared state).
 * NO production mock fallback — SDK failures return PiSessionResult.error.
 */

import { defineTool } from '@earendil-works/pi-coding-agent';
import { String as Str, Object as Obj } from '@sinclair/typebox';

import type { EffectiveConfig } from '../../config/model.js';
import type { AgentSessionHandle } from './runAgentSession.js';

import { ticketGet, ticketComment, ticketTransition } from '../services/ticketTools.js';

export type PiCreateOptions = {
  readonly workspacePath: string;
  readonly config: EffectiveConfig;
  readonly issueIdentifier: string;
};

export type PiSessionResult =
  | { readonly type: 'created'; readonly handle: AgentSessionHandle }
  | { readonly type: 'error'; readonly error: string };

/**
 * Build ticket tool definitions for a specific issue session.
 * Each session gets its own closure with session-local config/identifier.
 * Uses defineTool + TypeBox for proper pi SDK integration.
 */
const buildTicketToolDefs = (config: EffectiveConfig, issueIdentifier: string) => {
  // ticket_get: fetch issue details — no required params
  const ticketGetTool = defineTool({
    name: 'ticket_get',
    label: 'Get Ticket',
    description: 'Fetch details for the active issue ticket from the tracker',
    promptSnippet: 'ticket_get — fetch issue details',
    parameters: Obj({}),
    execute: async () => {
      const result = await ticketGet(issueIdentifier, config);
      const text = 'error' in result ? `Error: ${result.error}` : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text }], details: {} };
    },
  });

  // ticket_comment: requires `comment` string
  const ticketCommentTool = defineTool({
    name: 'ticket_comment',
    label: 'Comment on Ticket',
    description: 'Add a comment to the active issue ticket via the tracker API',
    promptSnippet: 'ticket_comment — add a comment to the ticket',
    parameters: Obj({
      comment: Str(),
    }),
    execute: async (_toolCallId, params) => {
      const result = await ticketComment(issueIdentifier, params.comment, config);
      const text =
        result === undefined
          ? 'Comment added successfully.'
          : 'error' in result
            ? `Error: ${result.error}`
            : 'Comment added.';
      return { content: [{ type: 'text' as const, text }], details: {} };
    },
  });

  // ticket_transition: requires `state` string, validated against transition_states
  const ticketTransitionTool = defineTool({
    name: 'ticket_transition',
    label: 'Transition Ticket',
    description: `Move the active issue ticket to a target state. Allowed states: ${config.tracker.transition_states.join(', ')}`,
    promptSnippet: 'ticket_transition — move ticket to a target state',
    parameters: Obj({
      state: Str(),
    }),
    execute: async (_toolCallId, params) => {
      const result = await ticketTransition(issueIdentifier, params.state, config);
      const text =
        result === undefined
          ? `Ticket transitioned to ${params.state}.`
          : 'error' in result
            ? `Error: ${result.error}`
            : 'Ticket transitioned.';
      return { content: [{ type: 'text' as const, text }], details: {} };
    },
  });

  return [ticketGetTool, ticketCommentTool, ticketTransitionTool];
};

/**
 * Create a real pi-coding-agent SDK session as an AgentSessionHandle.
 *
 * SPEC 10.1 compliance:
 * - Passes cwd = workspacePath
 * - Passes pi.model through allowlist (SDK uses ModelRegistry internally)
 * - Passes pi.thinking as thinkingLevel
 * - Registers ticket tools as customTools via defineTool + TypeBox
 * - Passes pi.tools + ticket tools as tool allowlist
 * - Subscribes to session events
 * - Returns PiSessionResult.error on SDK failure — NO mock fallback
 */
export const createPiSessionHandle = async (options: PiCreateOptions): Promise<PiSessionResult> => {
  const { workspacePath, config, issueIdentifier } = options;

  try {
    const { createAgentSession } = await import('@earendil-works/pi-coding-agent');

    // Build ticket tool definitions with session-local closure
    const customTools = buildTicketToolDefs(config, issueIdentifier);

    // Build tool allowlist: configured pi.tools + ticket tools
    const toolNames = [...config.pi.tools, 'ticket_get', 'ticket_comment', 'ticket_transition'];

    // Session options matching CreateAgentSessionOptions shape
    const sessionOpts: Record<string, unknown> = {
      cwd: workspacePath,
      customTools,
      tools: toolNames,
    };

    if (config.pi.model !== null) {
      sessionOpts['model'] = config.pi.model;
    }
    if (config.pi.thinking !== null) {
      sessionOpts['thinkingLevel'] = config.pi.thinking;
    }
    if (config.pi.session_dir !== null) {
      sessionOpts['sessionDir'] = config.pi.session_dir;
    }

    // Create session via SDK convenience API.
    // Cast to minimal interface because CreateAgentSessionOptions types vary across SDK versions.
    const result = await (
      createAgentSession as (opts: Record<string, unknown>) => Promise<{
        session: {
          sessionId: string;
          prompt: (msg: string) => Promise<void>;
          dispose: () => void;
          subscribe: (h: (e: unknown) => void) => () => void;
        };
      }>
    )(sessionOpts);

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
