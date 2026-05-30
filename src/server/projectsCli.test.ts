import inquirer from 'inquirer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addProjectCommand, deleteProjectCommand, listProjectsCommand } from './projectsCli.ts';
import {
  appendProjectInput,
  createStoredProjectInput,
  defaultProjectsConfigPath,
  listProjectRecords,
  readProjectsConfigFile,
  removeProjectInputAtIndex,
  writeProjectsConfigFile,
} from './serviceConfig/services/projectsFile.ts';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock('./serviceConfig/services/projectsFile.ts', () => ({
  appendProjectInput: vi.fn(),
  createStoredProjectInput: vi.fn(),
  defaultProjectsConfigPath: vi.fn(() => '/home/tester/.symphony-pi/projects.json'),
  listProjectRecords: vi.fn(),
  readProjectsConfigFile: vi.fn(),
  removeProjectInputAtIndex: vi.fn(),
  writeProjectsConfigFile: vi.fn(),
}));

describe('projectsCli', () => {
  const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    vi.resetAllMocks();
    consoleLog.mockImplementation(() => {});
    vi.mocked(defaultProjectsConfigPath).mockReturnValue('/home/tester/.symphony-pi/projects.json');
  });

  it('lists no projects when config is missing', () => {
    vi.mocked(readProjectsConfigFile).mockReturnValue({
      type: 'missing',
      configPath: '/home/tester/.symphony-pi/projects.json',
      configDir: '/home/tester/.symphony-pi',
    });

    listProjectsCommand();

    expect(consoleLog).toHaveBeenCalledWith(
      '[symphony] No projects configured in /home/tester/.symphony-pi/projects.json',
    );
  });

  it('throws when listing projects fails', () => {
    vi.mocked(readProjectsConfigFile).mockReturnValue({
      type: 'error',
      error: 'boom',
      configPath: '/tmp/projects.json',
      configDir: '/tmp',
    });

    expect(() => listProjectsCommand()).toThrow('[symphony] Failed to read projects config: boom');
  });

  it('lists configured projects', () => {
    vi.mocked(readProjectsConfigFile).mockReturnValue({
      type: 'loaded',
      config: { projects: ['/repo/a'] },
      configPath: '/tmp/projects.json',
      configDir: '/tmp',
    });
    vi.mocked(listProjectRecords).mockReturnValue([
      {
        index: 0,
        input: '/repo/a',
        derived: {
          id: 'repo-a',
          root: '/repo/a',
          workflowPath: '/repo/a/WORKFLOW.md',
        },
      },
    ]);

    listProjectsCommand();

    expect(consoleLog).toHaveBeenNthCalledWith(1, '[symphony] Projects config: /tmp/projects.json');
    expect(consoleLog).toHaveBeenNthCalledWith(2, '- repo-a — /repo/a (/repo/a/WORKFLOW.md)');
  });

  it('adds a project to a missing config file', async () => {
    vi.mocked(readProjectsConfigFile).mockReturnValue({
      type: 'missing',
      configPath: '/tmp/projects.json',
      configDir: '/tmp',
    });
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ root: '/repo/a', id: '' });
    vi.mocked(createStoredProjectInput).mockReturnValue('/repo/a');
    vi.mocked(appendProjectInput).mockReturnValue({ projects: ['/repo/a'] });

    await addProjectCommand();

    expect(createStoredProjectInput).toHaveBeenCalledWith({
      root: '/repo/a',
      id: undefined,
    });
    expect(appendProjectInput).toHaveBeenCalledWith({ projects: [] }, '/tmp', '/repo/a');
    expect(writeProjectsConfigFile).toHaveBeenCalledWith('/tmp/projects.json', {
      projects: ['/repo/a'],
    });
  });

  it('throws when add validation fails', async () => {
    vi.mocked(readProjectsConfigFile).mockReturnValue({
      type: 'loaded',
      config: { projects: [] },
      configPath: '/tmp/projects.json',
      configDir: '/tmp',
    });
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ root: '/repo/a', id: '' });
    vi.mocked(createStoredProjectInput).mockReturnValue('/repo/a');
    vi.mocked(appendProjectInput).mockReturnValue('Duplicate project id: repo-a');

    await expect(addProjectCommand()).rejects.toThrow(
      '[symphony] Failed to add project: Duplicate project id: repo-a',
    );
  });

  it('returns early when deleting from a missing config file', async () => {
    vi.mocked(readProjectsConfigFile).mockReturnValue({
      type: 'missing',
      configPath: '/tmp/projects.json',
      configDir: '/tmp',
    });

    await deleteProjectCommand();

    expect(consoleLog).toHaveBeenCalledWith(
      '[symphony] No projects configured in /tmp/projects.json',
    );
  });

  it('cancels delete when user does not confirm', async () => {
    vi.mocked(readProjectsConfigFile).mockReturnValue({
      type: 'loaded',
      config: { projects: ['/repo/a'] },
      configPath: '/tmp/projects.json',
      configDir: '/tmp',
    });
    vi.mocked(listProjectRecords).mockReturnValue([
      {
        index: 0,
        input: '/repo/a',
        derived: {
          id: 'repo-a',
          root: '/repo/a',
          workflowPath: '/repo/a/WORKFLOW.md',
        },
      },
    ]);
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ index: 0 })
      .mockResolvedValueOnce({ confirmed: false });

    await deleteProjectCommand();

    expect(writeProjectsConfigFile).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith('[symphony] Deletion canceled.');
  });

  it('deletes the selected project after confirmation', async () => {
    vi.mocked(readProjectsConfigFile).mockReturnValue({
      type: 'loaded',
      config: { projects: ['/repo/a'] },
      configPath: '/tmp/projects.json',
      configDir: '/tmp',
    });
    vi.mocked(listProjectRecords).mockReturnValue([
      {
        index: 0,
        input: '/repo/a',
        derived: {
          id: 'repo-a',
          root: '/repo/a',
          workflowPath: '/repo/a/WORKFLOW.md',
        },
      },
    ]);
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ index: 0 })
      .mockResolvedValueOnce({ confirmed: true });
    vi.mocked(removeProjectInputAtIndex).mockReturnValue({ projects: [] });

    await deleteProjectCommand();

    expect(removeProjectInputAtIndex).toHaveBeenCalledWith({ projects: ['/repo/a'] }, 0);
    expect(writeProjectsConfigFile).toHaveBeenCalledWith('/tmp/projects.json', { projects: [] });
  });

  it('uses the default config path helper when listing missing projects', () => {
    vi.mocked(defaultProjectsConfigPath).mockReturnValue('/home/custom/.symphony-pi/projects.json');
    vi.mocked(readProjectsConfigFile).mockReturnValue({
      type: 'missing',
      configPath: '/home/custom/.symphony-pi/projects.json',
      configDir: '/home/custom/.symphony-pi',
    });

    listProjectsCommand();

    expect(defaultProjectsConfigPath).toHaveBeenCalled();
  });
});
