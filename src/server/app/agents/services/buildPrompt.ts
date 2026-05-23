/**
 * Pure prompt rendering and agent option construction helpers.
 *
 * Uses liquidjs for Liquid-compatible template rendering (SPEC 12.2).
 * Strict mode: unknown variables/filters throw errors.
 */

import { Liquid } from 'liquidjs';

import type { Issue } from '../../issues/model.js';
import type { PromptTemplateInput, RenderResult } from '../../workflow/model.js';

// Singleton engine instance — cached for performance
let _engine: Liquid | null = null;

const getEngine = (): Liquid => {
  _engine ??= new Liquid({
    strictVariables: true,
    strictFilters: true,
  });
  return _engine;
};

/**
 * Render a Liquid template with strict variable checking.
 *
 * Template variables:
 *   - issue: all normalized Issue fields (including labels, blockers)
 *   - attempt: integer or null (retry/continuation metadata)
 *
 * Supports Liquid syntax including:
 *   - {{ variable }}
 *   - {{ variable | filter }}
 *   - {% if condition %} ... {% endif %}
 *   - {% for item in array %} ... {% endfor %}
 */
export const renderPrompt = (template: string, input: PromptTemplateInput): RenderResult => {
  const engine = getEngine();

  // Convert Issue to plain object for Liquid access
  const issueObj: Record<string, unknown> = {
    id: input.issue.id,
    identifier: input.issue.identifier,
    title: input.issue.title,
    description: input.issue.description,
    priority: input.issue.priority,
    state: input.issue.state,
    branch_name: input.issue.branch_name,
    url: input.issue.url,
    labels: input.issue.labels,
    blocked_by: input.issue.blocked_by,
    created_at: input.issue.created_at,
    updated_at: input.issue.updated_at,
  };

  try {
    const raw: unknown = engine.parseAndRenderSync(template, {
      issue: issueObj,
      attempt: input.attempt,
    });
    // liquidjs returns string for sync templates
    const content = typeof raw === 'string' ? raw : '';
    return { type: 'rendered', content };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { type: 'template_render_error', message: `Template render error: ${message}` };
  }
};

/**
 * Generate a continuation prompt for subsequent turns (SPEC 10.1).
 *
 * Continuation prompts reuse the same pi session and send continuation guidance
 * rather than the original full issue prompt.
 */
export const buildContinuationPrompt = (turnNumber: number, issue: Issue): string =>
  [
    `## Continuation Turn ${turnNumber}`,
    '',
    `You are continuing work on issue ${issue.identifier}: **${issue.title}**.`,
    'The original task prompt is already in the conversation history.',
    'Please continue from where you left off.',
    `Current issue state: ${issue.state}`,
  ].join('\n');
