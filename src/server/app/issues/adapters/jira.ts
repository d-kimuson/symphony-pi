/** Jira issue-tracker adapter. */

import type { JiraTrackerConfig } from '../../config/model.js';
import type { Issue } from '../model.js';

export type JiraApiError =
  | { readonly type: 'jira_api_request'; readonly message: string }
  | { readonly type: 'jira_api_status'; readonly status: number; readonly body: string }
  | { readonly type: 'jira_unknown_payload' }
  | { readonly type: 'jira_pagination_error'; readonly message: string };

const DEFAULT_PAGE_SIZE = 50;
const NETWORK_TIMEOUT_MS = 30000;

type JiraIssue = {
  id?: string;
  key?: string;
  fields?: {
    summary?: string;
    description?: string | null;
    priority?: { name?: string; id?: string };
    status?: { name?: string };
    created?: string;
    updated?: string;
    labels?: string[];
    issuetype?: { name?: string };
    issuelinks?: {
      type?: { name?: string; inward?: string; outward?: string };
      inwardIssue?: { id?: string; key?: string; fields?: { status?: { name?: string } } };
      outwardIssue?: { id?: string; key?: string; fields?: { status?: { name?: string } } };
    }[];
  };
};

/**
 * Build JQL from project_key and active_states.
 */
export const buildCandidateJql = (projectKey: string, activeStates: readonly string[]): string => {
  const states = activeStates.map((s) => `"${s}"`).join(', ');
  return `project = ${projectKey} AND status in (${states}) ORDER BY priority ASC, created ASC`;
};

/**
 * Map Jira priority name to integer.
 * Higher priority names = lower numbers.
 */
export const mapJiraPriority = (priorityName: string | undefined): number | null => {
  if (priorityName === undefined) return null;
  const lower = priorityName.toLowerCase();
  if (lower === 'highest') return 1;
  if (lower === 'high') return 2;
  if (lower === 'medium') return 3;
  if (lower === 'low') return 4;
  if (lower === 'lowest') return 5;
  return null;
};

/**
 * Fetch candidate issues from Jira.
 */
export const fetchJiraCandidateIssues = async (
  config: JiraTrackerConfig,
): Promise<readonly Issue[] | JiraApiError> => {
  const jql = config.jql ?? buildCandidateJql(config.project_key ?? '', config.active_states);
  return fetchJiraIssuesByJql(config, jql, config.active_states);
};

/**
 * Fetch issues by state names (for startup terminal cleanup).
 * SPEC 8.6: Terminal cleanup is scoped to project_key or JQL.
 */
export const fetchJiraIssuesByStates = async (
  config: JiraTrackerConfig,
  stateNames: readonly string[],
): Promise<readonly Issue[] | JiraApiError> => {
  if (stateNames.length === 0) return [];
  const statesClause = stateNames.map((s) => `"${s}"`).join(', ');

  // Build scoped JQL: project-level or JQL-scoped, not site-wide
  const scopeExpr = config.jql ?? (config.project_key ? `project = ${config.project_key}` : '');
  const jql = scopeExpr
    ? `${scopeExpr} AND status in (${statesClause}) ORDER BY created ASC`
    : `status in (${statesClause}) ORDER BY created ASC`;

  return fetchJiraIssuesByJql(config, jql, stateNames);
};

/**
 * Fetch issue states by IDs (for active-run reconciliation).
 */
export const fetchJiraIssueStatesByIds = async (
  config: JiraTrackerConfig,
  issueIds: readonly string[],
): Promise<readonly Issue[] | JiraApiError> => {
  if (issueIds.length === 0) return [];

  const results: Issue[] = [];

  // SPEC 11.5: State refresh failure should NOT silently swallow errors.
  // Fetch all issues; if any fail, return the error rather than partial results.
  for (const id of issueIds) {
    const result = await executeJiraRequest<JiraIssue>(
      config,
      `/rest/api/2/issue/${encodeURIComponent(id)}`,
      'GET',
    );

    if ('type' in result) {
      // Individual fetch failed — return error, don't silently skip
      return result;
    }

    const issue = normalizeJiraIssue(result, config);
    if (issue !== null) {
      results.push(issue);
    }
  }

  return results;
};

// --- Internal helpers ---

const fetchJiraIssuesByJql = async (
  config: JiraTrackerConfig,
  jql: string,
  activeStates: readonly string[],
): Promise<readonly Issue[] | JiraApiError> => {
  let allIssues: Issue[] = [];
  let startAt = 0;
  let total = Infinity;

  while (startAt < total) {
    const params = new URLSearchParams({
      jql,
      startAt: String(startAt),
      maxResults: String(DEFAULT_PAGE_SIZE),
      fields: 'summary,description,priority,status,created,updated,labels,issuetype,issuelinks',
    });

    const result = await executeJiraRequest<{ issues?: JiraIssue[]; total?: number }>(
      config,
      `/rest/api/2/search?${params.toString()}`,
      'GET',
    );

    if ('type' in result) return result;

    const issues = result.issues ?? [];
    total = result.total ?? 0;

    for (const issue of issues) {
      const normalized = normalizeJiraIssue(issue, config);
      if (normalized === null) continue;

      // Post-filter by active states
      if (
        activeStates.length > 0 &&
        !activeStates.some((s) => s.toLowerCase() === normalized.state.toLowerCase())
      ) {
        continue;
      }

      allIssues.push(normalized);
    }

    startAt += DEFAULT_PAGE_SIZE;
  }

  return allIssues;
};

const normalizeJiraIssue = (raw: JiraIssue, config: JiraTrackerConfig): Issue | null => {
  if (typeof raw.key !== 'string') return null;

  const fields = raw.fields ?? {};
  const priority = mapJiraPriority(fields.priority?.name);
  const labels = (fields.labels ?? []).map((l) => l.toLowerCase());

  // Extract blockers from issue links
  const blockedBy: { id: string | null; identifier: string | null; state: string | null }[] = [];
  const links = fields.issuelinks ?? [];
  for (const link of links) {
    // "blocks" relationship where the inward issue blocks the current issue
    const inward = link.inwardIssue;
    if (link.type?.inward === 'is blocked by' && inward) {
      blockedBy.push({
        id: inward.id !== undefined && inward.id !== null ? String(inward.id) : null,
        identifier: inward.key ?? null,
        state: inward.fields?.status?.name ?? null,
      });
    }
  }

  return {
    id: raw.id !== undefined && raw.id !== null ? String(raw.id) : raw.key,
    identifier: raw.key,
    title: fields.summary ?? 'Untitled',
    description: fields.description ?? null,
    priority,
    state: fields.status?.name ?? 'Unknown',
    branch_name: null,
    url: `${config.base_url}/browse/${raw.key}`,
    labels,
    blocked_by: blockedBy,
    created_at: fields.created ?? null,
    updated_at: fields.updated ?? null,
  };
};

const executeJiraRequest = async <T>(
  config: JiraTrackerConfig,
  path: string,
  method: string,
): Promise<T | JiraApiError> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

  try {
    const auth = Buffer.from(`${config.email}:${config.api_key}`).toString('base64');

    const response = await fetch(`${config.base_url}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return { type: 'jira_api_status', status: response.status, body };
    }

    // oxlint-disable-next-line no-unsafe-type-assertion
    const json: T = (await response.json()) as T;
    return json;
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { type: 'jira_api_request', message: 'Request timed out' };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { type: 'jira_api_request', message };
  } finally {
    clearTimeout(timeout);
  }
};
