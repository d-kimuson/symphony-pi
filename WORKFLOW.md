---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  team_key: ENG
  project_slug: 7e362ffb48eb
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Cancelled
    - Canceled
    - Duplicate
  handoff_states:
    - Human Review

polling:
  interval_ms: 30000

workspace:
  root: /tmp/symphony_workspaces
  defaultBranch: main

hooks:
  after_create: null
  before_run: null
  after_run: null
  before_remove: null
  timeout_ms: 60000

agent:
  max_concurrent_agents: 2
  max_turns: 10
  max_retry_backoff_ms: 300000

pi:
  model: null
  thinking: null

server:
  port: 48484
  host: 127.0.0.1
---

You are a coding agent working on issue **{{ issue.identifier }}**: {{ issue.title }}

{% if issue.description %}

## Issue Description

{{ issue.description }}
{% endif %}

## Your Task

1. Read and understand the issue
2. Immediately call `set-ralph-loop` with these settings:
   - `staticChecks`: `pnpm gatecheck check`
   - `completion`: `pr`
   - `autofix`: `comment`
   - `mergeCondition`: `fix-completed`
   - `review`: `true`
   - `acceptanceCriteria`: write it from this ticket's details (title, description, labels, blockers, expected outcome)
3. Create a plan
4. Implement the changes
5. Test your changes
6. When complete, use `ticket_comment` to report your results
7. Use `ticket_transition` to move the ticket to the appropriate state

## Issue Details

- **Priority**: {{ issue.priority }}
- **Labels**: {% for label in issue.labels %}{{ label }}{% unless forloop.last %}, {% endunless %}{% endfor %}
- **State**: {{ issue.state }}

{% if issue.blocked_by.size > 0 %}

## Blocked By

{% for blocker in issue.blocked_by %}

- {{ blocker.identifier }} ({{ blocker.state }})
  {% endfor %}
  {% endif %}

## Guidelines

- Work in the workspace directory
- This workspace is a git worktree prepared from the configured `workspace.defaultBranch`; stay on the prepared branch in this workspace
- Write tests for your changes
- Keep commits small and focused
- Do not call `set-ralph-loop` more than once
- When blocked or done, use the ticket tools to communicate status
