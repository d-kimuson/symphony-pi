/** Ticket tool implementations — SPEC 10.5 REQUIRED tools. */

import type {
  EffectiveConfig,
  LinearTrackerConfig,
  JiraTrackerConfig,
} from '../../config/model.ts';
import type { Issue } from '../../issues/model.ts';

/**
 * Fetch details for a single issue by its identifier.
 */
export const ticketGet = async (
  issueIdentifier: string,
  config: EffectiveConfig,
): Promise<Issue | { readonly error: string }> => {
  try {
    if (config.tracker.kind === 'linear') {
      return await linearGetIssue(issueIdentifier, config.tracker);
    }
    return await jiraGetIssue(issueIdentifier, config.tracker);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Failed to fetch issue: ${message}` };
  }
};

/**
 * Add a comment to the active ticket via tracker API.
 */
export const ticketComment = async (
  issueIdentifier: string,
  comment: string,
  config: EffectiveConfig,
): Promise<void | { readonly error: string }> => {
  try {
    if (config.tracker.kind === 'linear') {
      return await linearComment(issueIdentifier, comment, config.tracker);
    }
    return await jiraComment(issueIdentifier, comment, config.tracker);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Comment failed: ${message}` };
  }
};

/**
 * Move the active ticket to a requested target state.
 * The target state MUST be included in `tracker.transition_states` (SPEC 10.5).
 */
export const ticketTransition = async (
  issueIdentifier: string,
  targetState: string,
  config: EffectiveConfig,
): Promise<void | { readonly error: string }> => {
  const isAllowed = config.tracker.transition_states.some(
    (state) => state.toLowerCase() === targetState.toLowerCase(),
  );
  if (!isAllowed) {
    const allowed = config.tracker.transition_states.join(', ');
    return { error: `Invalid transition target "${targetState}". Allowed: ${allowed}` };
  }

  try {
    if (config.tracker.kind === 'linear') {
      return await linearTransition(issueIdentifier, targetState, config.tracker);
    }
    return await jiraTransition(issueIdentifier, targetState, config.tracker);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Transition failed: ${message}` };
  }
};

// ---- JSON helpers ----

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isNumber = (value: unknown): value is number => typeof value === 'number';

const getStr = (obj: Record<string, unknown>, key: string): string | undefined => {
  const value = obj[key];
  return isString(value) ? value : undefined;
};

const getNum = (obj: Record<string, unknown>, key: string): number | undefined => {
  const value = obj[key];
  return isNumber(value) ? value : undefined;
};

const getObj = (obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined => {
  const value = obj[key];
  return isObject(value) ? value : undefined;
};

const getArr = (obj: Record<string, unknown>, key: string): readonly unknown[] | undefined => {
  const value = obj[key];
  return Array.isArray(value) ? value : undefined;
};

// ---- Linear helpers ----

type LinearScopedIssue = {
  readonly linearId: string;
  readonly issue: Issue;
};

const linearGetIssue = async (
  issueIdentifier: string,
  tracker: LinearTrackerConfig,
): Promise<Issue | { readonly error: string }> => {
  const issue = await linearGetScopedIssue(issueIdentifier, tracker);
  if ('error' in issue) return issue;
  return issue.issue;
};

const linearComment = async (
  issueIdentifier: string,
  comment: string,
  tracker: LinearTrackerConfig,
): Promise<void | { readonly error: string }> => {
  const issue = await linearGetScopedIssue(issueIdentifier, tracker);
  if ('error' in issue) return issue;

  const response = await linearGraphqlRequest(
    tracker,
    `
      mutation CreateComment($issueId: ID!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) { success }
      }
    `,
    { issueId: issue.linearId, body: comment },
    'Linear comment failed',
  );

  if ('error' in response) return response;
};

const linearTransition = async (
  issueIdentifier: string,
  targetState: string,
  tracker: LinearTrackerConfig,
): Promise<void | { readonly error: string }> => {
  const issue = await linearGetScopedIssue(issueIdentifier, tracker);
  if ('error' in issue) return issue;

  const stateLookup = await linearGraphqlRequest(
    tracker,
    `
      query GetStateId($teamKey: String!, $name: String!) {
        workflowStates(
          filter: {
            team: { key: { eq: $teamKey } }
            name: { eq: $name }
          }
          first: 1
        ) {
          nodes { id name }
        }
      }
    `,
    { teamKey: tracker.team_key, name: targetState },
    'Linear state lookup failed',
  );

  if ('error' in stateLookup) return stateLookup;

  const stateId = extractLinearStateId(stateLookup.body);
  if (stateId === undefined) {
    return { error: `State "${targetState}" not found in Linear team ${tracker.team_key}` };
  }

  const updateResponse = await linearGraphqlRequest(
    tracker,
    `
      mutation UpdateIssue($issueId: ID!, $stateId: ID!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
      }
    `,
    { issueId: issue.linearId, stateId },
    'Linear transition failed',
  );

  if ('error' in updateResponse) return updateResponse;
};

const linearGetScopedIssue = async (
  issueIdentifier: string,
  tracker: LinearTrackerConfig,
): Promise<LinearScopedIssue | { readonly error: string }> => {
  const projectFilter = buildLinearProjectFilter();
  const response = await linearGraphqlRequest(
    tracker,
    `
      query GetIssue($identifier: String!, $teamKey: String!, $projectSlug: String!) {
        issues(
          filter: {
            identifier: { eq: $identifier }
            team: { key: { eq: $teamKey } }
            ${projectFilter}
          }
          first: 1
        ) {
          nodes {
            id
            identifier
            title
            description
            priority
            state { name }
            team { key }
            project { slugId name }
            branchName
            url
            labels { nodes { name } }
            createdAt
            updatedAt
          }
        }
      }
    `,
    {
      identifier: issueIdentifier,
      teamKey: tracker.team_key,
      projectSlug: tracker.project_slug,
    },
    'Linear API returned',
  );

  if ('error' in response) return response;

  const body = response.body;
  if (!isObject(body)) return { error: 'Invalid Linear response' };

  const data = getObj(body, 'data');
  if (data === undefined) return { error: 'Invalid Linear response: no data' };

  const issues = getObj(data, 'issues');
  if (issues === undefined) return { error: 'Invalid Linear response: no issues' };

  const nodes = getArr(issues, 'nodes');
  if (nodes === undefined || nodes.length === 0) {
    return { error: `Issue ${issueIdentifier} not found in configured Linear scope` };
  }

  const raw = nodes[0];
  if (!isObject(raw)) return { error: 'Invalid Linear node' };

  const normalized = linearNodeToScopedIssue(raw, issueIdentifier, tracker);
  if ('error' in normalized) return normalized;
  return normalized;
};

const linearGraphqlRequest = async (
  tracker: LinearTrackerConfig,
  query: string,
  variables: Record<string, unknown>,
  errorPrefix: string,
): Promise<{ readonly body: unknown } | { readonly error: string }> => {
  const response = await fetch(tracker.endpoint, {
    method: 'POST',
    headers: {
      Authorization: tracker.api_key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    return { error: `${errorPrefix}: ${response.status}` };
  }

  const body: unknown = await response.json();
  const graphqlError = extractLinearGraphqlError(body);
  if (graphqlError !== undefined) {
    return { error: `${errorPrefix}: ${graphqlError}` };
  }

  return { body };
};

const extractLinearGraphqlError = (body: unknown): string | undefined => {
  if (!isObject(body)) return undefined;
  const errors = getArr(body, 'errors');
  if (errors === undefined || errors.length === 0) return undefined;

  const messages: string[] = [];
  for (const error of errors) {
    if (!isObject(error)) continue;
    const message = getStr(error, 'message');
    if (message !== undefined) {
      messages.push(message);
    }
  }

  return messages.length > 0 ? messages.join('; ') : 'GraphQL error';
};

const buildLinearProjectFilter = (): string => 'project: { slugId: { eq: $projectSlug } }';

const extractLinearStateId = (body: unknown): string | undefined => {
  if (!isObject(body)) return undefined;
  const data = getObj(body, 'data');
  if (data === undefined) return undefined;
  const workflowStates = getObj(data, 'workflowStates');
  if (workflowStates === undefined) return undefined;
  const nodes = getArr(workflowStates, 'nodes');
  if (nodes === undefined || nodes.length === 0) return undefined;
  const node = nodes[0];
  if (!isObject(node)) return undefined;
  return getStr(node, 'id');
};

// ---- Jira helpers ----

const jiraGetIssue = async (
  issueIdentifier: string,
  tracker: JiraTrackerConfig,
): Promise<Issue | { readonly error: string }> => {
  const auth = Buffer.from(`${tracker.email}:${tracker.api_key}`).toString('base64');

  const response = await fetch(`${tracker.base_url}/rest/api/2/issue/${issueIdentifier}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    return { error: `Jira API returned ${response.status}` };
  }

  const raw: unknown = await response.json();
  if (!isObject(raw)) return { error: 'Invalid Jira response' };

  return jiraPayloadToIssue(raw, tracker.base_url);
};

const jiraComment = async (
  issueIdentifier: string,
  comment: string,
  tracker: JiraTrackerConfig,
): Promise<void | { readonly error: string }> => {
  const auth = Buffer.from(`${tracker.email}:${tracker.api_key}`).toString('base64');

  const response = await fetch(`${tracker.base_url}/rest/api/2/issue/${issueIdentifier}/comment`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: comment }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    return { error: `Jira comment failed: ${response.status}` };
  }
};

const jiraTransition = async (
  issueIdentifier: string,
  targetState: string,
  tracker: JiraTrackerConfig,
): Promise<void | { readonly error: string }> => {
  const auth = Buffer.from(`${tracker.email}:${tracker.api_key}`).toString('base64');

  const transitionsResponse = await fetch(
    `${tracker.base_url}/rest/api/2/issue/${issueIdentifier}/transitions`,
    {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    },
  );

  if (!transitionsResponse.ok) {
    return { error: `Jira transitions lookup failed: ${transitionsResponse.status}` };
  }

  const transitionsData: unknown = await transitionsResponse.json();
  const transitionId = extractJiraTransitionId(transitionsData, targetState);

  if (transitionId === undefined) {
    return { error: `No transition to "${targetState}" available for ${issueIdentifier}` };
  }

  const execResponse = await fetch(
    `${tracker.base_url}/rest/api/2/issue/${issueIdentifier}/transitions`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transition: { id: transitionId } }),
      signal: AbortSignal.timeout(30000),
    },
  );

  if (!execResponse.ok) {
    return { error: `Jira transition failed: ${execResponse.status}` };
  }
};

const extractJiraTransitionId = (data: unknown, targetState: string): string | undefined => {
  if (!isObject(data)) return undefined;
  const transitions = getArr(data, 'transitions');
  if (transitions === undefined) return undefined;

  for (const transition of transitions) {
    if (!isObject(transition)) continue;
    const to = getObj(transition, 'to');
    if (to === undefined) continue;
    const name = getStr(to, 'name');
    if (isString(name) && name.toLowerCase() === targetState.toLowerCase()) {
      return getStr(transition, 'id');
    }
  }
  return undefined;
};

// ---- Normalization helpers ----

const linearNodeToScopedIssue = (
  raw: Record<string, unknown>,
  fallbackIdentifier: string,
  tracker: LinearTrackerConfig,
): LinearScopedIssue | { readonly error: string } => {
  const linearId = getStr(raw, 'id');
  if (linearId === undefined) {
    return { error: 'Invalid Linear node: missing id' };
  }

  const team = getObj(raw, 'team');
  const project = getObj(raw, 'project');
  if (!isLinearIssueInScope(team, project, tracker)) {
    return { error: `Issue ${fallbackIdentifier} is outside configured Linear scope` };
  }

  return {
    linearId,
    issue: linearNodeToIssue(raw, fallbackIdentifier),
  };
};

const isLinearIssueInScope = (
  team: Record<string, unknown> | undefined,
  project: Record<string, unknown> | undefined,
  tracker: LinearTrackerConfig,
): boolean => {
  const teamKey = team === undefined ? undefined : getStr(team, 'key');
  if (teamKey !== tracker.team_key) {
    return false;
  }

  if (project === undefined) {
    return false;
  }

  return getStr(project, 'slugId') === tracker.project_slug;
};

const linearNodeToIssue = (raw: Record<string, unknown>, fallbackIdentifier: string): Issue => {
  const labelsContainer = getObj(raw, 'labels');
  const labelsNodes: Array<{ name: string }> = [];
  if (labelsContainer !== undefined) {
    const nodes = getArr(labelsContainer, 'nodes');
    if (nodes !== undefined) {
      for (const node of nodes) {
        if (!isObject(node)) continue;
        const name = getStr(node, 'name');
        if (isString(name)) labelsNodes.push({ name });
      }
    }
  }

  const stateContainer = getObj(raw, 'state');
  let stateName = 'Unknown';
  if (stateContainer !== undefined) {
    const name = getStr(stateContainer, 'name');
    if (isString(name)) stateName = name;
  }

  return {
    id: getStr(raw, 'id') ?? fallbackIdentifier,
    identifier: getStr(raw, 'identifier') ?? fallbackIdentifier,
    title: getStr(raw, 'title') ?? '',
    description: getStr(raw, 'description') ?? null,
    priority: getNum(raw, 'priority') ?? null,
    state: stateName,
    branch_name: getStr(raw, 'branchName') ?? null,
    url: getStr(raw, 'url') ?? null,
    labels: labelsNodes.map((label) => label.name.toLowerCase()),
    blocked_by: [],
    created_at: getStr(raw, 'createdAt') ?? null,
    updated_at: getStr(raw, 'updatedAt') ?? null,
  };
};

const jiraPayloadToIssue = (raw: Record<string, unknown>, baseUrl: string): Issue => {
  const fieldsContainer = getObj(raw, 'fields');
  const fields: Record<string, unknown> = fieldsContainer ?? {};

  const priorityContainer = getObj(fields, 'priority');
  const priorityName =
    priorityContainer === undefined ? undefined : getStr(priorityContainer, 'name');

  const statusContainer = getObj(fields, 'status');
  let statusName = 'Unknown';
  if (statusContainer !== undefined) {
    const name = getStr(statusContainer, 'name');
    if (isString(name)) statusName = name;
  }

  const labelsContainer = getArr(fields, 'labels');
  const labels: string[] = labelsContainer !== undefined ? labelsContainer.filter(isString) : [];

  const keyValue = getStr(raw, 'key');

  return {
    id: getStr(raw, 'id') ?? (isString(keyValue) ? keyValue : ''),
    identifier: isString(keyValue) ? keyValue : '',
    title: getStr(fields, 'summary') ?? '',
    description: getStr(fields, 'description') ?? null,
    priority: mapJiraPriority(priorityName),
    state: statusName,
    branch_name: null,
    url: `${baseUrl}/browse/${isString(keyValue) ? keyValue : ''}`,
    labels: labels.map((label) => label.toLowerCase()),
    blocked_by: [],
    created_at: getStr(fields, 'created') ?? null,
    updated_at: getStr(fields, 'updated') ?? null,
  };
};

const mapJiraPriority = (name: string | undefined): number | null => {
  if (!isString(name)) return null;
  const map: Record<string, number> = {
    highest: 1,
    high: 2,
    medium: 3,
    low: 4,
    lowest: 5,
  };
  const key = name.toLowerCase();
  return key in map ? (map[key] ?? null) : null;
};
