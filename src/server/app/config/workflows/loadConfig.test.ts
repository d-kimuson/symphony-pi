import { randomBytes } from 'node:crypto';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../workflows/loadConfig.ts';

describe('loadConfig', () => {
  const makeWorkflowFile = (content: string): string => {
    const dir = join(tmpdir(), `symphony-test-cfg-${randomBytes(8).toString('hex')}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'WORKFLOW.md');
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  };

  it('returns error for nonexistent workflow', () => {
    const result = loadConfig('/nonexistent/workflow.md');
    expect(result.type).toBe('error');
    if (result.type === 'loaded') throw new Error('expected error');
    expect(result.error).toContain('Workflow error');
  });

  it('returns error for empty prompt', () => {
    const content = [
      '---',
      'tracker:',
      '  kind: linear',
      '  team_key: ENG',
      '  project_slug: test',
      '---',
      '',
    ].join('\n');
    const filePath = makeWorkflowFile(content);
    const result = loadConfig(filePath);
    if (result.type === 'loaded') throw new Error('expected error');
    expect(result.type).toBe('error');
  });

  it('loads valid config', () => {
    const content = [
      '---',
      'tracker:',
      '  kind: linear',
      '  api_key: test_key',
      '  team_key: ENG',
      '  project_slug: my-project',
      '---',
      '# Task',
    ].join('\n');
    const filePath = makeWorkflowFile(content);

    try {
      const result = loadConfig(filePath);
      expect(result.type).toBe('loaded');
      if (result.type !== 'loaded') throw new Error('expected loaded');
      expect(result.config.tracker.kind).toBe('linear');
      if (result.config.tracker.kind !== 'linear') throw new Error('expected linear');
      expect(result.config.tracker.team_key).toBe('ENG');
      expect(result.config.workflow).toEqual({
        path: filePath,
        dir: dirname(filePath),
      });
    } finally {
      try {
        unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }
  });

  it('returns error for invalid config (missing team_key)', () => {
    const content = [
      '---',
      'tracker:',
      '  kind: linear',
      '  api_key: test_key',
      '  project_slug: my-project',
      '---',
      '# Task',
    ].join('\n');
    const filePath = makeWorkflowFile(content);

    try {
      const result = loadConfig(filePath);
      if (result.type === 'loaded') throw new Error('expected error');
      expect(result.error).toContain('Config validation');
      expect(result.error).toContain('tracker.team_key');
    } finally {
      try {
        unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }
  });
});
