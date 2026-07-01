---
name: hird-board
description: "Deterministic board and next-task selection for Hird. Use only onboarded task sources and ranking policy; never invent tasks or boards."
license: "MIT"
compatibility: "Requires `.pi/hird/onboarding.json` from Hird onboarding."
metadata:
  owner: "hird"
allowed-tools: "read grep find ls bash"
---
# Hird Board and Next Task

Use this skill for `/hird-next` and any board/task-source operation.

## Rules

- Read `.pi/hird/onboarding.json` first.
- If onboarding is missing/incomplete or `task_sources` is empty, stop and tell the user to run `/hird-onboard`.
- Query only recorded task_sources, in priority order.
- Do not scan arbitrary TODOs, use default issue queries, or invent a board.
- Rank candidates using the recorded ranking_policy plus user constraints.
- Propose one next task; do not start implementation or write to boards without confirmation.

## Candidate shape

- source
- id
- title
- link_or_path
- status
- dependencies
- blockers
- likely_files
- validation_hint
- risk

## Safety gates

Ask before writing to external boards, changing task status, creating tickets, or treating non-onboarded TODOs as task sources.

## Failure handling

If `.pi/hird/onboarding.json` is missing, incomplete, stale, or ambiguous, stop with `verdict: blocked` and tell the user to run `/hird-onboard`.

## Required output

Use the `/hird-next` template sections exactly.
