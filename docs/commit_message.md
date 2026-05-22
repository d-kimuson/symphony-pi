# Commit Message Convention

No project commit history exists yet, so use Conventional Commits as the default.

## Format

```text
<type>(<scope>): <description>

[optional body in Japanese]
```

## Types

| Type       | When to use                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | New feature or capability                               |
| `fix`      | Bug fix                                                 |
| `chore`    | Tooling, CI, dependencies, generated setup              |
| `docs`     | Documentation only                                      |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or updating tests                                |

## Scope

Scope is optional. For this single-package app, use the layer or feature area.

Examples: `server`, `web`, `lib`, `orchestrator`, `workflow`, `linear`, `workspace`, `agent`, `docs`, `tooling`.

## Rules

- First line: `<type>(<scope>): <description>`; keep it under 72 characters.
- Description: English, imperative/lowercase start, no period.
- Body: Japanese by default. Explain why, trade-offs, and operational notes; do not restate the diff.
- Reference Linear/GitHub issue IDs in the body when useful.
- Use `!` for breaking changes only when the contract changes intentionally.

## Examples

Good:

```text
feat(orchestrator): add retry queue state

一時的な Linear/API エラーから復帰できるように、実行待ちとは別に
retry queue を保持する。backoff 計算は後続の dispatcher 実装で利用する。
```

```text
fix(web): handle empty running sessions

初期状態のダッシュボードで running 配列が空のときにも、状態カードを
表示できるようにする。
```

```text
chore(tooling): add gatecheck configuration
```

Bad:

- `Fixed bug` — type がなく曖昧。
- `feat: Add new feature for the automation orchestrator and dashboard` — 長く、説明が抽象的。
- `update` — type も対象もない。
