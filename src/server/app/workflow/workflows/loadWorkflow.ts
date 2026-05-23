/** Side-effectful WORKFLOW.md loading/parsing entry point. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

import type { WorkflowDefinition, WorkflowLoadError } from '../model.ts';

/**
 * Parse YAML front matter from a Markdown file.
 * Returns the front matter config object and the trimmed body.
 */
export const parseFrontMatter = (
  content: string,
): { config: Record<string, unknown>; body: string } | WorkflowLoadError => {
  const lines = content.split('\n');

  // File MUST start with ---
  if (lines[0] === undefined || lines[0].trim() !== '---') {
    return { type: 'workflow_missing_front_matter' };
  }

  // Find closing ---
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && line.trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { type: 'workflow_missing_front_matter' };
  }

  const yamlStr = lines.slice(1, endIndex).join('\n');
  let config: unknown;

  try {
    config = YAML.parse(yamlStr);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { type: 'workflow_parse_error', message };
  }

  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return { type: 'workflow_front_matter_not_a_map' };
  }

  const body = lines
    .slice(endIndex + 1)
    .join('\n')
    .trim();

  return {
    // oxlint-disable-next-line no-unsafe-type-assertion
    config: config as Record<string, unknown>,
    body,
  };
};

/**
 * Load and parse a WORKFLOW.md file.
 */
export const loadWorkflow = (filePath: string): WorkflowDefinition | WorkflowLoadError => {
  const resolvedPath = resolve(filePath);

  let content: string;
  try {
    content = readFileSync(resolvedPath, 'utf-8');
  } catch {
    return { type: 'missing_workflow_file' };
  }

  const parsed = parseFrontMatter(content);

  if ('type' in parsed) {
    return parsed;
  }

  if (parsed.body.length === 0) {
    return { type: 'workflow_empty_prompt' };
  }

  return {
    config: parsed.config,
    prompt_template: parsed.body,
  };
};
