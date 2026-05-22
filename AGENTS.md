# AGENTS.md (symphony-pi)

## Architecture

symphony-pi is a single-package fullstack TypeScript application for a long-running automation service. The backend is a Hono Node.js REST API under `src/server/` (default preferred port `48484`, selected with get-port semantics), the frontend is a TanStack Start static dashboard under `src/web/`, and shared code lives under `src/lib/`. The service polls Linear or Jira, creates isolated per-issue workspaces, and runs pi-coding-agent SDK sessions according to repo-owned `WORKFLOW.md` policy.

```
Linear API / Jira REST
   |
   v
Issue Tracker Client ---> Orchestrator <--- Workflow Loader / Config Layer
                           |      |
                           |      +--> Logging / Runtime Snapshot / Status Surface / HTTP API
                           |
                           +--> Workspace Manager --> per-issue workspace
                           |
                           +--> Agent Runner -------> @earendil-works/pi-coding-agent SDK session
```

- Architecture follows the SPEC component split: Workflow Loader, Config Layer, Issue Tracker Client, Orchestrator, Workspace Manager, Agent Runner, Status Surface, and Logging/HTTP observability.
- `src/server/` may depend on `src/lib/`; `src/web/` may depend on `src/lib/` and may import `src/server/` types only; `src/lib/` must remain independent.
- Runtime state is owned by the orchestrator; external systems are Linear API, Jira REST API, local filesystem workspaces/logs, and pi-coding-agent SDK sessions. There is no database.
- Agent integration MUST use the exported SDK surface from `@earendil-works/pi-coding-agent` (`createAgentSession`, resource/settings/auth/session helpers). Do not integrate through Codex app-server, RPC subprocesses, or `@earendil-works/pi-agent-core` directly.

## Reference

Read only when needed; do not load everything upfront.

- Product/service specification: docs/SPEC.md
- Implementation roadmap: docs/ROADMAP.md
- Coding guideline (design philosophy): docs/coding-guideline.md
- Coding process and Definition of Done: docs/coding-process.md
- Commit message conventions: docs/commit_message.md
- Branch naming conventions: docs/branch_naming.md
- E2E exploratory testing process: docs/e2e-exploratory-testing-process.md
