export type ServiceConfig = {
  readonly max_concurrent_agents?: number;
  readonly projects: readonly ProjectConfigInput[];
};

export type ProjectConfigInput =
  | string
  | {
      readonly id?: string;
      readonly root: string;
      readonly workflow?: string;
    };

export type ResolvedProjectConfig = {
  readonly id: string;
  readonly root: string;
  readonly workflowPath: string;
};

export type ResolvedServiceConfig = {
  readonly configPath: string;
  readonly configDir: string;
  readonly max_concurrent_agents?: number;
  readonly projects: readonly ResolvedProjectConfig[];
};
