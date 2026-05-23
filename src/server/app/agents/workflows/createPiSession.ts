/**
 * Real pi-coding-agent SDK session creation.
 * Implements SPEC 10.1 session creation contract.
 *
 * Uses @earendil-works/pi-coding-agent SDK exports with proper types:
 *   - createAgentSession, defineTool, CreateAgentSessionOptions
 *   - ModelRegistry, AuthStorage for model resolution
 *   - SessionManager for session persistence
 *   - TypeBox for ToolDefinition parameter schemas
 *
 * Each session gets its own tool closure (no module-level shared state).
 * NO production mock fallback — SDK failures return PiSessionResult.error.
 */

import {
  AuthStorage,
  type CreateAgentSessionOptions,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  defineTool,
} from '@earendil-works/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import type { EffectiveConfig } from '../../config/model.ts';
import type { AgentSessionHandle } from './runAgentSession.ts';

import { ticketGet, ticketComment, ticketTransition } from '../services/ticketTools.ts';

export type PiCreateOptions = {
  readonly workspacePath: string;
  readonly config: EffectiveConfig;
  readonly issueIdentifier: string;
};

export type PiSessionResult =
  | { readonly type: 'created'; readonly handle: AgentSessionHandle }
  | { readonly type: 'error'; readonly error: string };

/**
 * Resolve a model string like "anthropic/claude-sonnet-4" into a Model object
 * using the ModelRegistry. Returns undefined if not found.
 */
const resolveModel = (
  modelString: string,
  registry: ModelRegistry,
): ReturnType<typeof registry.find> => {
  const parts = modelString.split('/');
  // Format: "provider/modelId" or just "modelId"
  if (parts.length >= 2 && parts[0] !== undefined && parts[1] !== undefined) {
    return registry.find(parts[0], parts[1]);
  }
  // Try across all models
  for (const m of registry.getAll()) {
    if (m.id === modelString) return m;
  }
  return undefined;
};

/**
 * Build ticket tool definitions for a specific issue session.
 * Uses defineTool + TypeBox for proper pi SDK integration (SPEC 10.5).
 */
const buildTicketToolDefs = (config: EffectiveConfig, issueIdentifier: string) => {
  const ticketGetTool = defineTool({
    name: 'ticket_get',
    label: 'Get Ticket',
    description: 'Fetch details for the active issue ticket from the tracker',
    promptSnippet: 'ticket_get — fetch issue details',
    parameters: Type.Object({}),
    execute: async () => {
      const result = await ticketGet(issueIdentifier, config);
      const text = 'error' in result ? `Error: ${result.error}` : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text }], details: {} };
    },
  });

  const ticketCommentTool = defineTool({
    name: 'ticket_comment',
    label: 'Comment on Ticket',
    description: 'Add a comment to the active issue ticket via the tracker API',
    promptSnippet: 'ticket_comment — add a comment to the ticket',
    parameters: Type.Object({
      comment: Type.String({ description: 'Comment text to add to the ticket' }),
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

  const ticketTransitionTool = defineTool({
    name: 'ticket_transition',
    label: 'Transition Ticket',
    description: `Move the active issue ticket to a target state. Allowed states: ${config.tracker.transition_states.join(', ')}`,
    promptSnippet: 'ticket_transition — move ticket to a target state',
    parameters: Type.Object({
      state: Type.String({ description: 'Target state name to transition to' }),
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
 */
export const createPiSessionHandle = async (options: PiCreateOptions): Promise<PiSessionResult> => {
  const { workspacePath, config, issueIdentifier } = options;

  try {
    // Auth + Model resolution
    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);

    // Build session options with proper CreateAgentSessionOptions shape
    const sessionOpts: CreateAgentSessionOptions = {
      cwd: workspacePath,
      authStorage,
      modelRegistry,
      customTools: buildTicketToolDefs(config, issueIdentifier),
      tools: [...config.pi.tools, 'ticket_get', 'ticket_comment', 'ticket_transition'],
    };

    // Model resolution: convert string ID to Model object via ModelRegistry (SPEC 10.1)
    if (config.pi.model !== null) {
      const resolved = resolveModel(config.pi.model, modelRegistry);
      if (resolved === undefined) {
        return {
          type: 'error',
          error: `Model not found: "${config.pi.model}". Check models.json or pi.model config.`,
        };
      }
      sessionOpts.model = resolved;
    }

    if (config.pi.thinking !== null) {
      sessionOpts.thinkingLevel = config.pi.thinking as CreateAgentSessionOptions['thinkingLevel'];
    }

    // Session persistence via SessionManager (SPEC 10.1)
    if (config.pi.session_dir !== null) {
      sessionOpts.sessionManager = SessionManager.create(workspacePath, config.pi.session_dir);
    }

    // Create session via SDK
    const result = await createAgentSession(sessionOpts);
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

        abort: async (): Promise<void> => {
          await session.abort();
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
    console.error(`[symphony] pi SDK session creation failed: ${message}`);
    return { type: 'error', error: `pi SDK session creation failed: ${message}` };
  }
};
