import { randomBytes } from 'node:crypto';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWorkflow } from '../workflows/loadWorkflow.ts';

describe('loadWorkflow (integration)', () => {
  const makeWorkflowFile = (content: string): string => {
    const dir = join(tmpdir(), `symphony-test-wf-${randomBytes(8).toString('hex')}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'WORKFLOW.test.md');
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  };

  it('returns missing_workflow_file for nonexistent path', () => {
    const result = loadWorkflow('/tmp/nonexistent/workflow.md');
    if (!('type' in result)) throw new Error('expected error');
    expect(result.type).toBe('missing_workflow_file');
  });

  it('returns workflow_empty_prompt for empty body', () => {
    const content = '---\ntracker:\n  kind: linear\n---\n';
    const filePath = makeWorkflowFile(content);
    const result = loadWorkflow(filePath);
    if (!('type' in result)) throw new Error('expected error');
    expect(result.type).toBe('workflow_empty_prompt');
  });

  it('loads valid workflow with prompt', () => {
    const content = [
      '---',
      'tracker:',
      '  kind: linear',
      '  project_slug: test',
      '---',
      '# Task',
      '',
      'Please implement this.',
    ].join('\n');
    const filePath = makeWorkflowFile(content);

    // Clean up after test
    try {
      const result = loadWorkflow(filePath);
      if ('type' in result) throw new Error(`Unexpected error: ${result.type}`);
      expect(result.config).toBeDefined();
      expect(result.prompt_template).toBe('# Task\n\nPlease implement this.');
    } finally {
      try {
        unlinkSync(filePath);
      } catch {
        // ignore
      }
    }
  });
});
