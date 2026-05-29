# symphony-pi

A long-running automation service that polls issue trackers (Linear / Jira), creates isolated per-issue workspaces, and runs [pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) sessions to execute coding tasks.

Runtime policy is repository-owned: `WORKFLOW.md` contains both YAML front matter for configuration and a prompt body for the coding agent. Symphony reads that file, dispatches eligible issues, and lets the agent use ticket tools to report results back to the tracker.

## How It Works

```
Linear API / Jira REST
   │
   ▼
Issue Tracker Client ──→ Orchestrator ◄── Workflow Loader / Config Layer
                             │  │
                             │  └──→ Runtime Snapshot / HTTP API
                             │
                             ├──→ Workspace Manager ──→ per-issue workspace
                             │
                             └──→ Agent Runner ──────→ pi-coding-agent SDK session
```

1. **Poll**: The orchestrator polls the configured issue tracker at a fixed cadence.
2. **Select**: Eligible issues are active, not already claimed/running, not terminal, and within configured concurrency limits.
3. **Workspace**: A deterministic per-issue workspace is created or reused under the configured workspace root.
4. **Run**: A pi-coding-agent SDK session receives a prompt rendered from `WORKFLOW.md` and runs inside the issue workspace.
5. **Report**: The agent can call `ticket_get`, `ticket_comment`, and `ticket_transition` to read, comment on, and move the issue.
6. **Observe / retry**: The service exposes runtime state over HTTP and retries transient failures with bounded backoff.

A successful run may move an issue to a workflow-defined handoff state such as `Human Review`; it does not have to move directly to `Done`.

## Quick Start

### Prerequisites

- **Node.js** `v24.15.0` (see [`.node-version`](./.node-version))
- **pnpm** `11.2.2` via Corepack (see `packageManager` in [`package.json`](./package.json))

```bash
corepack enable
```

### Installation

```bash
git clone <repo-url>
cd symphony-pi
pnpm install
```

### Configuration

Create `WORKFLOW.md` at the project root, or pass a custom workflow path as the CLI positional argument. A workflow file must include YAML front matter **and** a non-empty prompt body.

Minimal Linear example:

```markdown
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  team_key: $LINEAR_TEAM_KEY
  project_slug: my-project
---

You are a coding agent working on issue {{ issue.identifier }}: {{ issue.title }}.

Read the issue, implement the requested changes, test your work, comment with the result, and transition the ticket to the appropriate state.
```

Set the required environment variables:

```bash
export LINEAR_API_KEY=your-linear-api-key
export LINEAR_TEAM_KEY=your-linear-team-key
```

For Jira, use `tracker.kind: jira` with the Jira-specific fields and set `JIRA_EMAIL` / `JIRA_API_TOKEN` as needed.

For a repository-backed workspace, configure `hooks.after_create` to attach a git worktree from the repo that owns `WORKFLOW.md`:

```yaml
hooks:
  after_create: |
    set -eu

    repo_root="$SYMPHONY_WORKFLOW_DIR"
    branch_name="feature/$(printf '%s' "$SYMPHONY_WORKSPACE_KEY" | tr '[:upper:]' '[:lower:]')"

    git -C "$repo_root" fetch origin main
    git -C "$repo_root" worktree add -B "$branch_name" "$SYMPHONY_WORKSPACE_PATH" origin/main
```

Hook processes run with these helper environment variables:

- `SYMPHONY_WORKFLOW_PATH`
- `SYMPHONY_WORKFLOW_DIR`
- `SYMPHONY_WORKSPACE_PATH`
- `SYMPHONY_WORKSPACE_KEY`

`pi.tools` is optional. If you omit it (or set it to `[]`), Symphony leaves pi's default tool set unrestricted and still adds the required ticket tools. Configure `pi.tools` only when you want an explicit allowlist.

See [`WORKFLOW.md`](./WORKFLOW.md) for this repository's active workflow and [`docs/SPEC.md`](./docs/SPEC.md) for the full workflow/configuration contract.

### Running

```bash
# Development mode: server + Vite dashboard
pnpm dev

# Server only, with Node watch mode
pnpm dev:server

# Custom preferred server port
pnpm dev:server -- --port 9999

# Custom workflow file (positional argument)
pnpm dev:server -- ./custom/WORKFLOW.md

# Dashboard only (Vite dev server)
pnpm dev:web
```

Default server binding comes from `WORKFLOW.md`: `127.0.0.1:48484`. The HTTP server uses get-port semantics, so the selected port may differ if the preferred port is unavailable.

Notes:

- `pnpm dev` runs both server and web dashboard scripts.
- The backend `GET /` route serves a lightweight inline status page.
- The React/TanStack dashboard runs through Vite during development and reads `/api/v1/state`.
- Vite currently proxies `/api` to `http://localhost:48484`; keep the backend on that port for dashboard development or update the proxy in [`vite.config.ts`](./vite.config.ts).

## API Endpoints

| Method | Path                  | Description                                                        |
| ------ | --------------------- | ------------------------------------------------------------------ |
| GET    | `/`                   | Lightweight backend status page / dashboard UI                     |
| GET    | `/info`               | Health check (`{ status: "healthy", server: "symphony-pi" }`)      |
| GET    | `/api/v1/state`       | Runtime snapshot: running sessions, retries, totals, rate limits   |
| GET    | `/api/v1/:identifier` | In-memory runtime lookup for an issue; does not fetch tracker data |
| POST   | `/api/v1/refresh`     | Request an immediate poll tick                                     |

## Project Structure

```
src/
├── main.ts                    # Production entry point
├── lib/                       # Shared utilities and contracts
├── server/
│   ├── app.ts                 # Hono app construction
│   ├── cli.ts                 # CLI argument parsing
│   ├── routes.ts              # Top-level routes
│   ├── server.ts              # HTTP server startup (get-port)
│   └── app/
│       ├── agents/            # pi-coding-agent SDK integration and ticket tools
│       ├── config/            # Effective config resolution and validation
│       ├── issues/            # Issue model, tracker adapters, and fetch workflows
│       │   └── adapters/      # Linear and Jira adapters
│       ├── orchestrator/      # Poll loop, scheduling, retry, reconciliation state
│       ├── status/            # Runtime snapshot and status/control API
│       ├── workflow/          # WORKFLOW.md parser/loader
│       └── workspaces/        # Per-issue workspace management and hooks
└── web/                       # Vite/TanStack Start/React dashboard
    └── app/
```

## Commands

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `pnpm dev`             | Start server and dashboard in parallel       |
| `pnpm dev:server`      | Start server only with Node watch mode       |
| `pnpm dev:web`         | Start Vite dashboard dev server only         |
| `pnpm build`           | Build server (`dist/`) then web (`dist/web`) |
| `pnpm build:server`    | Bundle server entry with tsdown              |
| `pnpm build:web`       | Build dashboard into `dist/web`              |
| `pnpm typecheck`       | Run TypeScript type checking                 |
| `pnpm lint`            | Run oxlint and oxfmt checks                  |
| `pnpm fix`             | Auto-fix supported lint/format issues        |
| `pnpm test`            | Run the Vitest test suite                    |
| `pnpm test:coverage`   | Run tests with coverage                      |
| `pnpm gatecheck check` | Run the repository quality gate              |

## Operational Model

- **Tracker state**: Active, terminal, handoff, and transition states are configured in `WORKFLOW.md`.
- **Concurrency**: Global and per-state concurrency limits are enforced by the orchestrator.
- **Retries**: Normal continuations and failures are retried with bounded delays.
- **Workspaces**: Workspace paths are deterministic per issue and can be prepared/cleaned with lifecycle hooks.
- **No database**: Runtime scheduling state is in memory; workspaces and tracker state provide restart recovery boundaries.
- **Agent integration**: Agent sessions are created through the public `@earendil-works/pi-coding-agent` SDK surface.

## Documentation

- [`docs/SPEC.md`](./docs/SPEC.md) — Full service specification
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — Implementation roadmap
- [`docs/coding-guideline.md`](./docs/coding-guideline.md) — Coding philosophy
- [`docs/coding-process.md`](./docs/coding-process.md) — Development process and Definition of Done
- [`docs/commit_message.md`](./docs/commit_message.md) — Commit conventions
- [`docs/branch_naming.md`](./docs/branch_naming.md) — Branch naming conventions
- [`docs/e2e-exploratory-testing-process.md`](./docs/e2e-exploratory-testing-process.md) — E2E exploratory testing process

## Tech Stack

- **Runtime**: Node.js, TypeScript
- **Backend**: [Hono](https://hono.dev/), `@earendil-works/pi-coding-agent`, Commander, TypeBox, Valibot, YAML, LiquidJS
- **Frontend**: [TanStack Start](https://tanstack.com/start), [React](https://react.dev/), [shadcn/ui](https://ui.shadcn.com/), [Tailwind CSS](https://tailwindcss.com/)
- **Testing**: [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/) browser provider
- **Tooling**: pnpm, gatecheck, oxlint, oxfmt, lefthook

## License

MIT — See [LICENSE](./LICENSE).
