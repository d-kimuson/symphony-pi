import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadServiceConfig } from './loadServiceConfig.ts';

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'symphony-service-config-'));
  tempDirs.push(dir);
  return dir;
};

const writeWorkflow = (projectRoot: string, body = '# Task'): string => {
  mkdirSync(projectRoot, { recursive: true });
  const workflowPath = join(projectRoot, 'WORKFLOW.md');
  writeFileSync(
    workflowPath,
    [
      '---',
      'tracker:',
      '  kind: linear',
      '  api_key: test',
      '  team_key: ENG',
      '  project_slug: demo',
      '---',
      body,
    ].join('\n'),
    'utf-8',
  );
  return workflowPath;
};

const writeConfig = (configDir: string, content: unknown): string => {
  const configPath = join(configDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(content, null, 2), 'utf-8');
  return configPath;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadServiceConfig', () => {
  it('loads minimal config', () => {
    const root = makeTempDir();
    const projectRoot = join(root, 'sample-a');
    writeWorkflow(projectRoot);
    const configPath = writeConfig(root, {
      projects: [projectRoot],
    });

    const result = loadServiceConfig(configPath);
    expect(result.type).toBe('loaded');
    if (result.type !== 'loaded') throw new Error('expected loaded');
    expect(result.config.projects[0]?.workflowPath).toBe(join(projectRoot, 'WORKFLOW.md'));
    expect(result.config.projects[0]?.id).toBe('sample-a');
  });

  it('loads object project config', () => {
    const root = makeTempDir();
    const projectRoot = join(root, 'sample-b');
    const workflowPath = writeWorkflow(projectRoot);
    const configPath = writeConfig(root, {
      max_concurrent_agents: 20,
      projects: [
        {
          id: 'Sample B',
          root: projectRoot,
          workflow: 'WORKFLOW.md',
        },
      ],
    });

    const result = loadServiceConfig(configPath);
    expect(result.type).toBe('loaded');
    if (result.type !== 'loaded') throw new Error('expected loaded');
    expect(result.config.max_concurrent_agents).toBe(20);
    expect(result.config.projects[0]?.id).toBe('sample-b');
    expect(result.config.projects[0]?.workflowPath).toBe(workflowPath);
  });

  it('expands relative paths from the config directory', () => {
    const root = makeTempDir();
    const configDir = join(root, 'configs');
    const projectRoot = join(root, 'repos', 'sample-c');
    writeWorkflow(projectRoot);
    mkdirSync(configDir, { recursive: true });
    const configPath = writeConfig(configDir, {
      projects: ['../repos/sample-c'],
    });

    const result = loadServiceConfig(configPath);
    expect(result.type).toBe('loaded');
    if (result.type !== 'loaded') throw new Error('expected loaded');
    expect(result.config.projects[0]?.root).toBe(projectRoot);
  });

  it('expands ~ in project roots', () => {
    const suffix = `symphony-home-${Date.now()}`;
    const projectRoot = join(homedir(), suffix);
    tempDirs.push(projectRoot);
    writeWorkflow(projectRoot);
    const root = makeTempDir();
    const configPath = writeConfig(root, {
      projects: [`~/${suffix}`],
    });

    const result = loadServiceConfig(configPath);
    expect(result.type).toBe('loaded');
    if (result.type !== 'loaded') throw new Error('expected loaded');
    expect(result.config.projects[0]?.root).toBe(projectRoot);
  });

  it('rejects duplicate ids', () => {
    const root = makeTempDir();
    const projectA = join(root, 'repos', 'sample-a');
    const projectB = join(root, 'repos', 'sample-b');
    writeWorkflow(projectA);
    writeWorkflow(projectB);
    const configPath = writeConfig(root, {
      projects: [
        { id: 'shared', root: projectA },
        { id: 'shared', root: projectB },
      ],
    });

    const result = loadServiceConfig(configPath);
    expect(result.type).toBe('error');
    if (result.type !== 'error') throw new Error('expected error');
    expect(result.error).toContain('Duplicate project id');
  });

  it('rejects missing workflow files', () => {
    const root = makeTempDir();
    const projectRoot = join(root, 'sample-missing');
    mkdirSync(projectRoot, { recursive: true });
    const configPath = writeConfig(root, {
      projects: [projectRoot],
    });

    const result = loadServiceConfig(configPath);
    expect(result.type).toBe('error');
    if (result.type !== 'error') throw new Error('expected error');
    expect(result.error).toContain('Workflow file does not exist');
  });

  it('resolves config metadata paths', () => {
    const root = makeTempDir();
    const projectRoot = join(root, 'sample-meta');
    writeWorkflow(projectRoot);
    const configPath = writeConfig(root, {
      projects: [projectRoot],
    });

    const result = loadServiceConfig(configPath);
    expect(result.type).toBe('loaded');
    if (result.type !== 'loaded') throw new Error('expected loaded');
    expect(result.config.configPath).toBe(configPath);
    expect(result.config.configDir).toBe(dirname(configPath));
  });
});
