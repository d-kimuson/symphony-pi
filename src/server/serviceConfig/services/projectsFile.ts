import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import * as v from 'valibot';

import type { ProjectConfigInput, ResolvedProjectConfig, ServiceConfig } from '../model.ts';

import { projectsConfigFileSchema } from '../schema.ts';
import { deriveProjectConfig, resolveProjectConfig } from './projectConfig.ts';

export type ProjectsConfigFileResult =
  | {
      readonly type: 'loaded';
      readonly config: ServiceConfig;
      readonly configPath: string;
      readonly configDir: string;
    }
  | {
      readonly type: 'missing';
      readonly configPath: string;
      readonly configDir: string;
    }
  | {
      readonly type: 'error';
      readonly error: string;
      readonly configPath: string;
      readonly configDir: string;
    };

export type ProjectRecord = {
  readonly index: number;
  readonly input: ProjectConfigInput;
  readonly derived: ResolvedProjectConfig;
  readonly validationError?: string;
};

export const defaultProjectsConfigPath = (homeDirectory: string = homedir()): string => {
  return resolve(homeDirectory, '.symphony-pi/projects.json');
};

const readProjectsConfigJson = (rawContent: string): ServiceConfig | string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return `Invalid JSON config: ${message}`;
  }

  const validation = v.safeParse(projectsConfigFileSchema, parsed);
  if (!validation.success) {
    const messages = validation.issues.map((issue) => {
      const path = v.getDotPath(issue);
      return path === null ? issue.message : `${path}: ${issue.message}`;
    });
    return `Invalid service config: ${messages.join('; ')}`;
  }

  return validation.output;
};

export const readProjectsConfigFile = (
  configPath: string = defaultProjectsConfigPath(),
): ProjectsConfigFileResult => {
  const resolvedConfigPath = resolve(configPath);
  const configDir = dirname(resolvedConfigPath);

  let rawContent: string;
  try {
    rawContent = readFileSync(resolvedConfigPath, 'utf-8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {
        type: 'missing',
        configPath: resolvedConfigPath,
        configDir,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      type: 'error',
      error: `Failed to read config file: ${message}`,
      configPath: resolvedConfigPath,
      configDir,
    };
  }

  const config = readProjectsConfigJson(rawContent);
  if (typeof config === 'string') {
    return {
      type: 'error',
      error: config,
      configPath: resolvedConfigPath,
      configDir,
    };
  }

  return {
    type: 'loaded',
    config,
    configPath: resolvedConfigPath,
    configDir,
  };
};

export const writeProjectsConfigFile = (configPath: string, config: ServiceConfig): void => {
  const resolvedConfigPath = resolve(configPath);
  mkdirSync(dirname(resolvedConfigPath), { recursive: true });
  writeFileSync(resolvedConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
};

export const listProjectRecords = (
  config: ServiceConfig,
  configDir: string,
): readonly ProjectRecord[] => {
  return config.projects.map((input, index) => {
    const derived = deriveProjectConfig(input, configDir);
    const validationResult = resolveProjectConfig(input, configDir);

    return {
      index,
      input,
      derived,
      validationError: typeof validationResult === 'string' ? validationResult : undefined,
    };
  });
};

export const createStoredProjectInput = (options: {
  readonly root: string;
  readonly id?: string;
  readonly workflow?: string;
}): ProjectConfigInput => {
  const id = options.id?.trim();
  const workflow = options.workflow?.trim();

  if (id === undefined && workflow === undefined) {
    return options.root;
  }

  return {
    root: options.root,
    ...(id === undefined ? {} : { id }),
    ...(workflow === undefined ? {} : { workflow }),
  };
};

export const appendProjectInput = (
  config: ServiceConfig,
  configDir: string,
  input: ProjectConfigInput,
): ServiceConfig | string => {
  const candidate = resolveProjectConfig(input, configDir);
  if (typeof candidate === 'string') {
    return candidate;
  }

  const records = listProjectRecords(config, configDir);
  if (records.some((record) => record.derived.id === candidate.id)) {
    return `Duplicate project id: ${candidate.id}`;
  }

  return {
    ...config,
    projects: [...config.projects, input],
  };
};

export const removeProjectInputAtIndex = (config: ServiceConfig, index: number): ServiceConfig => {
  return {
    ...config,
    projects: config.projects.filter((_, currentIndex) => currentIndex !== index),
  };
};
