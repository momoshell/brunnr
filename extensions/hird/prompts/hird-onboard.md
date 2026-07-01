---
description: Onboard Hird to this project and define task/board sources
argument-hint: "[project context or goal]"
---
Run PROJECT ONBOARDING for this repository.

User context: {{args}}
Repository: {{cwd}}

Onboarding owns all project-related setup, including next-task/board discovery. Do not implement product code during onboarding unless the user explicitly asks.

## Public transcript discipline

User-visible output must be concise status and evidence only. Do not expose scratchpad-style narration, uncertainty loops, or tool-output troubleshooting such as “Investigating bash output”, “Maybe output was truncated”, “I’m checking why”, or speculative hypotheses about command behavior.

When tool output is long, truncated, malformed, missing, or surprising, do not narrate the investigation. Continue with tools silently where appropriate, then report only the stable result as:

`Evidence note: <source/command> was <truncated|empty|unavailable|inconclusive>; using <specific fallback or limitation>.`

Deterministic flow:
1. Inspect project guidance and setup: AGENTS.md, CLAUDE.md, README, package/tool files, CI, tests, current git state, and existing `.pi/hird` memory/state.
2. Discover the task/board source of truth in priority order. Check explicit local board/backlog files first, then repo docs, then available issue tracker references/CLI config. Do not invent a board.
3. Produce a proposed onboarding record for `.pi/hird/onboarding.json` containing: status, project_summary, setup_commands, validation_commands, task_sources[], ranking_policy, next_task_rules, memory_files, and last_confirmed_at.
4. HITL gate: summarize discovered setup, task sources, ranking policy, and proposed `/hird-next` behavior. Wait for explicit confirmation before creating or updating `.pi/hird/onboarding.json` or committing onboarding memory.
5. After confirmation, bootstrap/update Hird memory using `hird_memory` when durable conventions are found.

Output exactly:

## Onboarding Summary

## Source-of-Truth Files

## Setup and Validation Commands

## Proposed Task Sources

## Proposed Ranking Policy

## Memory Updates Proposed

## Evidence Notes

## HITL Confirmation Needed

## Recommended Next Action
