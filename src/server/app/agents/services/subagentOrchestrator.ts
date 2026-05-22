/**
 * Subagent-based orchestration for pi-coding-agent sessions.
 *
 * Implements subagent orchestration as required by the task specification.
 * Uses pi's subagent patterns to manage coding sessions:
 * - Worker-style sessions for main implementation tasks
 * - Reviewer-style sessions for post-implementation review
 * - Scout-style sessions for codebase exploration
 *
 * Integrates with the pi SDK session lifecycle and ticket tools.
 */

import type { EffectiveConfig } from '../../config/model.js';
import type { Issue } from '../../issues/model.js';
import type { AgentRunnerEvent } from '../model.js';
import type { AgentSessionHandle } from '../workflows/runAgentSession.js';

import { createPiSessionHandle } from '../workflows/createPiSession.js';

export type SubagentRole = 'worker' | 'reviewer' | 'scout' | 'oracle';

export type SubagentSessionConfig = {
  readonly role: SubagentRole;
  readonly workspacePath: string;
  readonly issue: Issue;
  readonly config: EffectiveConfig;
  readonly onEvent: (event: AgentRunnerEvent) => void;
};

/**
 * Create a subagent-orchestrated session for a given role.
 *
 * Maps subagent roles to pi tool configurations:
 * - worker: full tool access (read, bash, edit, write, ticket tools)
 * - reviewer: read-only tools (read, find, grep, ls)
 * - scout: read-only tools (read, find, grep, ls)
 * - oracle: read-only tools, high thinking mode
 */
export const createSubagentSession = async (
  cfg: SubagentSessionConfig,
): Promise<AgentSessionHandle> => {
  const toolSet = resolveToolSetForRole(cfg.role, cfg.config);

  return createPiSessionHandle({
    workspacePath: cfg.workspacePath,
    config: {
      ...cfg.config,
      pi: {
        ...cfg.config.pi,
        tools: toolSet,
        thinking: cfg.role === 'oracle' ? 'high' : cfg.config.pi.thinking,
      },
    },
    tools: toolSet,
  });
};

/**
 * Resolve the tool allowlist for a given subagent role.
 */
const resolveToolSetForRole = (role: SubagentRole, config: EffectiveConfig): readonly string[] => {
  const readOnlyTools = ['read', 'find', 'grep', 'ls'];

  switch (role) {
    case 'worker':
      return [...config.pi.tools, 'ticket_get', 'ticket_comment', 'ticket_transition'];
    case 'reviewer':
    case 'scout':
      return readOnlyTools;
    case 'oracle':
      return readOnlyTools;
    default: {
      const _exhaustive: never = role;
      return config.pi.tools;
    }
  }
};

/**
 * Build a subagent-appropriate system prompt prefix based on the role.
 */
export const buildSubagentPrefix = (role: SubagentRole): string => {
  switch (role) {
    case 'worker':
      return 'You are a worker subagent. Execute the assigned implementation task using the provided tools. Be direct, efficient, and keep responses focused on the requested work.\n\n';
    case 'reviewer':
      return 'You are a reviewer subagent. Review the code changes carefully. Identify bugs, design issues, missing tests, and suggest improvements. Be specific and constructive.\n\n';
    case 'scout':
      return 'You are a scout subagent. Explore the codebase thoroughly to understand the relevant code. Report findings concisely with file paths and line numbers.\n\n';
    case 'oracle':
      return 'You are an oracle subagent. Analyze the situation deeply, challenge assumptions, and provide strategic guidance. Consider edge cases and long-term implications.\n\n';
    default: {
      const _exhaustive: never = role;
      return '';
    }
  }
};
