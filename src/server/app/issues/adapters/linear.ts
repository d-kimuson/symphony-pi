/** Linear issue-tracker adapter. */

import type { LinearTrackerConfig } from '../../config/model.js';
import type { Issue } from '../model.js';

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

/**
 * Fetch candidate issues from Linear using GraphQL.
 */
export const fetchLinearCandidateIssues = async (
  config: LinearTrackerConfig,
): Promise<readonly Issue[] | LinearApiError> => {
  const query = `
    query CandidateIssues($projectSlug: String!, $activeStates: [String!]!, $first: Int!, $after: String) {
      issues(
        filter: {
          project: { slugId: { eq: $projectSlug } }
          state: { name: { in: $activeStates } }
        }
        first: $first
        after: $after
        orderBy: priority
      ) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { name }
          branchName
          url
          labelIds
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

  let allIssues: Issue[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await executeLinearQuery(config, query, {
      projectSlug: config.project_slug,
      activeStates: [...config.active_states],
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

  const query = `
    query IssuesByStates($projectSlug: String!, $states: [String!]!, $first: Int!, $after: String) {
      issues(
        filter: {
          project: { slugId: { eq: $projectSlug } }
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
          branchName
          url
          labelIds
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

  let allIssues: Issue[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await executeLinearQuery(config, query, {
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
          branchName
          url
          labelIds
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

// --- Internal helpers ---

type LinearIssueNode = {
  id?: unknown;
  identifier?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  state?: { name?: unknown };
  branchName?: unknown;
  url?: unknown;
  labelIds?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const normalizeLinearIssue = (
  node: LinearIssueNode,
  _config: LinearTrackerConfig,
): Issue | null => {
  if (typeof node.id !== 'string' || typeof node.identifier !== 'string') return null;

  const labels: string[] = [];
  if (Array.isArray(node.labelIds)) {
    for (const lid of node.labelIds) {
      if (typeof lid === 'string') {
        labels.push(lid.toLowerCase());
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
    blocked_by: [],
    created_at: ensureStringOrNull(node.createdAt),
    updated_at: ensureStringOrNull(node.updatedAt),
  };
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

    // oxlint-disable-next-line no-unsafe-type-assertion
    const json: GraphQLResponse = (await response.json()) as GraphQLResponse;

    if (json.errors && json.errors.length > 0) {
      return {
        type: 'linear_graphql_errors',
        errors: json.errors.map((e) => e.message),
      };
    }

    const data = json.data;
    if (data === undefined || data === null) {
      return { type: 'linear_unknown_payload' };
    }

    // oxlint-disable-next-line no-unsafe-type-assertion
    const issuesData = data['issues'] as Record<string, unknown> | undefined;
    if (issuesData === undefined) {
      return { type: 'linear_unknown_payload' };
    }

    // oxlint-disable-next-line no-unsafe-type-assertion
    const nodes = (issuesData['nodes'] ?? []) as LinearIssueNode[];
    // oxlint-disable-next-line no-unsafe-type-assertion
    const pageInfo = (issuesData['pageInfo'] ?? {
      hasNextPage: false,
      endCursor: null,
    }) as { hasNextPage: boolean; endCursor: string | null };

    return { nodes, pageInfo };
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { type: 'linear_api_request', message: 'Request timed out' };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { type: 'linear_api_request', message };
  } finally {
    clearTimeout(timeout);
  }
};
