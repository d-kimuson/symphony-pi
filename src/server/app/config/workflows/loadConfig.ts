/** Side-effectful configuration loading/reloading entry point. */

import type { EffectiveConfig } from '../model.js';

import { getWorkflowDir } from '../../workflow/services/resolveWorkflowConfig.js';
import { loadWorkflow } from '../../workflow/workflows/loadWorkflow.js';
import { validateConfig } from '../schema.js';
import { resolveEffectiveConfig } from '../services/resolveConfig.js';

export type ConfigLoadResult =
  | { readonly type: 'loaded'; readonly config: EffectiveConfig }
  | { readonly type: 'error'; readonly error: string };

/**
 * Load workflow and resolve effective config.
 * Returns either the config or an error message.
 */
export const loadConfig = (workflowPath: string): ConfigLoadResult => {
  const workflow = loadWorkflow(workflowPath);

  if ('type' in workflow) {
    return { type: 'error', error: `Workflow error: ${workflow.type}` };
  }

  const workflowDir = getWorkflowDir(workflowPath);
  const config = resolveEffectiveConfig(workflow, workflowDir);

  const validationErrors = validateConfig(config);
  if (validationErrors.length > 0) {
    return {
      type: 'error',
      error: `Config validation errors: ${validationErrors.join('; ')}`,
    };
  }

  return { type: 'loaded', config };
};
