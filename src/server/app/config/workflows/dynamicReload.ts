/** Side-effectful dynamic reload of WORKFLOW.md via file watching. */

import { watchFile } from 'node:fs';

import type { EffectiveConfig } from '../model.js';

import { loadConfig } from './loadConfig.js';

export type ReloadHandler = (newConfig: EffectiveConfig) => void;

/**
 * Start watching WORKFLOW.md for changes and trigger config reloads.
 * Implements SPEC 6.2 dynamic reload.
 *
 * On file change:
 * - Re-read and re-parse the workflow file.
 * - Re-validate the config.
 * - If valid, call the handler with the new config.
 * - If invalid, keep operating with the last known good effective config
 *   and emit an operator-visible error (via console.error + log entry).
 */
export const startDynamicReload = (
  workflowPath: string,
  onReload: ReloadHandler,
  onError: (message: string) => void,
): (() => void) => {
  const watcher = watchFile(workflowPath, { interval: 1000 }, (_curr, _prev) => {
    const result = loadConfig(workflowPath);

    if (result.type === 'loaded') {
      onReload(result.config);
    } else {
      onError(`Dynamic reload failed: ${result.error}. Keeping last known good config.`);
    }
  });

  return () => {
    watcher.unref();
  };
};
