/** Runtime schemas for service configuration using Valibot. */

import * as v from 'valibot';

import type { EffectiveConfig } from './model.ts';

// Base schemas with type-safe validation
const linearTrackerSchema = v.object({
  kind: v.literal('linear'),
  api_key: v.string(),
  endpoint: v.string(),
  team_key: v.string(),
  project_slug: v.string(),
  active_states: v.array(v.string()),
  terminal_states: v.array(v.string()),
  handoff_states: v.array(v.string()),
  transition_states: v.array(v.string()),
});

const jiraTrackerSchema = v.object({
  kind: v.literal('jira'),
  base_url: v.string(),
  email: v.string(),
  api_key: v.string(),
  project_key: v.nullable(v.string()),
  jql: v.nullable(v.string()),
  active_states: v.array(v.string()),
  terminal_states: v.array(v.string()),
  handoff_states: v.array(v.string()),
  transition_states: v.array(v.string()),
});

const githubTrackerSchema = v.object({
  kind: v.literal('github'),
  token: v.string(),
  api_base_url: v.string(),
  owner: v.string(),
  repo: v.string(),
  state_source: v.literal('labels'),
  close_on_terminal: v.boolean(),
  active_states: v.array(v.string()),
  terminal_states: v.array(v.string()),
  handoff_states: v.array(v.string()),
  transition_states: v.array(v.string()),
});

const configSchema = v.object({
  tracker: v.union([linearTrackerSchema, jiraTrackerSchema, githubTrackerSchema]),
  polling: v.object({ interval_ms: v.pipe(v.number(), v.integer(), v.minValue(1000)) }),
  workspace: v.object({ root: v.pipe(v.string(), v.nonEmpty()) }),
  hooks: v.object({
    after_create: v.nullable(v.string()),
    before_run: v.nullable(v.string()),
    after_run: v.nullable(v.string()),
    before_remove: v.nullable(v.string()),
    timeout_ms: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  agent: v.object({
    max_concurrent_agents: v.pipe(v.number(), v.integer(), v.minValue(1)),
    max_turns: v.pipe(v.number(), v.integer(), v.minValue(1)),
    max_retry_backoff_ms: v.pipe(v.number(), v.integer(), v.minValue(1000)),
    max_concurrent_agents_by_state: v.record(v.string(), v.number()),
  }),
  pi: v.object({
    model: v.nullable(v.string()),
    thinking: v.nullable(v.string()),
    tools: v.array(v.string()),
    session_dir: v.nullable(v.string()),
    turn_timeout_ms: v.pipe(v.number(), v.integer(), v.minValue(1)),
    stall_timeout_ms: v.number(),
  }),
  server: v.object({
    port: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535)),
    host: v.pipe(v.string(), v.nonEmpty()),
  }),
  workflow: v.optional(
    v.object({
      path: v.pipe(v.string(), v.nonEmpty()),
      dir: v.pipe(v.string(), v.nonEmpty()),
    }),
  ),
  prompt_template: v.optional(v.nullable(v.string())),
});

/**
 * Validate the effective config and return a list of validation errors.
 * Uses Valibot for schema validation + business rule checks.
 * Returns empty array if valid.
 */
export const validateConfig = (cfg: EffectiveConfig): readonly string[] => {
  const errors: string[] = [];

  // Tracker kind check
  const kind = cfg.tracker.kind;
  if (kind !== 'linear' && kind !== 'jira' && kind !== 'github') {
    errors.push(`Unsupported tracker kind: ${String(kind)}`);
    return errors;
  }

  // Valibot schema validation for structural checks
  const result = v.safeParse(configSchema, cfg);
  if (!result.success) {
    for (const issue of result.issues) {
      if (issue.path) {
        const path = v.getDotPath(issue) ?? 'config';
        errors.push(`${path}: ${issue.message}`);
      } else {
        errors.push(issue.message);
      }
    }
  }

  // GitHub-specific checks
  if (kind === 'github' && cfg.tracker.state_source !== 'labels') {
    errors.push('tracker.state_source must be labels for GitHub');
  }

  // Agent checks
  if (cfg.agent.max_turns <= 0) {
    errors.push('agent.max_turns must be positive');
  }
  if (cfg.agent.max_concurrent_agents <= 0) {
    errors.push('agent.max_concurrent_agents must be positive');
  }

  // Hooks checks
  if (cfg.hooks.timeout_ms <= 0) {
    errors.push('hooks.timeout_ms must be positive');
  }

  // PI checks
  if (cfg.pi.turn_timeout_ms <= 0) {
    errors.push('pi.turn_timeout_ms must be positive');
  }

  // Server checks
  if (cfg.server.port < 1 || cfg.server.port > 65535) {
    errors.push('server.port must be between 1 and 65535');
  }

  return errors;
};
