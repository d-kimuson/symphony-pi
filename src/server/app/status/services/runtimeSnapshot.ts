import type { AgentTotals, OrchestratorState } from '../../orchestrator/model.ts';
import type { ProjectRegistry, ProjectRuntime } from '../../runtime/model.ts';
import type {
  ProjectStateSnapshot,
  ProjectsSnapshot,
  ProjectSummary,
  RetryRow,
  RunningRow,
  RuntimeSnapshot,
} from '../model.ts';

const emptyAgentTotals: AgentTotals = {
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
  seconds_running: 0,
};

const buildRunningRows = (
  project: ProjectRuntime,
  state: OrchestratorState,
): readonly RunningRow[] => {
  return [...state.running.values()].map((entry) => ({
    project_id: project.projectId,
    project_root: project.projectRoot,
    workflow_path: project.workflowPath,
    issue_id: entry.issue_id,
    issue_identifier: entry.issue_identifier,
    turn_count: entry.turn_count,
    started_at: new Date(entry.started_at).toISOString(),
    attempt: entry.attempt,
  }));
};

const buildRetryRows = (project: ProjectRuntime, state: OrchestratorState): readonly RetryRow[] => {
  return [...state.retry_attempts.values()].map((entry) => ({
    project_id: project.projectId,
    project_root: project.projectRoot,
    workflow_path: project.workflowPath,
    issue_id: entry.issue_id,
    identifier: entry.identifier,
    attempt: entry.attempt,
    due_at_ms: entry.due_at_ms,
    error: entry.error,
  }));
};

const sumAgentTotals = (projects: readonly ProjectRuntime[]) => {
  return projects.reduce(
    (totals, project) => {
      const state = project.getState();
      return {
        input_tokens: totals.input_tokens + state.agent_totals.input_tokens,
        output_tokens: totals.output_tokens + state.agent_totals.output_tokens,
        total_tokens: totals.total_tokens + state.agent_totals.total_tokens,
        seconds_running: totals.seconds_running + state.agent_totals.seconds_running,
      };
    },
    { ...emptyAgentTotals },
  );
};

const buildAggregateRateLimits = (
  projects: readonly ProjectRuntime[],
): Record<string, unknown> | null => {
  if (projects.length === 1) {
    return projects[0]?.getState().agent_rate_limits ?? null;
  }

  const entries = projects.flatMap((project) => {
    const rateLimits = project.getState().agent_rate_limits;
    return rateLimits === null ? [] : [[project.projectId, rateLimits] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

export const buildProjectStateSnapshot = (project: ProjectRuntime): ProjectStateSnapshot => {
  const state = project.getState();

  return {
    project_id: project.projectId,
    project_root: project.projectRoot,
    workflow_path: project.workflowPath,
    generated_at: new Date().toISOString(),
    counts: {
      running: state.running.size,
      retrying: state.retry_attempts.size,
      completed: state.completed.size,
    },
    poll_interval_ms: state.poll_interval_ms,
    max_concurrent_agents: state.max_concurrent_agents,
    running: buildRunningRows(project, state),
    retrying: buildRetryRows(project, state),
    agent_totals: state.agent_totals,
    rate_limits: state.agent_rate_limits,
  };
};

export const buildProjectsSnapshot = (registry: ProjectRegistry): ProjectsSnapshot => {
  const projects = registry.list();
  const summaries: ProjectSummary[] = projects.map((project) => {
    const snapshot = buildProjectStateSnapshot(project);
    return {
      project_id: snapshot.project_id,
      project_root: snapshot.project_root,
      workflow_path: snapshot.workflow_path,
      counts: snapshot.counts,
      poll_interval_ms: snapshot.poll_interval_ms,
      max_concurrent_agents: snapshot.max_concurrent_agents,
    };
  });

  return {
    mode: registry.mode,
    generated_at: new Date().toISOString(),
    projects: summaries,
  };
};

export const buildAggregateRuntimeSnapshot = (registry: ProjectRegistry): RuntimeSnapshot => {
  const projects = registry.list();
  const running = projects.flatMap((project) => buildRunningRows(project, project.getState()));
  const retrying = projects.flatMap((project) => buildRetryRows(project, project.getState()));

  return {
    mode: registry.mode,
    generated_at: new Date().toISOString(),
    counts: {
      projects: projects.length,
      running: running.length,
      retrying: retrying.length,
    },
    running,
    retrying,
    agent_totals: sumAgentTotals(projects),
    rate_limits: buildAggregateRateLimits(projects),
  };
};
