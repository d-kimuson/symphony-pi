import { describe, expect, it } from 'vitest';

import type { Issue } from '../../issues/model.ts';

import { renderPrompt, buildContinuationPrompt } from './buildPrompt.ts';

const sampleIssue: Issue = {
  id: '123',
  identifier: 'TEST-1',
  title: 'Fix login bug',
  description: 'Users cannot log in',
  priority: 1,
  state: 'In Progress',
  branch_name: null,
  url: 'https://linear.app/issue/TEST-1',
  labels: ['bug', 'frontend'],
  blocked_by: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: null,
};

describe('renderPrompt (liquidjs)', () => {
  it('renders plain text template unchanged', () => {
    const template = '# Hello World\n\nThis is a test.';
    const result = renderPrompt(template, { issue: sampleIssue, attempt: null });
    if (result.type !== 'rendered') throw new Error('expected rendered');
    expect(result.content).toBe(template);
  });

  it('renders issue variables', () => {
    const template = 'Issue: {{ issue.identifier }} - {{ issue.title }}';
    const result = renderPrompt(template, { issue: sampleIssue, attempt: null });
    if (result.type !== 'rendered') throw new Error('expected rendered');
    expect(result.content).toBe('Issue: TEST-1 - Fix login bug');
  });

  it('renders attempt variable', () => {
    const template = 'Attempt: {{ attempt }}';
    const result = renderPrompt(template, { issue: sampleIssue, attempt: 2 });
    if (result.type !== 'rendered') throw new Error('expected rendered');
    expect(result.content).toBe('Attempt: 2');
  });

  it('renders null attempt as empty', () => {
    const template = 'Attempt: {{ attempt }}';
    const result = renderPrompt(template, { issue: sampleIssue, attempt: null });
    if (result.type !== 'rendered') throw new Error('expected rendered');
    expect(result.content).toBe('Attempt: ');
  });

  it('iterates over labels with for loop', () => {
    const template =
      'Labels: {% for label in issue.labels %}{{ label }}{% unless forloop.last %}, {% endunless %}{% endfor %}';
    const result = renderPrompt(template, { issue: sampleIssue, attempt: null });
    if (result.type !== 'rendered') throw new Error('expected rendered');
    expect(result.content).toBe('Labels: bug, frontend');
  });

  it('fails on unknown variable', () => {
    const template = '{{ unknown_var }}';
    const result = renderPrompt(template, { issue: sampleIssue, attempt: null });
    if (result.type === 'rendered') throw new Error('expected error');
    expect(result.type).toBe('template_render_error');
  });

  it('fails on nested unknown variable', () => {
    const template = '{{ issue.unknown_field }}';
    const result = renderPrompt(template, { issue: sampleIssue, attempt: null });
    if (result.type === 'rendered') throw new Error('expected error');
    expect(result.type).toBe('template_render_error');
  });

  it('renders labels join', () => {
    const template = 'Labels: {{ issue.labels | join: ", " }}';
    const result = renderPrompt(template, { issue: sampleIssue, attempt: null });
    if (result.type !== 'rendered') throw new Error('expected rendered');
    expect(result.content).toBe('Labels: bug, frontend');
  });

  it('renders multiple variables in one template', () => {
    const template = [
      '# Issue {{ issue.identifier }}',
      '',
      '**Title:** {{ issue.title }}',
      '**Priority:** {{ issue.priority }}',
      '**State:** {{ issue.state }}',
      '',
      '{{ issue.description }}',
    ].join('\n');
    const result = renderPrompt(template, { issue: sampleIssue, attempt: null });
    if (result.type !== 'rendered') throw new Error('expected rendered');
    expect(result.content).toContain('# Issue TEST-1');
    expect(result.content).toContain('**Title:** Fix login bug');
    expect(result.content).toContain('**State:** In Progress');
  });

  it('handles empty description correctly', () => {
    const template = 'Desc: {{ issue.description }}';
    const result = renderPrompt(template, {
      issue: { ...sampleIssue, description: null },
      attempt: null,
    });
    if (result.type !== 'rendered') throw new Error('expected rendered');
    // liquidjs outputs empty string for null
    expect(result.content).toBe('Desc: ');
  });

  it('supports if conditionals', () => {
    const template =
      '{% if issue.description %}{{ issue.description }}{% else %}No description{% endif %}';
    const result = renderPrompt(template, { issue: sampleIssue, attempt: null });
    if (result.type !== 'rendered') throw new Error('expected rendered');
    expect(result.content).toBe('Users cannot log in');
  });

  it('supports if else for null description', () => {
    const template =
      '{% if issue.description %}{{ issue.description }}{% else %}No description{% endif %}';
    const result = renderPrompt(template, {
      issue: { ...sampleIssue, description: null },
      attempt: null,
    });
    if (result.type !== 'rendered') throw new Error('expected rendered');
    expect(result.content).toBe('No description');
  });
});

describe('buildContinuationPrompt', () => {
  it('generates continuation prompt with turn number', () => {
    const prompt = buildContinuationPrompt(2, sampleIssue);
    expect(prompt).toContain('## Continuation Turn 2');
    expect(prompt).toContain('TEST-1');
    expect(prompt).toContain('Fix login bug');
    expect(prompt).toContain('Current issue state: In Progress');
  });

  it('includes the original task prompt reference', () => {
    const prompt = buildContinuationPrompt(3, sampleIssue);
    expect(prompt).toContain('already in the conversation history');
  });
});
