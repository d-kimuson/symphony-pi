/**
 * Tracker adapter factory.
 * Creates Linear or Jira adapter from typed config.
 */

import type { BootstrapError } from '../../bootstrap.ts';
import type { TrackerConfig } from '../../config/model.ts';
import type { TrackerAdapter } from './trackerAdapter.ts';

import { createGitHubAdapter } from './githubAdapter.ts';
import { createJiraAdapter } from './jiraAdapter.ts';
import { createLinearAdapter } from './linearAdapter.ts';

export const createTrackerAdapter = (config: TrackerConfig): TrackerAdapter | BootstrapError => {
  switch (config.kind) {
    case 'linear':
      return createLinearAdapter(config);
    case 'jira':
      return createJiraAdapter(config);
    case 'github':
      return createGitHubAdapter(config);
    default: {
      const _exhaustive: never = config;
      void _exhaustive;
      return {
        type: 'bootstrap_error',
        phase: 'adapter_factory',
        message: 'Unsupported tracker kind',
      };
    }
  }
};
