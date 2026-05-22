/** Domain types for the WORKFLOW.md loader. */

import type { Issue } from '../issues/model.js';

export type WorkflowDefinition = {
  readonly config: Record<string, unknown>;
  readonly prompt_template: string;
};

export type WorkflowLoadError =
  | { readonly type: 'missing_workflow_file' }
  | { readonly type: 'workflow_parse_error'; readonly message: string }
  | { readonly type: 'workflow_missing_front_matter' }
  | { readonly type: 'workflow_front_matter_not_a_map' }
  | { readonly type: 'workflow_empty_prompt' };

/**
 * Input for prompt template rendering.
 */
export type PromptTemplateInput = {
  readonly issue: Issue;
  readonly attempt: number | null;
};

/**
 * Template render result.
 */
export type RenderResult =
  | { readonly type: 'rendered'; readonly content: string }
  | { readonly type: 'template_parse_error'; readonly message: string }
  | { readonly type: 'template_render_error'; readonly message: string };
