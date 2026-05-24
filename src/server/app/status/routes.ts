/** HTTP routes for `/api/v1/*` status and control surfaces. */

import type { Hono } from 'hono';

import type { HonoContext } from '../../app.ts';
import type { ProjectRegistry, ProjectRuntime } from '../runtime/model.ts';

import {
  buildAggregateRuntimeSnapshot,
  buildProjectStateSnapshot,
  buildProjectsSnapshot,
} from './services/runtimeSnapshot.ts';

const findIssue = (project: ProjectRuntime, identifier: string) => {
  const state = project.getState();

  for (const entry of state.running.values()) {
    if (entry.issue_identifier === identifier) {
      return {
        found: true,
        type: 'running',
        project_id: project.projectId,
        project_root: project.projectRoot,
        workflow_path: project.workflowPath,
        issue_id: entry.issue_id,
        issue_identifier: entry.issue_identifier,
        turn_count: entry.turn_count,
        started_at: new Date(entry.started_at).toISOString(),
        attempt: entry.attempt,
        workspace_path: entry.workspace_path,
        last_agent_timestamp:
          entry.last_agent_timestamp !== undefined
            ? new Date(entry.last_agent_timestamp).toISOString()
            : null,
      } as const;
    }
  }

  for (const entry of state.retry_attempts.values()) {
    if (entry.identifier === identifier) {
      return {
        found: true,
        type: 'retrying',
        project_id: project.projectId,
        project_root: project.projectRoot,
        workflow_path: project.workflowPath,
        issue_id: entry.issue_id,
        identifier: entry.identifier,
        attempt: entry.attempt,
        due_at_ms: entry.due_at_ms,
        error: entry.error,
      } as const;
    }
  }

  return null;
};

/**
 * Mount status API routes on the Hono app.
 */
export const mountStatusRoutes = <T extends Hono<HonoContext>>(
  app: T,
  registry: ProjectRegistry,
): T => {
  app.get('/api/v1/projects', (c) => {
    return c.json(buildProjectsSnapshot(registry));
  });

  app.get('/api/v1/projects/:projectId/state', (c) => {
    const projectId = c.req.param('projectId');
    const project = registry.get(projectId);
    if (project === undefined) {
      return c.json({ found: false, project_id: projectId, message: 'Project not found' }, 404);
    }

    return c.json(buildProjectStateSnapshot(project));
  });

  app.get('/api/v1/projects/:projectId/issues/:identifier', (c) => {
    const projectId = c.req.param('projectId');
    const identifier = c.req.param('identifier');
    const project = registry.get(projectId);

    if (project === undefined) {
      return c.json({ found: false, project_id: projectId, message: 'Project not found' }, 404);
    }

    const issue = findIssue(project, identifier);
    if (issue === null) {
      return c.json(
        {
          found: false,
          project_id: projectId,
          identifier,
          message: 'Issue not found in running or retry state',
        },
        404,
      );
    }

    return c.json(issue);
  });

  app.post('/api/v1/projects/:projectId/refresh', async (c) => {
    const projectId = c.req.param('projectId');
    const project = registry.get(projectId);

    if (project === undefined) {
      return c.json({ status: 'project_not_found', project_id: projectId }, 404);
    }

    await project.refresh();
    return c.json({ status: 'refresh_requested', project_id: projectId });
  });

  app.get('/api/v1/state', (c) => {
    return c.json(buildAggregateRuntimeSnapshot(registry));
  });

  app.get('/api/v1/:identifier', (c) => {
    const identifier = c.req.param('identifier');

    if (registry.mode === 'multi-project') {
      return c.json(
        {
          found: false,
          identifier,
          message: 'Multi-project mode requires /api/v1/projects/:projectId/issues/:identifier',
        },
        400,
      );
    }

    const project = registry.list()[0];
    if (project === undefined) {
      return c.json({ found: false, identifier, message: 'No project runtime available' }, 404);
    }

    const issue = findIssue(project, identifier);
    if (issue === null) {
      return c.json(
        {
          found: false,
          identifier,
          message: 'Issue not found in running or retry state',
        },
        404,
      );
    }

    return c.json(issue);
  });

  app.post('/api/v1/refresh', async (c) => {
    await registry.refreshAll();
    return c.json({ status: 'refresh_requested', scope: 'all-projects' });
  });

  return app;
};
