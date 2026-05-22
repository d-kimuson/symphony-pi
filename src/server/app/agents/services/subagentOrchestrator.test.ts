import { describe, expect, it } from 'vitest';

import type { EffectiveConfig } from '../../config/model.js';
import type { Issue } from '../../issues/model.js';

import {
  createSubagentSession,
  buildSubagentPrefix,
  type SubagentRole,
} from './subagentOrchestrator.js';

const testConfig: EffectiveConfig = {
  tracker: {
    kind: 'linear',
    api_key: 'test',
    endpoint: 'https://api.linear.app/graphql',
    project_slug: 'test',
    active_states: ['Todo'],
    terminal_states: ['Done'],
    handoff_states: [],
    transition_states: ['Todo', 'Done'],
  },
  polling: { interval_ms: 30000 },
  workspace: { root: '/tmp/symphony' },
  hooks: {
    after_create: null,
    before_run: null,
    after_run: null,
    before_remove: null,
    timeout_ms: 60000,
  },
  agent: {
    max_concurrent_agents: 10,
    max_turns: 20,
    max_retry_backoff_ms: 300000,
    max_concurrent_agents_by_state: {},
  },
  pi: {
    model: null,
    thinking: null,
    tools: ['read', 'bash', 'edit', 'write'],
    session_dir: null,
    turn_timeout_ms: 3600000,
    stall_timeout_ms: 300000,
  },
  server: { port: 48484, host: '127.0.0.1' },
};

const testIssue: Issue = {
  id: 'issue-1',
  identifier: 'TEST-1',
  title: 'Test Issue',
  description: null,
  priority: 1,
  state: 'Todo',
  branch_name: null,
  url: null,
  labels: [],
  blocked_by: [],
  created_at: null,
  updated_at: null,
};

describe('subagentOrchestrator', () => {
  describe('buildSubagentPrefix', () => {
    it('returns worker prefix for worker role', () => {
      const prefix = buildSubagentPrefix('worker');
      expect(prefix).toContain('worker subagent');
    });

    it('returns reviewer prefix for reviewer role', () => {
      const prefix = buildSubagentPrefix('reviewer');
      expect(prefix).toContain('reviewer subagent');
    });

    it('returns scout prefix for scout role', () => {
      const prefix = buildSubagentPrefix('scout');
      expect(prefix).toContain('scout subagent');
    });

    it('returns oracle prefix for oracle role', () => {
      const prefix = buildSubagentPrefix('oracle');
      expect(prefix).toContain('oracle subagent');
    });
  });

  describe('createSubagentSession', () => {
    it('creates a worker session', async () => {
      const session = await createSubagentSession({
        role: 'worker',
        workspacePath: '/tmp/test-workspace',
        issue: testIssue,
        config: testConfig,
        onEvent: () => {},
      });

      expect(typeof session.sessionId).toBe('string');
      expect(session.sessionId.length).toBeGreaterThan(0);
      expect(typeof session.prompt).toBe('function');
      expect(typeof session.dispose).toBe('function');
    });

    it('creates a reviewer session', async () => {
      const session = await createSubagentSession({
        role: 'reviewer',
        workspacePath: '/tmp/test-workspace',
        issue: testIssue,
        config: testConfig,
        onEvent: () => {},
      });

      expect(session.sessionId).toBeDefined();
    });

    it('creates a scout session', async () => {
      const session = await createSubagentSession({
        role: 'scout',
        workspacePath: '/tmp/test-workspace',
        issue: testIssue,
        config: testConfig,
        onEvent: () => {},
      });

      expect(session.sessionId).toBeDefined();
    });

    it('creates an oracle session', async () => {
      const session = await createSubagentSession({
        role: 'oracle',
        workspacePath: '/tmp/test-workspace',
        issue: testIssue,
        config: testConfig,
        onEvent: () => {},
      });

      expect(session.sessionId).toBeDefined();
    });

    it('all roles are valid SubagentRole', () => {
      const roles: readonly SubagentRole[] = ['worker', 'reviewer', 'scout', 'oracle'];
      for (const role of roles) {
        expect(['worker', 'reviewer', 'scout', 'oracle']).toContain(role);
      }
    });
  });
});
