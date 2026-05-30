import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ServiceConfig } from '../model.ts';

import {
  appendProjectInput,
  createStoredProjectInput,
  defaultProjectsConfigPath,
  listProjectRecords,
  readProjectsConfigFile,
  removeProjectInputAtIndex,
  writeProjectsConfigFile,
} from './projectsFile.ts';

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'symphony-projects-file-'));
  tempDirs.push(dir);
  return dir;
};

const writeWorkflow = (projectRoot: string): void => {
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(projectRoot, 'WORKFLOW.md'), '# Task\n', 'utf-8');
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('projectsFile', () => {
  it('builds the default config path under ~/.symphony-pi', () => {
    expect(defaultProjectsConfigPath('/home/tester')).toBe(
      '/home/tester/.symphony-pi/projects.json',
    );
  });

  it('returns missing when the config file does not exist', () => {
    const root = makeTempDir();
    const configPath = join(root, 'projects.json');
    const result = readProjectsConfigFile(configPath);

    expect(result.type).toBe('missing');
  });

  it('writes and reads a config file', () => {
    const root = makeTempDir();
    const configPath = join(root, 'projects.json');
    const config: ServiceConfig = {
      projects: ['/repos/alpha'],
    };

    writeProjectsConfigFile(configPath, config);
    const result = readProjectsConfigFile(configPath);

    expect(result.type).toBe('loaded');
    if (result.type !== 'loaded') {
      throw new Error('expected loaded result');
    }
    expect(result.config).toEqual(config);
  });

  it('creates a compact string entry when id and workflow are omitted', () => {
    expect(createStoredProjectInput({ root: '/repos/alpha' })).toBe('/repos/alpha');
  });

  it('creates an object entry when optional fields are provided', () => {
    expect(
      createStoredProjectInput({
        root: '/repos/alpha',
        id: 'alpha',
        workflow: 'custom/WORKFLOW.md',
      }),
    ).toEqual({
      root: '/repos/alpha',
      id: 'alpha',
      workflow: 'custom/WORKFLOW.md',
    });
  });

  it('appends a valid project input', () => {
    const root = makeTempDir();
    const projectRoot = join(root, 'alpha');
    writeWorkflow(projectRoot);

    const nextConfig = appendProjectInput({ projects: [] }, root, projectRoot);
    expect(typeof nextConfig).not.toBe('string');
    if (typeof nextConfig === 'string') {
      throw new Error('expected config');
    }
    expect(nextConfig.projects).toEqual([projectRoot]);
  });

  it('rejects duplicate project ids when appending', () => {
    const root = makeTempDir();
    const alphaRoot = join(root, 'alpha');
    const betaRoot = join(root, 'beta');
    writeWorkflow(alphaRoot);
    writeWorkflow(betaRoot);

    const nextConfig = appendProjectInput(
      {
        projects: [
          {
            id: 'shared',
            root: alphaRoot,
          },
        ],
      },
      root,
      {
        id: 'shared',
        root: betaRoot,
      },
    );

    expect(nextConfig).toBe('Duplicate project id: shared');
  });

  it('lists project records with validation errors', () => {
    const root = makeTempDir();
    const projectRoot = join(root, 'alpha');
    writeWorkflow(projectRoot);

    const records = listProjectRecords(
      {
        projects: [projectRoot, join(root, 'missing-project')],
      },
      root,
    );

    expect(records).toHaveLength(2);
    expect(records[0]?.validationError).toBeUndefined();
    expect(records[1]?.validationError).toContain('Project root does not exist');
  });

  it('removes a project by index', () => {
    const config: ServiceConfig = {
      projects: ['/repos/alpha', '/repos/beta'],
    };

    expect(removeProjectInputAtIndex(config, 0)).toEqual({
      projects: ['/repos/beta'],
    });
  });
});
