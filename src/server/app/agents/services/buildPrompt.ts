/** Pure prompt rendering and agent option construction helpers. */

import type { Issue } from '../../issues/model.js';
import type { PromptTemplateInput, RenderResult } from '../../workflow/model.js';

/**
 * Render a Liquid-compatible template with strict variable checking.
 * Supports {{ variable }} and {{ variable | filter }} syntax.
 *
 * Supported filters:
 * - prepend: prepends a string
 * - append: appends a string
 * - default: provides a fallback value
 * - upcase: uppercase
 * - downcase: lowercase
 */
export const renderPrompt = (template: string, input: PromptTemplateInput): RenderResult => {
  const variables: Record<string, unknown> = {
    issue: input.issue,
    attempt: input.attempt,
  };

  try {
    const content = renderTemplate(template, variables);
    return { type: 'rendered', content };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('unknown variable') || message.includes('undefined variable')) {
      return { type: 'template_render_error', message };
    }
    if (message.includes('unknown filter')) {
      return { type: 'template_render_error', message };
    }
    return { type: 'template_render_error', message };
  }
};

/**
 * Generate a continuation prompt for subsequent turns.
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

// --- Template engine internals ---

type TemplateVariable = {
  type: 'variable';
  path: string[];
  filters: TemplateFilter[];
};

type TemplateFilter = {
  name: string;
  args: string[];
};

type TemplateNode =
  | { type: 'text'; value: string }
  | { type: 'expression'; variable: TemplateVariable };

/**
 * Simple strict template renderer.
 */
const renderTemplate = (template: string, variables: Record<string, unknown>): string => {
  const nodes = parseTemplate(template);
  return nodes.map((node) => renderNode(node, variables)).join('');
};

const renderNode = (node: TemplateNode, variables: Record<string, unknown>): string => {
  if (node.type === 'text') return node.value;

  const { path, filters } = node.variable;
  let value: unknown = variables;

  // Walk the path
  for (const segment of path) {
    if (value === null || value === undefined) {
      throw new Error(`undefined variable: ${path.join('.')}`);
    }
    if (typeof value !== 'object') {
      throw new Error(`undefined variable: ${path.join('.')}`);
    }
    // oxlint-disable-next-line no-unsafe-type-assertion
    value = (value as Record<string, unknown>)[segment];
  }

  // After path walking, check if value was found
  if (value === undefined) {
    throw new Error(`undefined variable: ${path.join('.')}`);
  }

  // Apply filters
  for (const filter of filters) {
    value = applyFilter(filter.name, value, filter.args);
  }

  if (value === null || value === undefined) {
    return '';
  }

  // oxlint-disable-next-line no-base-to-string
  return String(value);
};

const parseTemplate = (template: string): TemplateNode[] => {
  const nodes: TemplateNode[] = [];
  let remaining = template;

  for (;;) {
    const startIdx = remaining.indexOf('{{');
    if (startIdx === -1) {
      if (remaining.length > 0) {
        nodes.push({ type: 'text', value: remaining });
      }
      break;
    }

    // Text before expression
    if (startIdx > 0) {
      nodes.push({ type: 'text', value: remaining.slice(0, startIdx) });
    }

    const endIdx = remaining.indexOf('}}', startIdx + 2);
    if (endIdx === -1) {
      // No closing }}, treat rest as text
      nodes.push({ type: 'text', value: remaining.slice(startIdx) });
      break;
    }

    const expr = remaining.slice(startIdx + 2, endIdx).trim();
    const variable = parseExpression(expr);
    nodes.push({ type: 'expression', variable });

    remaining = remaining.slice(endIdx + 2);
  }

  return nodes;
};

const parseExpression = (expr: string): TemplateVariable => {
  const parts = expr.split('|').map((p) => p.trim());

  const varPart = parts[0];
  if (varPart === undefined) {
    throw new Error('empty expression');
  }

  const path = varPart
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const filters: TemplateFilter[] = [];
  for (let i = 1; i < parts.length; i++) {
    const filterPart = parts[i];
    if (filterPart === undefined) continue;

    const filterMatch = /^(\w+)(?::(.+))?$/.exec(filterPart);
    if (filterMatch === null) {
      throw new Error(`unknown filter: ${filterPart}`);
    }

    const filterName = filterMatch[1];
    if (filterName === undefined) continue;

    const rawFilterArgs = filterMatch[2];
    const filterArgs =
      rawFilterArgs !== undefined && rawFilterArgs !== null
        ? rawFilterArgs.split(',').map((a) => a.trim().replace(/^["']|["']$/g, ''))
        : [];
    filters.push({ name: filterName, args: filterArgs });
  }

  return { type: 'variable', path, filters };
};

const applyFilter = (name: string, value: unknown, args: string[]): unknown => {
  switch (name) {
    case 'upcase':
      return typeof value === 'string' ? value.toUpperCase() : value;
    case 'downcase':
      return typeof value === 'string' ? value.toLowerCase() : value;
    case 'prepend': {
      const prefix = args[0] ?? '';
      return typeof value === 'string' ? prefix + value : value;
    }
    case 'append': {
      const suffix = args[0] ?? '';
      return typeof value === 'string' ? value + suffix : value;
    }
    case 'default': {
      const fallback = args[0] ?? '';
      return value === null || value === undefined || value === '' ? fallback : value;
    }
    default:
      throw new Error(`unknown filter: ${name}`);
  }
};
