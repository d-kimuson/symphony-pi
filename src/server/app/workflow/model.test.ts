import { describe, expect, it } from 'vitest';

import type { WorkflowDefinition, WorkflowLoadError } from './model.js';

describe('WorkflowDefinition', () => {
  const def: WorkflowDefinition = {
    config: { tracker: { kind: 'linear' } },
    prompt_template: '# Task\n\nPlease implement this.',
  } as const satisfies WorkflowDefinition;

  it('has config and prompt_template', () => {
    expect(def.config).toBeDefined();
    expect(def.prompt_template.length).toBeGreaterThan(0);
  });

  it('config is a Record', () => {
    const cfg: Record<string, unknown> = def.config;
    expect(cfg['tracker']).toBeDefined();
  });
});

describe('WorkflowLoadError (discriminated union)', () => {
  it('missing_workflow_file has type only', () => {
    const err: WorkflowLoadError = { type: 'missing_workflow_file' };
    expect(err.type).toBe('missing_workflow_file');
  });

  it('workflow_parse_error has message', () => {
    const err: WorkflowLoadError = { type: 'workflow_parse_error', message: 'Invalid YAML' };
    expect(err.type).toBe('workflow_parse_error');
    expect(err.message).toBe('Invalid YAML');
  });

  it('workflow_missing_front_matter has type only', () => {
    const err: WorkflowLoadError = { type: 'workflow_missing_front_matter' };
    expect(err.type).toBe('workflow_missing_front_matter');
  });

  it('workflow_front_matter_not_a_map has type only', () => {
    const err: WorkflowLoadError = { type: 'workflow_front_matter_not_a_map' };
    expect(err.type).toBe('workflow_front_matter_not_a_map');
  });

  it('workflow_empty_prompt has type only', () => {
    const err: WorkflowLoadError = { type: 'workflow_empty_prompt' };
    expect(err.type).toBe('workflow_empty_prompt');
  });
});
