import { Octokit, type RestEndpointMethodTypes } from '@octokit/rest';

import type { GitHubTrackerConfig } from '../../config/model.ts';
import type { Issue } from '../model.ts';

export type GitHubApiError =
  | { readonly type: 'github_api_request'; readonly message: string }
  | { readonly type: 'github_api_status'; readonly status: number; readonly message: string }
  | { readonly type: 'github_unknown_payload' }
  | { readonly type: 'github_invalid_issue_identifier'; readonly message: string };

type GitHubListIssue = RestEndpointMethodTypes['issues']['listForRepo']['response']['data'][number];
type GitHubIssue = RestEndpointMethodTypes['issues']['get']['response']['data'];

type GitHubNativeState = 'open' | 'closed';

const DEFAULT_PAGE_SIZE = 100;

export const fetchGitHubCandidateIssues = async (
  config: GitHubTrackerConfig,
): Promise<readonly Issue[] | GitHubApiError> => {
  const issuesByNumber = new Map<number, Issue>();

  for (const stateName of config.active_states) {
    const nativeState = toNativeStateName(stateName);
    const result = await listGitHubIssues(config, {
      state: nativeState ?? 'open',
      labels: nativeState === null ? stateName : undefined,
    });

    if ('type' in result) return result;

    for (const rawIssue of result) {
      const issue = normalizeGitHubIssue(rawIssue, config);
      if (issue === null) continue;
      if (!matchesState(issue.state, config.active_states)) continue;
      issuesByNumber.set(rawIssue.number, issue);
    }
  }

  return [...issuesByNumber.values()];
};

export const fetchGitHubIssuesByStates = async (
  config: GitHubTrackerConfig,
  stateNames: readonly string[],
): Promise<readonly Issue[] | GitHubApiError> => {
  if (stateNames.length === 0) return [];

  const issuesByNumber = new Map<number, Issue>();

  for (const stateName of stateNames) {
    const nativeState = toNativeStateName(stateName);
    const result = await listGitHubIssues(config, {
      state: nativeState ?? 'all',
      labels: nativeState === null ? stateName : undefined,
    });

    if ('type' in result) return result;

    for (const rawIssue of result) {
      const issue = normalizeGitHubIssue(rawIssue, config);
      if (issue === null) continue;
      if (!matchesState(issue.state, stateNames)) continue;
      issuesByNumber.set(rawIssue.number, issue);
    }
  }

  return [...issuesByNumber.values()];
};

export const fetchGitHubIssueStatesByIds = async (
  config: GitHubTrackerConfig,
  issueIds: readonly string[],
): Promise<readonly Issue[] | GitHubApiError> => {
  if (issueIds.length === 0) return [];

  const issues: Issue[] = [];

  for (const issueId of issueIds) {
    const rawIssue = await getGitHubRawIssue(config, issueId);
    if (!('number' in rawIssue)) return rawIssue;

    const issue = normalizeGitHubIssue(rawIssue, config);
    if (issue !== null) {
      issues.push(issue);
    }
  }

  return issues;
};

export const getGitHubIssue = async (
  issueIdentifier: string,
  config: GitHubTrackerConfig,
): Promise<Issue | GitHubApiError> => {
  const rawIssue = await getGitHubRawIssue(config, issueIdentifier);
  if (!('number' in rawIssue)) return rawIssue;

  const issue = normalizeGitHubIssue(rawIssue, config);
  if (issue === null) {
    return { type: 'github_unknown_payload' };
  }

  return issue;
};

export const commentOnGitHubIssue = async (
  issueIdentifier: string,
  comment: string,
  config: GitHubTrackerConfig,
): Promise<void | GitHubApiError> => {
  const issueNumber = parseGitHubIssueIdentifier(issueIdentifier, config);
  if (issueNumber === null) {
    return {
      type: 'github_invalid_issue_identifier',
      message: `Unsupported GitHub issue identifier: ${issueIdentifier}`,
    };
  }

  const octokit = createGitHubClient(config);

  try {
    await octokit.rest.issues.createComment({
      owner: config.owner,
      repo: config.repo,
      issue_number: issueNumber,
      body: comment,
    });
  } catch (error: unknown) {
    return mapGitHubError(error);
  }
};

export const transitionGitHubIssue = async (
  issueIdentifier: string,
  targetState: string,
  config: GitHubTrackerConfig,
): Promise<void | GitHubApiError> => {
  const rawIssue = await getGitHubRawIssue(config, issueIdentifier);
  if (!('number' in rawIssue)) return rawIssue;

  const targetNativeState = getTargetNativeState(targetState, config);
  const stateLabelNames = getConfiguredStateLabelNames(config);
  const preservedLabels = getRawLabelNames(rawIssue.labels).filter(
    (labelName) => !matchesState(labelName, stateLabelNames),
  );
  const nextLabels = isNativeStateName(targetState)
    ? preservedLabels
    : [...preservedLabels, targetState];

  const octokit = createGitHubClient(config);

  try {
    await octokit.rest.issues.setLabels({
      owner: config.owner,
      repo: config.repo,
      issue_number: rawIssue.number,
      labels: nextLabels,
    });

    if (rawIssue.state !== targetNativeState) {
      await octokit.rest.issues.update({
        owner: config.owner,
        repo: config.repo,
        issue_number: rawIssue.number,
        state: targetNativeState,
      });
    }
  } catch (error: unknown) {
    return mapGitHubError(error);
  }
};

const listGitHubIssues = async (
  config: GitHubTrackerConfig,
  options: {
    readonly state: 'open' | 'closed' | 'all';
    readonly labels?: string;
  },
): Promise<readonly GitHubListIssue[] | GitHubApiError> => {
  const octokit = createGitHubClient(config);
  const issues: GitHubListIssue[] = [];
  let page = 1;

  try {
    while (true) {
      const response = await octokit.rest.issues.listForRepo({
        owner: config.owner,
        repo: config.repo,
        state: options.state,
        labels: options.labels,
        sort: 'created',
        direction: 'asc',
        per_page: DEFAULT_PAGE_SIZE,
        page,
      });

      issues.push(...response.data);

      if (response.data.length < DEFAULT_PAGE_SIZE) {
        return issues;
      }

      page += 1;
    }
  } catch (error: unknown) {
    return mapGitHubError(error);
  }
};

const getGitHubRawIssue = async (
  config: GitHubTrackerConfig,
  issueIdentifier: string,
): Promise<GitHubIssue | GitHubApiError> => {
  const issueNumber = parseGitHubIssueIdentifier(issueIdentifier, config);
  if (issueNumber === null) {
    return {
      type: 'github_invalid_issue_identifier',
      message: `Unsupported GitHub issue identifier: ${issueIdentifier}`,
    };
  }

  const octokit = createGitHubClient(config);

  try {
    const response = await octokit.rest.issues.get({
      owner: config.owner,
      repo: config.repo,
      issue_number: issueNumber,
    });
    return response.data;
  } catch (error: unknown) {
    return mapGitHubError(error);
  }
};

const createGitHubClient = (config: GitHubTrackerConfig): Octokit =>
  new Octokit({ auth: config.token, baseUrl: config.api_base_url });

const normalizeGitHubIssue = (
  rawIssue: GitHubListIssue,
  config: GitHubTrackerConfig,
): Issue | null => {
  if (isPullRequestPayload(rawIssue)) {
    return null;
  }

  const labels = getRawLabelNames(rawIssue.labels).map((label) => label.toLowerCase());
  const labelState = findConfiguredStateLabel(labels, config.transition_states);

  return {
    id: String(rawIssue.number),
    identifier: `#${rawIssue.number}`,
    title: rawIssue.title,
    description: typeof rawIssue.body === 'string' ? rawIssue.body : null,
    priority: null,
    state: labelState ?? rawIssue.state,
    branch_name: null,
    url: rawIssue.html_url,
    labels,
    blocked_by: [],
    created_at: typeof rawIssue.created_at === 'string' ? rawIssue.created_at : null,
    updated_at: typeof rawIssue.updated_at === 'string' ? rawIssue.updated_at : null,
  };
};

const findConfiguredStateLabel = (
  labelNames: readonly string[],
  transitionStates: readonly string[],
): string | null => {
  for (const transitionState of transitionStates) {
    if (isNativeStateName(transitionState)) continue;
    if (matchesState(transitionState, labelNames)) {
      return transitionState;
    }
  }

  return null;
};

const getConfiguredStateLabelNames = (config: GitHubTrackerConfig): readonly string[] =>
  config.transition_states.filter((stateName) => !isNativeStateName(stateName));

const getTargetNativeState = (
  targetState: string,
  config: GitHubTrackerConfig,
): GitHubNativeState => {
  const nativeState = toNativeStateName(targetState);
  if (nativeState !== null) {
    return nativeState;
  }

  if (config.close_on_terminal && matchesState(targetState, config.terminal_states)) {
    return 'closed';
  }

  return 'open';
};

const getRawLabelNames = (labels: GitHubListIssue['labels']): readonly string[] => {
  const names: string[] = [];

  for (const label of labels ?? []) {
    if (typeof label === 'string') {
      names.push(label);
      continue;
    }

    if (typeof label.name === 'string') {
      names.push(label.name);
    }
  }

  return names;
};

const isPullRequestPayload = (issue: GitHubListIssue): boolean => issue.pull_request !== undefined;

const parseGitHubIssueIdentifier = (
  issueIdentifier: string,
  config: GitHubTrackerConfig,
): number | null => {
  const trimmed = issueIdentifier.trim();
  const simpleMatch = /^#?(\d+)$/.exec(trimmed);
  if (simpleMatch !== null) {
    return Number(simpleMatch[1]);
  }

  const scopedMatch = /^([^/]+)\/([^#]+)#(\d+)$/.exec(trimmed);
  if (scopedMatch === null) {
    return null;
  }

  if (scopedMatch[1] !== config.owner || scopedMatch[2] !== config.repo) {
    return null;
  }

  return Number(scopedMatch[3]);
};

const isNativeStateName = (stateName: string): boolean => toNativeStateName(stateName) !== null;

const toNativeStateName = (stateName: string): GitHubNativeState | null => {
  const lowered = stateName.toLowerCase();
  if (lowered === 'open' || lowered === 'closed') {
    return lowered;
  }

  return null;
};

const matchesState = (stateName: string, candidates: readonly string[]): boolean => {
  const lowered = stateName.toLowerCase();
  return candidates.some((candidate) => candidate.toLowerCase() === lowered);
};

const mapGitHubError = (error: unknown): GitHubApiError => {
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    return {
      type: 'github_api_status',
      status: error.status,
      message: error.message,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return { type: 'github_api_request', message };
};
