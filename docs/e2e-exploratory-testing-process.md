# QA Guideline (Web Application)

## Scope

Behavioral correctness of the fullstack application: Hono REST API, TanStack Start dashboard, and their integration. Type checking, linting, and code quality checks are handled by gatecheck.

## Dev Servers

Use `pueue` for long-running servers unless a server is already running.

| Surface       | Command           | URL                                           |
| ------------- | ----------------- | --------------------------------------------- |
| API server    | `pnpm dev:server` | `http://localhost:8787`                       |
| Web dashboard | `pnpm dev:web`    | Vite default, usually `http://localhost:5173` |

Recommended startup:

```bash
pueue add -- pnpm dev:server
pueue add -- pnpm dev:web
pueue status
```

Health/API checks:

```bash
curl -s http://localhost:8787/info
curl -s http://localhost:8787/api/v1/state
curl -s http://localhost:5173/api/v1/state
```

`/info` exists in the current scaffold. `GET /api/v1/state` is the target status-surface endpoint from `docs/SPEC.md` section 13.7.2.

## Browser E2E Exploratory Testing

Prefer the native browser automation tool available in the agent harness. If it is unavailable, use Playwright CLI.

```bash
npx -y --package '@playwright/cli@latest' -- playwright-cli ...
```

(referred to as `playwright-cli` below)

### Target URL

Use the web dev server URL, normally:

```text
http://localhost:5173
```

The web server proxies `/api` to `http://localhost:8787`.

### Verification Flow

Core loop: `goto` → `snapshot` → identify refs → `click`/`fill` → `snapshot` → check console/network.

```bash
playwright-cli open
playwright-cli goto 'http://localhost:5173'
playwright-cli snapshot
playwright-cli console error
playwright-cli screenshot
```

For interactions after reading snapshot refs:

```bash
playwright-cli click e10
playwright-cli fill e20 'hello'
playwright-cli select e30 'opt1'
playwright-cli snapshot
```

### API Verification

For the status surface, verify both backend and proxied web paths:

```bash
curl -sS http://localhost:8787/api/v1/state | jq .
curl -sS http://localhost:5173/api/v1/state | jq .
```

Expected minimum endpoint: `GET /api/v1/state`, returning current runtime state such as running sessions, retry queue/delays, aggregate runtime/token totals, latest rate limits, and tracked summary fields.

## Automated Test Coverage

1. Identify tests related to the changed code.
2. Review coverage for error cases, boundary values, and semi-normal scenarios.
3. Add focused tests for gaps.
4. Run relevant tests, then final checks from `docs/coding-process.md`.

## Exploratory Testing Notes

- The dashboard is an observability/control surface; orchestrator correctness must not depend on it.
- Long-running poll/orchestrator scenarios should use controlled fixtures/mocks for Linear, Jira, and pi SDK runner behavior when possible.
- Capture console errors and screenshots for UI regressions.
- Stop dev server tasks with `pueue kill` / `pueue remove` after testing.
