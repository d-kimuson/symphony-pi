/**
 * Tracker adapter factory.
 * Creates Linear or Jira adapter from typed config.
 */

import type { BootstrapError } from '../../bootstrap.js';
import type { TrackerConfig } from '../../config/model.js';
import type { TrackerAdapter } from './trackerAdapter.js';

import { createJiraAdapter } from './jiraAdapter.js';
import { createLinearAdapter } from './linearAdapter.js';

export const createTrackerAdapter = (config: TrackerConfig): TrackerAdapter | BootstrapError => {
  switch (config.kind) {
    case 'linear':
      return createLinearAdapter(config);
    case 'jira':
      return createJiraAdapter(config);
    default: {
      const _exhaustive: never = config;
      return {
        type: 'bootstrap_error',
        phase: 'adapter_factory',
        message: `Unsupported tracker kind: ${(config as TrackerConfig).kind}`,
      };
    }
  }
};
