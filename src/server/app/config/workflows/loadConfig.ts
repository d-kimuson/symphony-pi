/** Side-effectful configuration loading/reloading entry point. */

import type { EffectiveConfig } from '../model.ts';

import { getWorkflowDir } from '../../workflow/services/resolveWorkflowConfig.ts';
import { loadWorkflow } from '../../workflow/workflows/loadWorkflow.ts';
import { validateConfig } from '../schema.ts';
import { resolveEffectiveConfig } from '../services/resolveConfig.ts';

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
