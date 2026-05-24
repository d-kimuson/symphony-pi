import type { EffectiveConfig } from '../config/model.ts';
import type { OrchestratorState } from '../orchestrator/model.ts';

export type RuntimeMode = 'single-project' | 'multi-project';

export type ProjectRuntime = {
  readonly projectId: string;
  readonly projectRoot: string;
  readonly workflowPath: string;
  readonly getConfig: () => EffectiveConfig;
  readonly getState: () => OrchestratorState;
  readonly refresh: () => Promise<void>;
  readonly shutdown: () => Promise<void>;
};

export type ProjectRegistry = {
  readonly mode: RuntimeMode;
  readonly list: () => readonly ProjectRuntime[];
  readonly get: (projectId: string) => ProjectRuntime | undefined;
  readonly refreshAll: () => Promise<void>;
};

export const createProjectRegistry = (
  mode: RuntimeMode,
  projects: readonly ProjectRuntime[],
): ProjectRegistry => {
  const projectMap = new Map<string, ProjectRuntime>();
  for (const project of projects) {
    projectMap.set(project.projectId, project);
  }

  return {
    mode,
    list: () => projects,
    get: (projectId: string) => projectMap.get(projectId),
    refreshAll: async () => {
      await Promise.all(projects.map(async (project) => project.refresh()));
    },
  };
};
