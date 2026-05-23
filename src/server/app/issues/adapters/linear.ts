/** Linear issue-tracker adapter. */

import type { LinearTrackerConfig } from '../../config/model.ts';
import type { Issue } from '../model.ts';

export type LinearApiError =
  | { readonly type: 'linear_api_request'; readonly message: string }
  | { readonly type: 'linear_api_status'; readonly status: number; readonly body: string }
  | { readonly type: 'linear_graphql_errors'; readonly errors: readonly string[] }
  | { readonly type: 'linear_unknown_payload' }
  | { readonly type: 'linear_missing_end_cursor'; readonly message: string };

const DEFAULT_PAGE_SIZE = 50;
const NETWORK_TIMEOUT_MS = 30000;

type GraphQLResponse = {
  data?: Record<string, unknown>;
  errors?: readonly { message: string }[];
};

const isGraphQLResponse = (value: unknown): value is GraphQLResponse => {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  const dataVal = obj['data'];
  if (dataVal !== undefined && dataVal !== null && typeof dataVal !== 'object') return false;
  const errorsVal = obj['errors'];
  if (errorsVal !== undefined) {
    if (!Array.isArray(errorsVal)) return false;
    for (const err of errorsVal) {
      if (
        err === null ||
        typeof err !== 'object' ||
        typeof (err as Record<string, unknown>)['message'] !== 'string'
      ) {
        return false;
      }
    }
  }
  return true;
};

/**
 * Fetch candidate issues from Linear using GraphQL.
 */
export const fetchLinearCandidateIssues = async (
  config: LinearTrackerConfig,
): Promise<readonly Issue[] | LinearApiError> => {
  const projectFilter = buildLinearProjectFilter();

  const query = `
    query CandidateIssues($teamKey: String!, $projectSlug: String!, $activeStates: [String!]!, $first: Int!, $after: String) {
      issues(
        filter: {
          team: { key: { eq: $teamKey } }
          ${projectFilter}
          state: { name: { in: $activeStates } }
        }
        first: $first
        after: $after
      ) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { name }
          team { id key name }
          project { id slugId name }
          branchName
          url
          labels { nodes { name } }
          createdAt
          updatedAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const allIssues: Issue[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await executeLinearQuery(config, query, {
      teamKey: config.team_key,
      projectSlug: config.project_slug,
      activeStates: [...config.active_states],
      first: DEFAULT_PAGE_SIZE,
      after,
    });

    if ('type' in result) return result;

    const { nodes, pageInfo } = result;
    console.log(
      `[symphony] Linear candidate fetch: ${nodes.length} issues (hasNextPage=${pageInfo.hasNextPage})`,
    );
    for (const node of nodes) {
      const issue = normalizeLinearIssue(node, config);
      if (issue !== null) {
        allIssues.push(issue);
      }
    }

    hasNextPage = pageInfo.hasNextPage;
    if (hasNextPage && pageInfo.endCursor === null) {
      return {
        type: 'linear_missing_end_cursor',
        message: 'hasNextPage is true but endCursor is null',
      };
    }
    after = pageInfo.endCursor;
  }

  return allIssues;
};

/**
 * Fetch issues by state names (for startup terminal cleanup).
 */
export const fetchLinearIssuesByStates = async (
  config: LinearTrackerConfig,
  stateNames: readonly string[],
): Promise<readonly Issue[] | LinearApiError> => {
  if (stateNames.length === 0) return [];

  const projectFilter = buildLinearProjectFilter();

  const query = `
    query IssuesByStates($teamKey: String!, $projectSlug: String!, $states: [String!]!, $first: Int!, $after: String) {
      issues(
        filter: {
          team: { key: { eq: $teamKey } }
          ${projectFilter}
          state: { name: { in: $states } }
        }
        first: $first
        after: $after
      ) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { name }
          team { id key name }
          project { id slugId name }
          branchName
          url
          labels { nodes { name } }
          createdAt
          updatedAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const allIssues: Issue[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await executeLinearQuery(config, query, {
      teamKey: config.team_key,
      projectSlug: config.project_slug,
      states: [...stateNames],
      first: DEFAULT_PAGE_SIZE,
      after,
    });

    if ('type' in result) return result;

    const { nodes, pageInfo } = result;
    for (const node of nodes) {
      const issue = normalizeLinearIssue(node, config);
      if (issue !== null) {
        allIssues.push(issue);
      }
    }

    hasNextPage = pageInfo.hasNextPage;
    if (hasNextPage && pageInfo.endCursor === null) {
      return {
        type: 'linear_missing_end_cursor',
        message: 'hasNextPage is true but endCursor is null',
      };
    }
    after = pageInfo.endCursor;
  }

  return allIssues;
};

/**
 * Fetch issue states by IDs (for active-run reconciliation).
 */
export const fetchLinearIssueStatesByIds = async (
  config: LinearTrackerConfig,
  issueIds: readonly string[],
): Promise<readonly Issue[] | LinearApiError> => {
  if (issueIds.length === 0) return [];

  const query = `
    query IssuesByIds($ids: [ID!]!) {
      issues(filter: { id: { in: $ids } }) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { name }
          team { id key name }
          project { id slugId name }
          branchName
          url
          labels { nodes { name } }
          createdAt
          updatedAt
        }
      }
    }
  `;

  const result = await executeLinearQuery(config, query, { ids: [...issueIds] });

  if ('type' in result) return result;

  return result.nodes
    .map((node) => normalizeLinearIssue(node, config))
    .filter((issue): issue is Issue => issue !== null);
};

const buildLinearProjectFilter = (): string => 'project: { slugId: { eq: $projectSlug } }';

// --- Internal helpers ---

type LinearIssueNode = {
  id?: unknown;
  identifier?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  state?: { name?: unknown };
  team?: { id?: unknown; key?: unknown; name?: unknown };
  project?: { id?: unknown; slugId?: unknown; name?: unknown };
  branchName?: unknown;
  url?: unknown;
  labels?: { nodes?: readonly { name?: unknown }[] };
  blocks?: { nodes?: readonly BlockNode[] };
  createdAt?: unknown;
  updatedAt?: unknown;
};

type BlockNode = {
  id?: unknown;
  identifier?: unknown;
  state?: { name?: unknown };
};

const normalizeLinearIssue = (node: LinearIssueNode, config: LinearTrackerConfig): Issue | null => {
  if (
    typeof node.id !== 'string' ||
    typeof node.identifier !== 'string' ||
    !isLinearIssueInScope(node, config)
  ) {
    return null;
  }

  const labels: string[] = [];
  const labelNodes = node.labels?.nodes;
  if (labelNodes !== undefined && Array.isArray(labelNodes)) {
    for (const labelNode of labelNodes) {
      if (
        labelNode &&
        typeof labelNode === 'object' &&
        typeof (labelNode as { name?: unknown }).name === 'string'
      ) {
        labels.push((labelNode as { name: string }).name.toLowerCase());
      }
    }
  }

  const blockedBy: { id: string | null; identifier: string | null; state: string | null }[] = [];
  const blockNodes = node.blocks?.nodes;
  if (blockNodes !== undefined && Array.isArray(blockNodes)) {
    for (const blockNode of blockNodes) {
      if (blockNode && typeof blockNode === 'object') {
        blockedBy.push({
          id: typeof blockNode.id === 'string' ? blockNode.id : null,
          identifier: typeof blockNode.identifier === 'string' ? blockNode.identifier : null,
          state:
            blockNode.state &&
            typeof blockNode.state === 'object' &&
            typeof (blockNode.state as { name?: unknown }).name === 'string'
              ? (blockNode.state as { name: string }).name
              : null,
        });
      }
    }
  }

  return {
    id: node.id,
    identifier: node.identifier,
    title: typeof node.title === 'string' ? node.title : 'Untitled',
    description: typeof node.description === 'string' ? node.description : null,
    priority:
      typeof node.priority === 'number' && Number.isInteger(node.priority) ? node.priority : null,
    state: typeof node.state?.name === 'string' ? node.state.name : 'Unknown',
    branch_name: ensureStringOrNull(node.branchName),
    url: ensureStringOrNull(node.url) ?? `https://linear.app/issue/${node.identifier}`,
    labels,
    blocked_by: blockedBy,
    created_at: ensureStringOrNull(node.createdAt),
    updated_at: ensureStringOrNull(node.updatedAt),
  };
};

const isLinearIssueInScope = (node: LinearIssueNode, config: LinearTrackerConfig): boolean => {
  if (typeof node.team?.key !== 'string' || node.team.key !== config.team_key) {
    return false;
  }

  return typeof node.project?.slugId === 'string' && node.project.slugId === config.project_slug;
};

const ensureStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

type QueryResult = {
  nodes: LinearIssueNode[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

const executeLinearQuery = async (
  config: LinearTrackerConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<QueryResult | LinearApiError> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.api_key,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return { type: 'linear_api_status', status: response.status, body };
    }

    const json: unknown = await response.json();
    if (!isGraphQLResponse(json)) {
      return { type: 'linear_unknown_payload' };
    }

    if (json.errors && json.errors.length > 0) {
      return {
        type: 'linear_graphql_errors',
        errors: json.errors.map((error) => error.message),
      };
    }

    const data = json.data;
    if (data === undefined || data === null) {
      return { type: 'linear_unknown_payload' };
    }

    const issuesData = data['issues'];
    if (issuesData === undefined || issuesData === null || typeof issuesData !== 'object') {
      return { type: 'linear_unknown_payload' };
    }

    const issuesObj = issuesData as Record<string, unknown>;
    const nodesRaw = issuesObj['nodes'];
    const nodes: LinearIssueNode[] = Array.isArray(nodesRaw) ? (nodesRaw as LinearIssueNode[]) : [];

    const pageInfoRaw = issuesObj['pageInfo'];
    let pageInfo: { hasNextPage: boolean; endCursor: string | null };
    if (pageInfoRaw !== null && typeof pageInfoRaw === 'object') {
      const pageInfoObject = pageInfoRaw as Record<string, unknown>;
      pageInfo = {
        hasNextPage:
          typeof pageInfoObject['hasNextPage'] === 'boolean'
            ? pageInfoObject['hasNextPage']
            : false,
        endCursor:
          typeof pageInfoObject['endCursor'] === 'string' ? pageInfoObject['endCursor'] : null,
      };
    } else {
      pageInfo = { hasNextPage: false, endCursor: null };
    }

    return { nodes, pageInfo };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { type: 'linear_api_request', message: 'Request timed out' };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { type: 'linear_api_request', message };
  } finally {
    clearTimeout(timeout);
  }
};
