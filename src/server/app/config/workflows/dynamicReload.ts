/** Side-effectful dynamic reload of WORKFLOW.md via file watching. */

import { watchFile, unwatchFile } from 'node:fs';

import type { EffectiveConfig } from '../model.ts';

import { loadConfig } from './loadConfig.ts';

export type ReloadHandler = (newConfig: EffectiveConfig) => void;

/**
 * Start watching WORKFLOW.md for changes and trigger config reloads.
 * Implements SPEC 6.2 dynamic reload.
 */
export const startDynamicReload = (
  workflowPath: string,
  onReload: ReloadHandler,
  onError: (message: string) => void,
): (() => void) => {
  const listener = () => {
    const result = loadConfig(workflowPath);

    if (result.type === 'loaded') {
      onReload(result.config);
    } else {
      onError(`Dynamic reload failed: ${result.error}. Keeping last known good config.`);
    }
  };

  watchFile(workflowPath, { interval: 1000 }, listener);

  return () => {
    unwatchFile(workflowPath, listener);
  };
};
