/** Ticket tool implementations — SPEC 10.5 REQUIRED tools. */

import type {
  EffectiveConfig,
  LinearTrackerConfig,
  JiraTrackerConfig,
} from '../../config/model.js';
import type { Issue } from '../../issues/model.js';

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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
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
    (s) => s.toLowerCase() === targetState.toLowerCase(),
  );
  if (!isAllowed) {
    const allowed = config.tracker.transition_states.join(', ');
    const msg = `Invalid transition target "${targetState}". Allowed: ${allowed}`;
    return { error: msg };
  }

  try {
    if (config.tracker.kind === 'linear') {
      return await linearTransition(issueIdentifier, targetState, config.tracker);
    }
    return await jiraTransition(issueIdentifier, targetState, config.tracker);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `Transition failed: ${message}` };
  }
};

// ---- JSON helpers ----

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const isString = (v: unknown): v is string => typeof v === 'string';

const isNumber = (v: unknown): v is number => typeof v === 'number';

const getStr = (obj: Record<string, unknown>, key: string): string | undefined => {
  const val = obj[key];
  return isString(val) ? val : undefined;
};

const getNum = (obj: Record<string, unknown>, key: string): number | undefined => {
  const val = obj[key];
  return isNumber(val) ? val : undefined;
};

const getObj = (obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined => {
  const val = obj[key];
  return isObject(val) ? val : undefined;
};

const getArr = (obj: Record<string, unknown>, key: string): readonly unknown[] | undefined => {
  const val = obj[key];
  return Array.isArray(val) ? val : undefined;
};

// ---- Linear helpers ----

const linearGetIssue = async (
  issueIdentifier: string,
  tracker: LinearTrackerConfig,
): Promise<Issue | { readonly error: string }> => {
  const query = `
    query GetIssue($identifier: String!) {
      issues(filter: { identifier: { eq: $identifier } }, first: 1) {
        nodes {
          id identifier title description priority
          state { name }
          branchName url
          labels { nodes { name } }
          createdAt updatedAt
        }
      }
    }
  `;

  const response = await fetch(tracker.endpoint, {
    method: 'POST',
    headers: {
      Authorization: tracker.api_key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { identifier: issueIdentifier } }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    return { error: `Linear API returned ${response.status}` };
  }

  const body: unknown = await response.json();
  if (!isObject(body)) return { error: 'Invalid Linear response' };

  const data = getObj(body, 'data');
  if (data === undefined) return { error: 'Invalid Linear response: no data' };

  const issues = getObj(data, 'issues');
  if (issues === undefined) return { error: 'Invalid Linear response: no issues' };

  const nodes = getArr(issues, 'nodes');
  if (nodes === undefined || nodes.length === 0) {
    return { error: `Issue ${issueIdentifier} not found` };
  }

  const raw = nodes[0];
  if (!isObject(raw)) return { error: 'Invalid Linear node' };

  return linearNodeToIssue(raw, issueIdentifier);
};

const linearComment = async (
  issueIdentifier: string,
  comment: string,
  tracker: LinearTrackerConfig,
): Promise<void | { readonly error: string }> => {
  const query = `
    mutation CreateComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }
  `;

  const response = await fetch(tracker.endpoint, {
    method: 'POST',
    headers: { Authorization: tracker.api_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { issueId: issueIdentifier, body: comment } }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    return { error: `Linear comment failed: ${response.status}` };
  }
};

const linearTransition = async (
  issueIdentifier: string,
  targetState: string,
  tracker: LinearTrackerConfig,
): Promise<void | { readonly error: string }> => {
  const stateResponse = await fetch(tracker.endpoint, {
    method: 'POST',
    headers: { Authorization: tracker.api_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        query GetStateId($name: String!) {
          workflowStates(filter: { name: { eq: $name } }, first: 1) {
            nodes { id name }
          }
        }
      `,
      variables: { name: targetState },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!stateResponse.ok) {
    return { error: `Linear state lookup failed: ${stateResponse.status}` };
  }

  const stateBody: unknown = await stateResponse.json();
  const stateId = extractLinearStateId(stateBody);
  if (stateId === undefined) {
    return { error: `State "${targetState}" not found in Linear workflow` };
  }

  const updateResponse = await fetch(tracker.endpoint, {
    method: 'POST',
    headers: { Authorization: tracker.api_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        mutation UpdateIssue($issueId: String!, $stateId: String!) {
          issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
        }
      `,
      variables: { issueId: issueIdentifier, stateId },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!updateResponse.ok) {
    return { error: `Linear transition failed: ${updateResponse.status}` };
  }
};

const extractLinearStateId = (body: unknown): string | undefined => {
  if (!isObject(body)) return undefined;
  const data = getObj(body, 'data');
  if (data === undefined) return undefined;
  const wfStates = getObj(data, 'workflowStates');
  if (wfStates === undefined) return undefined;
  const wfNodes = getArr(wfStates, 'nodes');
  if (wfNodes === undefined || wfNodes.length === 0) return undefined;
  const node = wfNodes[0];
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

  for (const t of transitions) {
    if (!isObject(t)) continue;
    const to = getObj(t, 'to');
    if (to === undefined) continue;
    const name = getStr(to, 'name');
    if (isString(name) && name.toLowerCase() === targetState.toLowerCase()) {
      return getStr(t, 'id');
    }
  }
  return undefined;
};

// ---- Normalization helpers ----

const linearNodeToIssue = (raw: Record<string, unknown>, fallbackIdentifier: string): Issue => {
  const labelsContainer = getObj(raw, 'labels');
  const labelsNodes: Array<{ name: string }> = [];
  if (labelsContainer !== undefined) {
    const nodes = getArr(labelsContainer, 'nodes');
    if (nodes !== undefined) {
      for (const n of nodes) {
        if (!isObject(n)) continue;
        const name = getStr(n, 'name');
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
    labels: labelsNodes.map((l) => l.name.toLowerCase()),
    blocked_by: [],
    created_at: getStr(raw, 'createdAt') ?? null,
    updated_at: getStr(raw, 'updatedAt') ?? null,
  };
};

const jiraPayloadToIssue = (raw: Record<string, unknown>, baseUrl: string): Issue => {
  const fieldsContainer = getObj(raw, 'fields');
  const fields: Record<string, unknown> = fieldsContainer ?? {};

  const priorityContainer = getObj(fields, 'priority');
  let priorityName: string | undefined;
  if (priorityContainer !== undefined) {
    priorityName = getStr(priorityContainer, 'name');
  }

  const statusContainer = getObj(fields, 'status');
  let statusName = 'Unknown';
  if (statusContainer !== undefined) {
    const name = getStr(statusContainer, 'name');
    if (isString(name)) statusName = name;
  }

  const labelsContainer = getArr(fields, 'labels');
  const labels: string[] = labelsContainer !== undefined ? labelsContainer.filter(isString) : [];

  const keyVal = getStr(raw, 'key');

  return {
    id: getStr(raw, 'id') ?? (isString(keyVal) ? keyVal : ''),
    identifier: isString(keyVal) ? keyVal : '',
    title: getStr(fields, 'summary') ?? '',
    description: getStr(fields, 'description') ?? null,
    priority: mapJiraPriority(priorityName),
    state: statusName,
    branch_name: null,
    url: `${baseUrl}/browse/${isString(keyVal) ? keyVal : ''}`,
    labels: labels.map((l) => l.toLowerCase()),
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
