# Branch Naming Convention

No project branch history exists yet, so use a small prefix convention by default.

## Format

```text
<type>/<short-description>
```

## Types

| Type      | When to use                                                                 |
| --------- | --------------------------------------------------------------------------- |
| `feature` | New feature or capability                                                   |
| `fix`     | Bug fix                                                                     |
| `chore`   | Tooling, CI, docs, dependencies, setup, refactoring without behavior change |

## Rules

- Use lowercase with hyphens as word separators.
- Keep descriptions short and concrete, usually 2-5 words.
- Include an issue number when applicable: `<type>/<issue>-<description>`.
- Prefer feature area words from the codebase: `server`, `web`, `orchestrator`, `workflow`, `linear`, `workspace`, `agent`.

## Examples

Good:

- `feature/orchestrator-poll-loop`
- `feature/linear-client`
- `fix/workspace-path-sanitization`
- `chore/setup-gatecheck`
- `feature/SYM-123-agent-runner`

Bad:

- `Feature/AddOrchestrator` — uppercase and no hyphen separation.
- `fix` — no description.
- `my-branch` — no type prefix.
