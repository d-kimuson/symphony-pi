/** Pure helpers for typed config getters and validation rules. */

import type { WorkflowDefinition } from '../../workflow/model.js';
import type { EffectiveConfig, TrackerConfig } from '../model.js';

import {
  resolveWorkspaceRoot,
  resolveTransitionStates,
  resolveEnvVar,
} from '../../workflow/services/resolveWorkflowConfig.js';

/** Helper: get a sub-object from config as Record or undefined */
const getObj = (obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined => {
  const val = obj[key];
  if (val === null || typeof val !== 'object' || Array.isArray(val)) return undefined;
  // oxlint-disable-next-line no-unsafe-type-assertion
  return val as Record<string, unknown>;
};

/**
 * Resolve a config value from the raw YAML front matter with type coercion and defaults.
 */
export const resolveEffectiveConfig = (
  workflow: WorkflowDefinition,
  workflowDir: string,
): EffectiveConfig => {
  const c = workflow.config;
  const trackerSection = getObj(c, 'tracker') ?? {};

  const trackerKind =
    typeof trackerSection['kind'] === 'string' ? trackerSection['kind'] : 'linear';

  const activeStates: readonly string[] = ensureStringArray(trackerSection['active_states']) ?? [
    'Todo',
    'In Progress',
  ];
  const terminalStates: readonly string[] = ensureStringArray(
    trackerSection['terminal_states'],
  ) ?? ['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done'];
  const handoffStates: readonly string[] =
    ensureStringArray(trackerSection['handoff_states']) ?? [];
  const transitionStates: readonly string[] =
    ensureStringArray(trackerSection['transition_states']) ??
    resolveTransitionStates(activeStates, terminalStates, handoffStates);

  const trackerConfig = buildTrackerConfig(
    trackerKind,
    trackerSection,
    activeStates,
    terminalStates,
    handoffStates,
    transitionStates,
  );

  const pollingSection = getObj(c, 'polling') ?? {};
  const workspaceSection = getObj(c, 'workspace') ?? {};
  const hooksSection = getObj(c, 'hooks') ?? {};
  const agentSection = getObj(c, 'agent') ?? {};
  const piSection = getObj(c, 'pi') ?? {};
  const serverSection = getObj(c, 'server') ?? {};

  const workspaceRootStr =
    typeof workspaceSection['root'] === 'string' ? workspaceSection['root'] : undefined;

  return {
    tracker: trackerConfig,
    polling: {
      interval_ms: ensurePositiveInt(pollingSection['interval_ms']) ?? 30000,
    },
    workspace: {
      root: resolveWorkspaceRoot(workspaceRootStr, workflowDir),
    },
    hooks: {
      after_create: ensureStringOrNull(hooksSection['after_create']),
      before_run: ensureStringOrNull(hooksSection['before_run']),
      after_run: ensureStringOrNull(hooksSection['after_run']),
      before_remove: ensureStringOrNull(hooksSection['before_remove']),
      timeout_ms: ensurePositiveInt(hooksSection['timeout_ms']) ?? 60000,
    },
    agent: {
      max_concurrent_agents: ensurePositiveInt(agentSection['max_concurrent_agents']) ?? 10,
      max_turns: ensurePositiveInt(agentSection['max_turns']) ?? 20,
      max_retry_backoff_ms: ensurePositiveInt(agentSection['max_retry_backoff_ms']) ?? 300000,
      max_concurrent_agents_by_state: ensureStringNumMap(
        agentSection['max_concurrent_agents_by_state'],
      ),
    },
    pi: {
      model: ensureStringOrNull(piSection['model']),
      thinking: ensureStringOrNull(piSection['thinking']),
      tools: ensureStringArray(piSection['tools']) ?? ['read', 'bash', 'edit', 'write'],
      session_dir: ensureStringOrNull(piSection['session_dir']),
      turn_timeout_ms: ensurePositiveInt(piSection['turn_timeout_ms']) ?? 3600000,
      stall_timeout_ms: ensureInt(piSection['stall_timeout_ms']) ?? 300000,
    },
    server: {
      port: ensurePort(serverSection['port']) ?? 48484,
      host: ensureString(serverSection['host']) ?? '127.0.0.1',
    },
  };
};

const buildTrackerConfig = (
  kind: string,
  tracker: Record<string, unknown>,
  activeStates: readonly string[],
  terminalStates: readonly string[],
  handoffStates: readonly string[],
  transitionStates: readonly string[],
): TrackerConfig => {
  if (kind === 'jira') {
    return {
      kind: 'jira',
      api_key: resolveApiKey('jira', tracker),
      email: resolveEnvVar(ensureString(tracker['email']) ?? '$JIRA_EMAIL'),
      base_url: ensureString(tracker['base_url']) ?? '',
      project_key: ensureStringOrNull(tracker['project_key']),
      jql: ensureStringOrNull(tracker['jql']),
      active_states: activeStates,
      terminal_states: terminalStates,
      handoff_states: handoffStates,
      transition_states: transitionStates,
    };
  }

  return {
    kind: 'linear',
    api_key: resolveApiKey('linear', tracker),
    endpoint: ensureString(tracker['endpoint']) ?? 'https://api.linear.app/graphql',
    project_slug: ensureString(tracker['project_slug']) ?? '',
    active_states: activeStates,
    terminal_states: terminalStates,
    handoff_states: handoffStates,
    transition_states: transitionStates,
  };
};

const resolveApiKey = (kind: string, tracker: Record<string, unknown>): string => {
  const rawKey = ensureString(tracker['api_key']) ?? '';
  const resolved = resolveEnvVar(rawKey);

  if (resolved.length > 0) return resolved;

  // Try canonical environment variable
  const envVar = kind === 'linear' ? 'LINEAR_API_KEY' : 'JIRA_API_TOKEN';
  return process.env[envVar] ?? '';
};

// --- Type coercion helpers ---

const ensureString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const ensureStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const ensureInt = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) ? value : undefined;

const ensurePositiveInt = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  return value > 0 ? value : undefined;
};

const ensureStringArray = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === 'string');
  return strings;
};

const ensureStringNumMap = (value: unknown): Readonly<Record<string, number>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const map: Record<string, number> = {};
  // oxlint-disable-next-line no-unsafe-type-assertion
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'number' && Number.isInteger(val) && val > 0) {
      map[key.toLowerCase()] = val;
    }
  }
  return map;
};

const ensurePort = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  return value >= 1 && value <= 65535 ? value : undefined;
};
