import { describe, expect, it } from 'vitest';

import { parseFrontMatter } from './loadWorkflow.ts';

describe('parseFrontMatter', () => {
  it('parses YAML front matter and body', () => {
    const content = [
      '---',
      'tracker:',
      '  kind: linear',
      '---',
      '# Task',
      '',
      'Please implement this.',
    ].join('\n');

    const result = parseFrontMatter(content);
    if ('type' in result) throw new Error(`Unexpected error: ${result.type}`);
    expect(result.config).toEqual({ tracker: { kind: 'linear' } });
    expect(result.body).toBe('# Task\n\nPlease implement this.');
  });

  it('returns workflow_missing_front_matter when no --- prefix', () => {
    const content = ['tracker:', '  kind: linear', '# Task'].join('\n');

    const result = parseFrontMatter(content);
    if (!('type' in result)) throw new Error('Expected error');
    expect(result.type).toBe('workflow_missing_front_matter');
  });

  it('returns workflow_missing_front_matter when no closing ---', () => {
    const content = ['---', 'tracker:', '  kind: linear', '# Task'].join('\n');

    const result = parseFrontMatter(content);
    if (!('type' in result)) throw new Error('Expected error');
    expect(result.type).toBe('workflow_missing_front_matter');
  });

  it('returns workflow_parse_error on invalid YAML', () => {
    const content = ['---', 'invalid: [yaml: broken', '---', 'body'].join('\n');

    const result = parseFrontMatter(content);
    if (!('type' in result)) throw new Error('Expected error');
    expect(result.type).toBe('workflow_parse_error');
  });

  it('returns workflow_front_matter_not_a_map for non-map YAML', () => {
    const content = ['---', '- item1', '- item2', '---', 'body'].join('\n');

    const result = parseFrontMatter(content);
    if (!('type' in result)) throw new Error('Expected error');
    expect(result.type).toBe('workflow_front_matter_not_a_map');
  });

  it('returns workflow_front_matter_not_a_map for null YAML', () => {
    const content = ['---', 'null', '---', 'body'].join('\n');

    const result = parseFrontMatter(content);
    if (!('type' in result)) throw new Error('Expected error');
    expect(result.type).toBe('workflow_front_matter_not_a_map');
  });

  it('trims body whitespace', () => {
    const content = ['---', 'tracker:', '  kind: linear', '---', '', '  body text  ', ''].join(
      '\n',
    );

    const result = parseFrontMatter(content);
    if ('type' in result) throw new Error(`Unexpected error: ${result.type}`);
    expect(result.body).toBe('body text');
  });
});
