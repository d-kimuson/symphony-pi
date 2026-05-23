/**
 * Tracker adapter factory.
 * Creates Linear or Jira adapter from typed config.
 */

import type { BootstrapError } from '../../bootstrap.ts';
import type { TrackerConfig } from '../../config/model.ts';
import type { TrackerAdapter } from './trackerAdapter.ts';

import { createJiraAdapter } from './jiraAdapter.ts';
import { createLinearAdapter } from './linearAdapter.ts';

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
