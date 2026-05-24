import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as v from 'valibot';

import type { ResolvedServiceConfig, ServiceConfig } from '../model.ts';

import { serviceConfigSchema } from '../schema.ts';
import { resolveProjectConfig } from '../services/projectConfig.ts';

export type ServiceConfigLoadResult =
  | { readonly type: 'loaded'; readonly config: ResolvedServiceConfig }
  | { readonly type: 'error'; readonly error: string };

const validateProjectPaths = (
  projects: readonly { id: string; root: string; workflowPath: string }[],
): string | null => {
  for (const project of projects) {
    try {
      const rootStats = statSync(project.root);
      if (!rootStats.isDirectory()) {
        return `Project root is not a directory: ${project.root}`;
      }
    } catch {
      return `Project root does not exist: ${project.root}`;
    }

    try {
      const workflowStats = statSync(project.workflowPath);
      if (!workflowStats.isFile()) {
        return `Workflow file is not a file: ${project.workflowPath}`;
      }
    } catch {
      return `Workflow file does not exist: ${project.workflowPath}`;
    }
  }

  return null;
};

export const loadServiceConfig = (configPath: string): ServiceConfigLoadResult => {
  const resolvedConfigPath = resolve(configPath);
  const configDir = dirname(resolvedConfigPath);

  let rawContent: string;
  try {
    rawContent = readFileSync(resolvedConfigPath, 'utf-8');
  } catch {
    return {
      type: 'error',
      error: `Config file does not exist: ${resolvedConfigPath}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      type: 'error',
      error: `Invalid JSON config: ${message}`,
    };
  }

  const validation = v.safeParse(serviceConfigSchema, parsed);
  if (!validation.success) {
    const messages = validation.issues.map((issue) => {
      const path = v.getDotPath(issue);
      return path === null ? issue.message : `${path}: ${issue.message}`;
    });

    return {
      type: 'error',
      error: `Invalid service config: ${messages.join('; ')}`,
    };
  }

  const config: ServiceConfig = validation.output;
  const resolvedProjects = [] as Array<{ id: string; root: string; workflowPath: string }>;
  const projectIds = new Set<string>();

  for (const projectInput of config.projects) {
    const resolvedProject = resolveProjectConfig(projectInput, configDir);
    if (typeof resolvedProject === 'string') {
      return {
        type: 'error',
        error: resolvedProject,
      };
    }

    if (projectIds.has(resolvedProject.id)) {
      return {
        type: 'error',
        error: `Duplicate project id: ${resolvedProject.id}`,
      };
    }

    projectIds.add(resolvedProject.id);
    resolvedProjects.push(resolvedProject);
  }

  const pathError = validateProjectPaths(resolvedProjects);
  if (pathError !== null) {
    return {
      type: 'error',
      error: pathError,
    };
  }

  return {
    type: 'loaded',
    config: {
      configPath: resolvedConfigPath,
      configDir,
      max_concurrent_agents: config.max_concurrent_agents,
      projects: resolvedProjects,
    },
  };
};
