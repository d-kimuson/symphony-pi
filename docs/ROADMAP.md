# Implementation Roadmap

この roadmap は `docs/SPEC.md` を実装するための作業順序です。上から順に進めれば、各段階で型・テスト・境界が固まった状態で次へ進められるようにしています。

## 0. 前提と方針

- Coding agent integration は pi 専用。
  - `@earendil-works/pi-coding-agent` の exported SDK surface を使う。
  - `@earendil-works/pi-agent-core` 直利用、Codex app-server、RPC subprocess は実装しない。
- Tracker は Linear と Jira の両方を必須実装にする。
- Orchestrator は tracker reader / scheduler / runner であり、ticket write の business logic は agent toolchain に置く。
- HTTP server / runtime snapshot / status surface は必須 observability として扱う。
- 永続 DB は使わない。retry/running state は in-memory、restart recovery は tracker + workspace から行う。

## 1. 依存関係と実行基盤

### 1.1 dependencies を追加

`package.json` に runtime dependency を追加する。

- `@earendil-works/pi-coding-agent`
- `get-port`
- `yaml`

必要なら validation 用に軽量 schema library を追加してもよいが、まずは TypeScript ADT + 手書き parser で十分。

### 1.2 server port selection を実装

対象:

- `src/server/server.ts`
- `src/server/main.ts`
- `src/server/app/config/*`

要件:

- default preferred port: `48484`
- `get-port` semantics で空き port を選ぶ
- CLI `--port` がある場合は `server.port` より優先し、同じく preferred port として扱う
- bind host default: `127.0.0.1`
- 選ばれた port を operator-visible log に出す

テスト:

- port 未指定なら `48484` を preferred port として渡す
- CLI `--port` が workflow config より優先される
- port selection 結果が server startup に渡る

## 2. Core domain contracts を先に固める

対象ディレクトリ案:

- `src/server/app/issues/model.ts`
- `src/server/app/config/model.ts`
- `src/server/app/workflow/model.ts`
- `src/server/app/agents/model.ts`
- `src/server/app/orchestrator/model.ts`
- `src/server/app/workspaces/model.ts`

実装する型:

- `Issue`
- `BlockerRef`
- `TrackerKind = 'linear' | 'jira'`
- `TrackerConfig = LinearTrackerConfig | JiraTrackerConfig`
- `EffectiveConfig`
- `Workspace`
- `RunAttempt`
- `LiveSession`
- `RetryEntry`
- `OrchestratorState`
- `AgentRunnerEvent`
- `TrackerAdapter`
- `AgentRunner`

重要な設計:

- `TrackerConfig` は discriminated union にする。
- `Issue` は tracker 非依存の normalized model にする。
- `session_id` は `pi:<thread_id>:<turn_id>` 形式。
- `transition_states` default は `active_states + terminal_states + handoff_states`。

テスト:

- state name normalization
- workspace key sanitization
- transition state default merge
- session id composition

## 3. WORKFLOW.md loader / config layer

対象:

- `src/server/app/workflow/*`
- `src/server/app/config/*`

要件:

- workflow file path precedence
  1. explicit runtime path
  2. cwd の `WORKFLOW.md`
- YAML front matter は必須
- prompt body 空は `workflow_empty_prompt`
- `$VAR_NAME` は明示された config value のみ解決
- path は `~` と相対 path を解決
- unknown top-level keys は無視
- invalid reload は last known good effective config を維持

Config fields:

- `tracker.kind`: `linear` / `jira`
- Linear: `endpoint`, `api_key`, `project_slug`
- Jira: `base_url`, `email`, `api_key`, `project_key | jql`
- `active_states`, `terminal_states`, `handoff_states`, `transition_states`
- `polling.interval_ms`
- `workspace.root`
- `hooks.*`, `hooks.timeout_ms`
- `agent.max_concurrent_agents`, `agent.max_turns`, retry settings
- `pi.model`, `pi.thinking`, `pi.tools`, `pi.session_dir`, timeouts
- `server.port`, `server.host`

テスト:

- missing workflow
- missing front matter
- invalid YAML
- non-map front matter
- empty prompt
- env var resolution
- path expansion
- Linear validation
- Jira validation
- server port default `48484`
- dynamic reload last-good behavior

## 4. Tracker adapters

### 4.1 Adapter interface

対象:

- `src/server/app/issues/adapters/trackerAdapter.ts`

Interface:

```ts
export type TrackerAdapter = {
  fetchCandidateIssues: () => Promise<readonly Issue[]>;
  fetchIssuesByStates: (stateNames: readonly string[]) => Promise<readonly Issue[]>;
  fetchIssueStatesByIds: (issueIds: readonly string[]) => Promise<readonly Issue[]>;
};
```

### 4.2 Linear adapter

対象:

- `src/server/app/issues/adapters/linear/*`

要件:

- GraphQL endpoint default: `https://api.linear.app/graphql`
- `Authorization` header
- `project_slug` -> Linear `slugId`
- candidate query は project filter + active states
- pagination required, page size default 50
- blockers は inverse relation `blocks` から normalize
- labels lowercase
- priority integer/null
- ISO timestamp parse

テスト:

- query variables
- pagination
- blockers normalization
- labels normalization
- GraphQL errors mapping
- malformed payload mapping

### 4.3 Jira adapter

対象:

- `src/server/app/issues/adapters/jira/*`

要件:

- `base_url` + Jira REST search
- Jira Cloud Basic auth: `email` + `api_key`
- `jql` があれば base candidate scope とする
- `jql` がなければ `project_key` + `active_states` から JQL を組み立てる
- adapter は最終的に normalized `state` が `active_states` の issue だけ返す
- pagination required, page size default 50
- `identifier` は Jira key
- `url` は `<base_url>/browse/<key>`
- blockers は blocking issue links から normalize

テスト:

- JQL build
- configured JQL + active state filtering
- pagination
- blocker links normalization
- priority mapping
- auth header
- non-2xx / malformed payload error mapping

## 5. Workspace manager / hooks

対象:

- `src/server/app/workspaces/*`
- `src/server/lib/fs/*`
- `src/server/lib/process/*`

要件:

- workspace path: `<workspace.root>/<sanitized_issue_identifier>`
- root containment validation
- create/reuse workspace
- `after_create` only when newly created
- `before_run` fatal on failure/timeout
- `after_run` logs and ignores failure
- `before_remove` logs and ignores failure, cleanup continues
- workspace population is hook-driven only
- partially prepared new workspace is left in place on failure

テスト:

- sanitize identifier
- root containment rejects traversal
- existing dir reuse
- non-directory path handling policy
- hook ordering
- hook timeout
- cleanup behavior

## 6. pi-coding-agent SDK runner

対象:

- `src/server/app/agents/*`
- `src/server/app/agents/adapters/pi/*`

要件:

- import from `@earendil-works/pi-coding-agent`
- use package-level SDK exports, not `@earendil-works/pi-agent-core`
- normally create sessions with `createAgentSession({ cwd: workspacePath, ... })`
- keep pi default settings/auth/model/resource discovery unless Symphony config explicitly overrides
- use `pi.session_dir` when configured; otherwise pi default
- enable `pi.tools` plus Symphony ticket tools
- subscribe to session events and emit normalized `AgentRunnerEvent`
- synthetic ids:
  - `thread_id = session.sessionId`
  - `turn_id = turn-<n>`
  - `session_id = pi:<thread_id>:<turn_id>`
- `session.prompt()` resolution marks Symphony turn complete
- pi `turn_end` alone does not complete Symphony turn
- enforce `pi.turn_timeout_ms`
- dispose session when worker run ends

Ticket tools:

- `ticket_get`
- `ticket_comment`
- `ticket_transition`

`ticket_transition` rules:

- target state must be in `tracker.transition_states`
- target must be valid according to tracker API
- business policy is project/workflow-driven:
  - work projects can transition to `handoff_states` such as `Human Review`
  - private projects can auto-merge via workflow tooling and transition to terminal states such as `Done`

テスト:

- session created with workspace cwd
- event normalization
- synthetic session ids
- prompt resolution vs `turn_end`
- timeout failure
- ticket tool allowlist and target validation
- unsupported tool failure does not stall

## 7. Prompt rendering

対象:

- `src/server/app/workflow/*`
- `src/server/app/agents/*`

要件:

- strict template rendering
- variables:
  - `issue`
  - `attempt`
- unknown variable/filter is error
- first turn uses full rendered prompt
- continuation turns use continuation guidance and existing pi session

テスト:

- issue fields render
- labels/blockers iteration
- unknown variable fails
- attempt null / retry value
- continuation prompt generation

## 8. Orchestrator

対象:

- `src/server/app/orchestrator/*`

要件:

- single authoritative in-memory state
- poll tick sequence:
  1. reconcile running issues
  2. validate config
  3. fetch candidates
  4. sort
  5. dispatch while slots remain
  6. notify observability/status
- eligibility:
  - required fields exist
  - state in active and not terminal
  - not running/claimed
  - slots available
  - Todo blockers terminal-only
- sorting:
  1. priority ascending
  2. created_at oldest
  3. identifier lexicographic
- retry:
  - normal continuation retry 1000ms
  - failure retry exponential `min(10000 * 2^(attempt - 1), max_retry_backoff_ms)`
- reconciliation:
  - stall detection from `last_agent_timestamp` or `started_at`
  - terminal state stops run + cleanup
  - non-active/non-terminal stops run without cleanup
  - active state updates in-memory snapshot
- startup cleanup removes terminal workspaces

テスト:

- candidate sorting
- blocker rule
- global slots
- per-state slots
- claimed/running dedupe
- normal retry
- exponential retry cap
- terminal cleanup
- non-active stop without cleanup
- stalled session retry
- refresh failure keeps workers running

## 9. Observability / HTTP / dashboard

対象:

- `src/server/app/status/*`
- `src/server/app/logs/*`
- `src/server/routes.ts`
- `src/web/*`

Server requirements:

- HTTP server starts during service startup
- default preferred port: `48484`
- port selected with `get-port` semantics
- bind host default: `127.0.0.1`
- runtime snapshot includes:
  - running rows
  - retrying rows
  - `agent_totals`
  - latest rate limits
- endpoints:
  - `GET /`
  - `GET /api/v1/state`
  - `GET /api/v1/<issue_identifier>`
  - `POST /api/v1/refresh`

Web requirements:

- dashboard reads `/api/v1/state`
- dashboard is observability/control surface only
- scheduler correctness must not depend on frontend

テスト:

- route response shapes
- 404 issue details
- refresh coalescing behavior
- selected port logging
- dashboard smoke test where useful

## 10. Real integration profile

Run only when credentials/network are explicitly available.

Linear:

- `LINEAR_API_KEY`
- isolated project slug
- test issue(s) in active/terminal states

Jira:

- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- isolated `base_url` + project key or JQL
- test issue(s) in active/terminal states

Checks:

- candidate fetch
- state refresh
- terminal fetch
- ticket tool smoke tests in isolated issues if safe

Skipped real integration checks must be reported as skipped, not passed.

## 11. Suggested implementation order

1. Add dependencies and fix server port selection.
2. Define core domain ADTs and tests.
3. Implement workflow/config parser and validation.
4. Implement workspace manager and hooks.
5. Implement fake tracker + fake agent runner for orchestrator tests.
6. Implement orchestrator against interfaces.
7. Implement HTTP status API and dashboard wiring.
8. Implement Linear adapter.
9. Implement Jira adapter.
10. Implement pi SDK runner and ticket tools.
11. Wire service startup end-to-end.
12. Run real integration profile manually before production use.

## 12. Required check commands

Run after each implementation slice:

```bash
pnpm typecheck
pnpm lint:oxlint
pnpm lint:oxfmt
pnpm test
```

If `pnpm lint:oxfmt` fails because of unrelated existing files, do not silently reformat the entire tree. Report the unrelated files and only format files touched by the current slice unless the task explicitly allows broader formatting.
