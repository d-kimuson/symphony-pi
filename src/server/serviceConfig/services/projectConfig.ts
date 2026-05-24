import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import type { ProjectConfigInput, ResolvedProjectConfig } from '../model.ts';

import { resolvePath } from '../../app/workflow/services/resolveWorkflowConfig.ts';

const normalizeProjectId = (value: string): string => {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '');

  return sanitized.length > 0 ? sanitized : 'project';
};

const resolveProjectRoot = (input: ProjectConfigInput, configDir: string): string => {
  if (typeof input === 'string') {
    return resolvePath(input, configDir);
  }

  return resolvePath(input.root, configDir);
};

const resolveWorkflowPath = (input: ProjectConfigInput, projectRoot: string): string => {
  if (typeof input === 'string') {
    return resolve(projectRoot, 'WORKFLOW.md');
  }

  const workflow = input.workflow ?? 'WORKFLOW.md';
  return resolvePath(workflow, projectRoot);
};

const resolveProjectId = (input: ProjectConfigInput, projectRoot: string): string => {
  if (typeof input === 'string') {
    return normalizeProjectId(basename(projectRoot));
  }

  if (input.id !== undefined) {
    return normalizeProjectId(input.id);
  }

  return normalizeProjectId(basename(projectRoot));
};

export const resolveProjectConfig = (
  input: ProjectConfigInput,
  configDir: string,
): ResolvedProjectConfig | string => {
  const root = resolveProjectRoot(input, configDir);
  const workflowPath = resolveWorkflowPath(input, root);
  const id = resolveProjectId(input, root);

  if (!existsSync(root)) {
    return `Project root does not exist: ${root}`;
  }

  if (!existsSync(workflowPath)) {
    return `Workflow file does not exist: ${workflowPath}`;
  }

  return {
    id,
    root,
    workflowPath,
  };
};

export const inferProjectRootFromWorkflow = (workflowPath: string): string => {
  return dirname(resolve(workflowPath));
};

export const sanitizeProjectId = (value: string): string => {
  return normalizeProjectId(value);
};

export const buildDefaultWorkflowPath = (projectRoot: string): string => {
  return join(projectRoot, 'WORKFLOW.md');
};
