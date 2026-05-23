# symphony-pi

A long-running automation service that polls issue trackers (Linear / Jira), creates isolated per-issue workspaces, and runs [pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) sessions to execute coding tasks.

## How It Works

```
Linear API / Jira REST
   │
   ▼
Issue Tracker Client ──→ Orchestrator ◄── Workflow Loader / Config Layer
                             │  │
                             │  └──→ Logging / Runtime Snapshot / HTTP API
                             │
                             └──→ Workspace Manager ──→ per-issue workspace
                             │
                             └──→ Agent Runner ──────→ pi-coding-agent SDK session
```

1. **Poll**: The orchestrator polls the issue tracker at a configurable interval.
2. **Dispatch**: Eligible issues (active state, not already running, slots available) are dispatched to workers.
3. **Workspace**: A per-issue workspace directory is created/reused under the workspace root.
4. **Agent**: A pi-coding-agent SDK session runs the task prompt rendered from `WORKFLOW.md` using the issue data.
5. **Complete**: The agent uses ticket tools (`ticket_comment`, `ticket_transition`) to report results and move tickets to handoff/terminal states.

The entire runtime policy — tracker config, polling cadence, concurrency, template prompt, and hooks — is owned by a single repository file: `WORKFLOW.md`.

## Quick Start

### Prerequisites

- **Node.js** ≥ 24 (see [`.node-version`](./.node-version))
- **pnpm** ≥ 10 (`corepack enable` recommended)

### Installation

```bash
git clone <repo-url>
cd symphony-pi
pnpm install
```

### Configuration

Create `WORKFLOW.md` at the project root (or point to a custom path with `--workflow-path`). Minimum required:

```yaml
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: my-project
---
```

Set the required environment variable:

```bash
export LINEAR_API_KEY=your-linear-api-key
```

For the tracker schema reference, see the [Workflow Specification](./WORKFLOW.md) and [`docs/SPEC.md`](./docs/SPEC.md).

### Running

```bash
# Development mode (server + dashboard)
pnpm dev

# Server only
pnpm dev:server

# Custom port
pnpm dev:server -- --port 9999

# Custom workflow file
pnpm dev:server -- --workflow-path ./custom/WORKFLOW.md
```

The dashboard is served at `http://127.0.0.1:<port>` (default preferred port: `48484`). The JSON API for programmatic access is at `/api/v1/*`.

## API Endpoints

| Method | Path                     | Description                |
| ------ | ------------------------ | -------------------------- |
| GET    | `/`                      | Dashboard UI               |
| GET    | `/api/v1/state`          | Runtime snapshot (JSON)    |
| GET    | `/api/v1/:identifier`    | Per-issue details (JSON)   |
| POST   | `/api/v1/refresh`        | Trigger immediate poll     |

## Project Structure

```
src/
├── main.ts                    # Entry point
├── lib/                       # Shared utilities
├── server/
│   ├── app.ts                 # Hono app
│   ├── cli.ts                 # CLI args
│   ├── routes.ts              # Route setup
│   ├── server.ts              # HTTP server (get-port)
│   └── app/
│       ├── agents/            # Agent runner (pi SDK integration)
│       ├── config/            # Config layer & dynamic reload
│       ├── issues/            # Issue model & tracker adapters
│       │   └── adapters/      # Linear + Jira adapters
│       ├── logs/              # Structured logging
│       ├── orchestrator/      # Poll loop & state machine
│       ├── status/            # Runtime snapshot API
│       ├── workflow/          # WORKFLOW.md loader
│       └── workspaces/        # Workspace manager & hooks
└── web/                       # Dashboard (TanStack Start + React)
    └── app/
```

## Commands

| Command                | Description                        |
| ---------------------- | ---------------------------------- |
| `pnpm dev`             | Start server + dashboard in parallel |
| `pnpm dev:server`      | Start server only (with watch)     |
| `pnpm dev:web`         | Start dashboard dev server only    |
| `pnpm build:web`       | Build dashboard for production     |
| `pnpm typecheck`       | TypeScript type checking           |
| `pnpm test`            | Run test suite (vitest)            |
| `pnpm test:coverage`   | Run tests with coverage report     |
| `pnpm lint`            | Run oxlint + oxfmt check           |
| `pnpm fix`             | Auto-fix lint/format issues        |
| `pnpm gatecheck check` | Run all quality gates              |

## Documentation

- [`docs/SPEC.md`](./docs/SPEC.md) — Full service specification
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — Implementation roadmap
- [`docs/coding-guideline.md`](./docs/coding-guideline.md) — Coding philosophy
- [`docs/coding-process.md`](./docs/coding-process.md) — Development process & Definition of Done
- [`docs/commit_message.md`](./docs/commit_message.md) — Commit conventions
- [`docs/v0-report.md`](./docs/v0-report.md) — v0 implementation report

## Tech Stack

- **Runtime**: Node.js, TypeScript
- **Backend**: [Hono](https://hono.dev/) (HTTP framework), `@earendil-works/pi-coding-agent` (SDK)
- **Frontend**: [TanStack Start](https://tanstack.com/start), [React](https://react.dev/), [shadcn/ui](https://ui.shadcn.com/), [Tailwind CSS](https://tailwindcss.com/)
- **Testing**: [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/) (for browser component tests)
- **Tooling**: oxlint, oxfmt, lefthook, gatecheck

## License

MIT — See [LICENSE](./LICENSE).
