/** Runtime schemas for service configuration. */

import type { EffectiveConfig, JiraTrackerConfig, LinearTrackerConfig } from './model.js';

/**
 * Validate the effective config and return a list of validation errors.
 * Returns empty array if valid.
 */

export const validateConfig = (config: EffectiveConfig): readonly string[] => {
  const errors: string[] = [];

  // Tracker validation
  // Read kind first to avoid narrowing issues in the invalid-kind branch
  const kind = config.tracker.kind as string;
  if (kind !== 'linear' && kind !== 'jira') {
    errors.push(`Unsupported tracker kind: ${kind}`);
    return errors;
  }

  if (!config.tracker.api_key) {
    errors.push('Missing tracker.api_key');
  }

  if (kind === 'linear') {
    // oxlint-disable-next-line no-unsafe-type-assertion
    const linear = config.tracker as LinearTrackerConfig;
    if (!linear.project_slug) {
      errors.push('Missing tracker.project_slug (required for Linear)');
    }
  } else {
    // kind === 'jira'
    // oxlint-disable-next-line no-unsafe-type-assertion
    const jira = config.tracker as JiraTrackerConfig;
    if (!jira.base_url) {
      errors.push('Missing tracker.base_url (required for Jira)');
    }
    if (!jira.email) {
      errors.push('Missing tracker.email (required for Jira)');
    }
    const hasProjectKey = jira.project_key !== null && jira.project_key.length > 0;
    const hasJql = jira.jql !== null && jira.jql.length > 0;
    if (!hasProjectKey && !hasJql) {
      errors.push('Either tracker.project_key or tracker.jql is required for Jira');
    }
  }

  // Agent validation
  if (config.agent.max_turns <= 0) {
    errors.push('agent.max_turns must be positive');
  }
  if (config.agent.max_concurrent_agents <= 0) {
    errors.push('agent.max_concurrent_agents must be positive');
  }

  // Hooks validation
  if (config.hooks.timeout_ms <= 0) {
    errors.push('hooks.timeout_ms must be positive');
  }

  // PI validation
  if (config.pi.turn_timeout_ms <= 0) {
    errors.push('pi.turn_timeout_ms must be positive');
  }

  // Server validation
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('server.port must be between 1 and 65535');
  }

  return errors;
};
