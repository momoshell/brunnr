---
name: hird-onboarding
description: Deterministic project onboarding for Hird: discover repo setup, validation commands, memory, task board sources, ranking policy, and next-task rules before project work.
license: MIT
compatibility: Requires the Hird extension.
metadata:
  owner: hird
allowed-tools: read grep find ls bash
---
# Hird Onboarding

Use this skill before project-related Hird work, especially before selecting a next task.

## Required inputs

- repository root
- user context or goal
- allowed external sources, if any

## Deterministic steps

1. Read project guidance: `AGENTS.md`, `CLAUDE.md`, `README*`, package/tool files, CI files, test docs, current git state, and `.pi/hird/memory/*`.
2. Discover task sources in priority order: explicit local boards, repo docs, configured issue trackers. Never invent a board.
3. Propose `.pi/hird/onboarding.json` with project_summary, setup_commands, validation_commands, task_sources, ranking_policy, next_task_rules, memory_files, last_confirmed_at.
4. HITL gate before creating/updating onboarding state or committing memory.
5. After confirmation, commit durable memory using `hird_memory`.

## Safety gates

Do not create or update `.pi/hird/onboarding.json`, commit memory, or query/write external issue trackers until the user explicitly confirms the proposed onboarding state and allowed task sources.

## Failure handling

If task sources cannot be verified, leave them empty and ask the user to define them. `/hird-next` must remain blocked until onboarding records explicit sources.

## Required output

Use the `/hird-onboard` template sections exactly.
