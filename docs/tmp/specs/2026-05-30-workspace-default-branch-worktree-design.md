# Workspace defaultBranch and built-in git worktree design

## Summary

This design moves git worktree preparation from repo-owned `hooks.after_create` into Symphony's built-in workspace lifecycle.

The new behavior is:

- `workspace.defaultBranch` is added to `WORKFLOW.md` as a required setting.
- New workspaces are created as git worktrees from `origin/<defaultBranch>`.
- The workspace branch name is generated as `symphony-pi/<nanoid7>`.
- Branch name collisions are handled by regenerating NanoID and retrying.
- Reused workspaces keep using the existing worktree as-is.
- Workspace removal uses git worktree removal, not raw directory deletion.
- `hooks.after_create` remains available as a post-worktree setup hook.

## Goals

- Make git worktree creation a first-class Symphony responsibility.
- Remove hard-coded `origin/main` setup logic from repo-owned hooks.
- Validate the default branch at config-load time.
- Keep lifecycle boundaries clear between workspace management and git operations.
- Preserve `after_create` as an extension point for setup tasks such as dependency installation.

## Non-goals

- Using tracker-provided `issue.branch_name` for workspace branch creation.
- Adding a toggle to disable built-in worktree behavior.
- Preserving old hook-based worktree provisioning as an alternative mode.
- Changing the semantics of `before_run`, `after_run`, or `before_remove` beyond the worktree-aware deletion path.

## Current problem

Today the application only creates the workspace directory and invokes `hooks.after_create`. The actual git worktree creation lives in repo-owned shell code in `WORKFLOW.md`, including a hard-coded `origin/main` dependency.

That causes the most important part of workspace initialization to live outside the application contract, outside TypeScript validation, and outside the workspace lifecycle implementation.

## Decisions

### 1. Config contract

`workspace` will become:

```yaml
workspace:
  root: /tmp/symphony_workspaces
  defaultBranch: main
```

Rules:

- `workspace.defaultBranch` is required.
- Missing, empty, or non-string values are configuration errors.
- Errors are surfaced during config loading/resolution, before orchestration starts.

## 2. Responsibility split

### Config layer

Owns parsing, validation, and resolution of `workspace.defaultBranch`.

### Workspace workflow layer

Owns workspace lifecycle orchestration:

- determine whether a workspace is new or reused
- invoke built-in git worktree creation for new workspaces
- invoke lifecycle hooks in the correct order
- invoke built-in git worktree removal for cleanup

This layer should not embed git command details.

### Git worktree service layer

A dedicated service owns git-specific behavior:

- resolve the real git repository root
- fetch / resolve `origin/<defaultBranch>`
- generate `symphony-pi/<nanoid7>` branch names
- retry on branch-name collision
- create the git worktree
- remove the git worktree

`hooks.after_create` is not part of this service. It remains a workspace lifecycle extension point that runs only after built-in worktree creation succeeds.

## 3. Repository root resolution

The application must not assume `WORKFLOW.md` sits at the git root.

For git operations, Symphony resolves the repository root by running:

```bash
git rev-parse --show-toplevel
```

The command is run from the workflow directory, and the resolved top-level path becomes the git-operation base for worktree creation and removal.

If this resolution fails, workspace preparation fails.

## 4. Workspace creation flow

For a newly created workspace:

1. Load and resolve workflow config.
2. Validate `workspace.root` and required `workspace.defaultBranch`.
3. Derive `workspace_key` and deterministic workspace path.
4. Resolve the actual git repository root from the workflow directory.
5. Prepare the source branch reference from `origin/<defaultBranch>`.
6. Generate a branch name `symphony-pi/<nanoid7>`.
7. Attempt `git worktree add` from `origin/<defaultBranch>` onto the workspace path.
8. If the branch name collides, generate a new NanoID and retry.
9. After built-in worktree creation succeeds, run `hooks.after_create` if configured.
10. Continue with `before_run`, agent execution, and `after_run` as today.

Notes:

- The workspace path stays deterministic per issue identifier.
- The branch name is intentionally non-deterministic.
- `issue.branch_name` is ignored by this design.

## 5. Reuse flow

When the workspace already exists and is being reused:

- Symphony does not recreate the worktree.
- Symphony reuses the existing workspace and its existing branch/worktree state.
- `hooks.after_create` does not run again.

This keeps the current lifecycle rule that `after_create` is only for newly created workspaces.

## 6. Branch naming

Branch names use this fixed format:

```text
symphony-pi/<nanoid7>
```

Requirements:

- NanoID length is fixed at 7.
- The `symphony-pi/` prefix is always present.
- On collision, Symphony regenerates the NanoID and retries automatically.
- Retry logic must be bounded and must surface a clear error if the retry budget is exhausted.

The exact retry budget is an implementation detail, but it must be explicit in code and tests.

## 7. Hook behavior

`hooks.after_create` stays supported.

Its role changes from “optionally create a worktree” to “run post-worktree setup inside the prepared workspace”. Typical uses include:

- `pnpm install`
- repo-specific bootstrap
- local tool initialization

Execution order:

1. built-in git worktree creation
2. `hooks.after_create`

If built-in worktree creation fails, `after_create` must not run.

## 8. Workspace removal flow

Workspace cleanup becomes git-aware.

Flow:

1. Run `before_remove` if configured.
2. Resolve the git repository root.
3. Remove the workspace through git worktree management.
4. Surface failures as worktree-removal failures rather than masking them with raw recursive deletion.

The preferred removal path is `git worktree remove`.

Symphony must not silently fall back to `rm -rf` in a way that can leave `.git/worktrees/*` inconsistent.

## 9. Error handling

### Config errors

Fail configuration loading when:

- `workspace.defaultBranch` is missing
- `workspace.defaultBranch` is empty
- `workspace.defaultBranch` is not a string

### Workspace preparation errors

Fail workspace preparation when:

- repository root resolution fails
- `origin/<defaultBranch>` cannot be fetched or resolved
- branch creation/worktree creation fails
- branch-name collision retry budget is exhausted
- `hooks.after_create` fails after a new worktree has been created

### Cleanup expectations on failure

For newly created workspaces, Symphony should clean up partial state created by the built-in preparation path as far as safely possible.

Examples of partial state include:

- an empty workspace directory
- a created branch without a usable worktree
- an incomplete worktree registration

For reused workspaces, failures must not destructively reset or remove the existing workspace.

### Removal failures

If git-based worktree removal fails, surface the failure explicitly. Do not hide it behind unconditional filesystem deletion.

## 10. Observability

At minimum, logs should capture:

- resolved git repository root
- configured `workspace.defaultBranch`
- generated branch name
- collision retry count when relevant
- worktree creation failure reason
- worktree removal failure reason

These details are important because worktree setup becomes a built-in platform responsibility rather than opaque shell behavior.

## 11. Proposed implementation shape

The external behavior should be simple, but internals should keep git logic isolated.

A natural structure is:

- `src/server/app/config/*`
  - add and validate `workspace.defaultBranch`
- `src/server/app/workspaces/services/*`
  - add a git worktree service for repository-root resolution, branch generation, create, and remove
- `src/server/app/workspaces/workflows/*`
  - orchestrate workspace creation/reuse/removal and call the git worktree service
- `src/server/app/orchestrator/workflows/pollTick.ts`
  - keep sequencing correct around new-workspace setup and hook execution

The exact filenames may vary, but the architectural rule is stable:

- workspace workflows orchestrate
- git service executes git behavior
- hooks extend post-create setup

## 12. Testing strategy

### Config tests

Add tests for:

- `workspace.defaultBranch` required
- missing value rejected
- empty string rejected
- invalid type rejected
- valid string resolved into effective config

### Git worktree service tests

Add tests for:

- repository root resolution success/failure
- branch name format `symphony-pi/<nanoid7>`
- collision retry behavior
- `origin/<defaultBranch>` based worktree creation command path
- worktree removal command path
- failure propagation

### Workspace/orchestrator tests

Add tests for:

- new workspace triggers built-in worktree creation
- `after_create` runs only after successful built-in worktree creation
- reused workspace does not recreate the worktree
- preparation failure blocks agent execution
- removal path uses git worktree removal

### Regression tests

Keep existing behavior intact for:

- `before_run`
- `after_run`
- `before_remove`
- dirty-worktree inspection after agent completion

## 13. Documentation updates after implementation

Implementation should update at least:

- `WORKFLOW.md`
- `README.md`
- `docs/SPEC.md` if the canonical spec should reflect the new built-in worktree contract

## Acceptance criteria for the implementation plan

A later implementation plan based on this design should deliver all of the following:

- `workspace.defaultBranch` exists and is required
- new workspaces are created from `origin/<defaultBranch>` by built-in logic
- branch names use `symphony-pi/<nanoid7>` with collision retry
- reused workspaces are left unchanged
- `after_create` runs only after successful built-in setup
- workspace removal uses git worktree semantics
- tests cover config, lifecycle, and git failure cases
