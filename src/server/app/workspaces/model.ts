/** Workspace path, key, lifecycle, and hook models. */

export type Workspace = {
  readonly path: string;
  readonly workspace_key: string;
  readonly created_now: boolean;
};

export type WorkspaceHook = 'after_create' | 'before_run' | 'after_run' | 'before_remove';

/**
 * Workspace lifecycle event.
 */
export type WorkspaceLifecycleEvent = {
  readonly workspace_key: string;
  readonly path: string;
  readonly hook: WorkspaceHook;
  readonly success: boolean;
  readonly error: string | null;
  readonly duration_ms: number;
};
