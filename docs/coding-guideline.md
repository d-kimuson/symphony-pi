# Coding Guideline

Design philosophies behind this codebase. Syntax and mechanical style are enforced by `oxlint`, `oxfmt`, TypeScript, and `dev/lints/conventions.js`.

## Type-Driven Correctness

Maximize what `pnpm typecheck` can catch at compile time.

- Use TypeScript strict mode via `@tsconfig/strictest`; avoid `any`, unsafe assertions, and implicit truthy/falsy checks.
- Model domain variants with discriminated unions when states diverge (for example orchestrator run state, retry state, tracker result state).
- Prefer `readonly` data and immutable transformations. Keep mutable state narrowly scoped to orchestrator/runtime closures.
- Prefer `type` aliases over `interface` and use type-only imports for types.
- Use `as const satisfies` for literal config, response fixtures, and typed constant tables.

## Layered Architecture

The project is a single package with explicit source layers.

- `src/lib/`: shared utilities and pure/domain logic. Must not import `src/server/` or `src/web/`.
- `src/server/`: Hono REST API, server startup, adapters, and backend integration boundaries. May import `src/lib/`.
- `src/web/`: TanStack Start static dashboard and browser-side API client. May import `src/lib/`; may import `src/server/` types only for Hono client typing.

Module boundaries are enforced by `dev/lints/conventions.js`:

- server → lib is allowed.
- web → lib is allowed.
- web → server is allowed only as type-only imports.
- lib → server/web is prohibited.
- Barrel files that only re-export from `index.ts`/`index.tsx` are prohibited.

## Functional Style by Default

Use functions over classes for ordinary behavior.

- `func-style` requires function expressions/arrow functions instead of function declarations.
- Keep route handlers and entry points thin: validate/parse input → call domain/service logic → serialize response.
- Keep side effects at boundaries: Hono handlers, Linear/Jira clients, filesystem workspace manager, pi-coding-agent SDK runner, logging.
- Classes are acceptable for platform conventions such as custom `Error` types; do not introduce stateful service classes by default.

## API and Web Integration

- Backend routes expose Hono route types; the web API client should consume them via `hc` with type-only imports.
- The dashboard is an observability/control surface and must not become required for orchestrator correctness.
- The service selects an HTTP port from preferred default `48484` using get-port semantics; keep web API configuration aligned with the selected server URL.

## Testing Strategy

- Unit tests are colocated next to source files as `*.test.ts` / `*.test.tsx`; do not use `__tests__/` directories.
- Vitest has two projects: browser-mode tests for `src/web/**/*.test.{ts,tsx}` and unit tests for everything else.
- Prefer pure/domain tests for workflow parsing, config getters, scheduler decisions, workspace path derivation, and retry logic.
- Mock external systems at adapter boundaries: Linear GraphQL, Jira REST, filesystem, pi SDK runner, and clock/timer behavior.
