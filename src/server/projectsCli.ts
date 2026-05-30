import inquirer from 'inquirer';

import type { ServiceConfig } from './serviceConfig/model.ts';

import {
  appendProjectInput,
  createStoredProjectInput,
  defaultProjectsConfigPath,
  listProjectRecords,
  readProjectsConfigFile,
  removeProjectInputAtIndex,
  writeProjectsConfigFile,
} from './serviceConfig/services/projectsFile.ts';

const formatProjectLabel = (options: {
  readonly id: string;
  readonly root: string;
  readonly workflowPath: string;
  readonly validationError?: string;
}): string => {
  const details =
    options.validationError === undefined ? '' : ` [invalid: ${options.validationError}]`;
  return `${options.id} — ${options.root} (${options.workflowPath})${details}`;
};

const emptyConfig = (): ServiceConfig => ({
  projects: [],
});

export const listProjectsCommand = (): void => {
  const result = readProjectsConfigFile();

  if (result.type === 'error') {
    throw new Error(`[symphony] Failed to read projects config: ${result.error}`);
  }

  const records =
    result.type === 'missing' ? [] : listProjectRecords(result.config, result.configDir);
  if (records.length === 0) {
    console.log(`[symphony] No projects configured in ${defaultProjectsConfigPath()}`);
    return;
  }

  console.log(`[symphony] Projects config: ${result.configPath}`);
  for (const record of records) {
    console.log(
      `- ${formatProjectLabel({
        id: record.derived.id,
        root: record.derived.root,
        workflowPath: record.derived.workflowPath,
        validationError: record.validationError,
      })}`,
    );
  }
};

export const addProjectCommand = async (): Promise<void> => {
  const result = readProjectsConfigFile();
  if (result.type === 'error') {
    throw new Error(`[symphony] Failed to read projects config: ${result.error}`);
  }

  const config = result.type === 'loaded' ? result.config : emptyConfig();
  const configPath = result.configPath;
  const configDir = result.configDir;

  const answers = await inquirer.prompt<{
    readonly root: string;
    readonly id: string;
  }>([
    {
      type: 'input',
      name: 'root',
      message: 'Project root path:',
      validate: (value) => (value.trim().length > 0 ? true : 'Project root path is required.'),
    },
    {
      type: 'input',
      name: 'id',
      message: 'Project id (optional):',
    },
  ]);

  const projectInput = createStoredProjectInput({
    root: answers.root.trim(),
    id: answers.id.trim().length === 0 ? undefined : answers.id.trim(),
  });

  const nextConfig = appendProjectInput(config, configDir, projectInput);
  if (typeof nextConfig === 'string') {
    throw new Error(`[symphony] Failed to add project: ${nextConfig}`);
  }

  writeProjectsConfigFile(configPath, nextConfig);
  console.log(`[symphony] Added project to ${configPath}`);
};

export const deleteProjectCommand = async (): Promise<void> => {
  const result = readProjectsConfigFile();
  if (result.type === 'error') {
    throw new Error(`[symphony] Failed to read projects config: ${result.error}`);
  }

  if (result.type === 'missing') {
    console.log(`[symphony] No projects configured in ${result.configPath}`);
    return;
  }

  const records = listProjectRecords(result.config, result.configDir);
  if (records.length === 0) {
    console.log(`[symphony] No projects configured in ${result.configPath}`);
    return;
  }

  const { index } = await inquirer.prompt<{ readonly index: number }>([
    {
      type: 'rawlist',
      name: 'index',
      message: 'Select a project to delete:',
      choices: records.map((record) => ({
        name: formatProjectLabel({
          id: record.derived.id,
          root: record.derived.root,
          workflowPath: record.derived.workflowPath,
          validationError: record.validationError,
        }),
        value: record.index,
      })),
    },
  ]);

  const { confirmed } = await inquirer.prompt<{ readonly confirmed: boolean }>([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Delete the selected project?',
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log('[symphony] Deletion canceled.');
    return;
  }

  const nextConfig = removeProjectInputAtIndex(result.config, index);
  writeProjectsConfigFile(result.configPath, nextConfig);
  console.log(`[symphony] Deleted project from ${result.configPath}`);
};
