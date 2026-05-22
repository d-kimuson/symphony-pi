# Coding Process

## Recommended Coding Process

Use a short TDD loop with strict checks as feedback.

1. Read the relevant part of `docs/SPEC.md` and identify the contract to implement.
2. Add or update focused tests first when behavior is non-trivial.
3. Implement in the smallest layer that owns the behavior.
4. Run the narrowest relevant check (`pnpm test`, `pnpm typecheck`, or a targeted Vitest command).
5. Run `pnpm gatecheck check` and fix all findings before considering the task complete.

For cross-layer work, keep contracts explicit: parse/validate at the boundary, pass typed plain data through domain logic, and isolate I/O in adapters.

## Definition of Done

On task completion, verify task-specific acceptance criteria and all of the following:

```bash
pnpm gatecheck check
pnpm typecheck
pnpm lint
pnpm test
```

Additional checks when relevant:

- Web changes: `pnpm build:web`
- API/status-surface changes: manually check `GET /api/v1/state` once implemented
- Fullstack behavior changes: run both dev servers and perform E2E exploratory verification from `docs/e2e-exploratory-testing-process.md`

## Notable Commands

| Command                | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `pnpm gatecheck check` | Run project gate checks against changed files/all target |
| `pnpm typecheck`       | Type check with tsgo                                     |
| `pnpm lint`            | Run oxlint and oxfmt check                               |
| `pnpm fix`             | Auto-fix lint/format issues                              |
| `pnpm test`            | Run Vitest projects                                      |
| `pnpm dev:server`      | Start Hono Node.js dev server on port 8787               |
| `pnpm dev:web`         | Start Vite/TanStack Start dev server with `/api` proxy   |
| `pnpm build:web`       | Build/pre-render the TanStack Start static app           |
| `pnpm prepare`         | Install lefthook hooks                                   |

Long-running dev servers/watchers should be started via `pueue`, for example:

```bash
pueue add -- pnpm dev:server
pueue add -- pnpm dev:web
```
