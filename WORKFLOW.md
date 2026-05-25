---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: symphony-pi
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
  tools:
    - read
    - bash
    - edit
    - write

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
2. Create a plan
3. Implement the changes
4. Test your changes
5. When complete, use `ticket_comment` to report your results
6. Use `ticket_transition` to move the ticket to the appropriate state

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
- Write tests for your changes
- Keep commits small and focused
- When blocked or done, use the ticket tools to communicate status
