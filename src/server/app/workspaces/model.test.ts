import { describe, expect, it } from 'vitest';

import type { Workspace, WorkspaceHook } from './model.ts';

describe('Workspace', () => {
  const ws: Workspace = {
    path: '/tmp/workspaces/TEST-1',
    workspace_key: 'TEST-1',
    created_now: false,
  } as const satisfies Workspace;

  it('has path, workspace_key, and created_now', () => {
    expect(ws.path).toBe('/tmp/workspaces/TEST-1');
    expect(ws.workspace_key).toBe('TEST-1');
    expect(ws.created_now).toBe(false);
  });

  it('created_now can be true for newly created', () => {
    const newWs: Workspace = { path: '/tmp/ws/NEW-1', workspace_key: 'NEW-1', created_now: true };
    expect(newWs.created_now).toBe(true);
  });
});

describe('WorkspaceHook', () => {
  const hooks: readonly WorkspaceHook[] = [
    'after_create',
    'before_run',
    'after_run',
    'before_remove',
  ];

  it('has four hook types', () => {
    expect(hooks).toHaveLength(4);
    expect(hooks).toContain('after_create');
    expect(hooks).toContain('before_run');
    expect(hooks).toContain('after_run');
    expect(hooks).toContain('before_remove');
  });
});
