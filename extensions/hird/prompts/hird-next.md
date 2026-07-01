---
description: Select the next task from the onboarded board/task sources
argument-hint: "[constraints]"
---
Select the next task ONLY from the onboarded project's defined board/task sources.

Constraints/user context: {{args}}
Repository: {{cwd}}

Rules:
1. Read `.pi/hird/onboarding.json` first. If it is missing, incomplete, or has no `task_sources`, stop and tell the user to run `/hird-onboard`. Do not scan arbitrary TODOs, use default GitHub queries, or invent a board.
2. Query only the recorded `task_sources`, in their recorded priority order.
3. Normalize candidate tasks into: source, id, title, link_or_path, status, dependencies, blockers, likely_files, validation_hint, risk.
4. Rank candidates using the recorded `ranking_policy`, plus the user's constraints above.
5. Propose exactly one next task. Do not start implementation or update the board unless the user explicitly confirms. Gate all external board writes.

Output exactly:

## Selected Task
- source:
- id:
- title:
- link_or_path:
- risk:

## Why This Task

## Dependencies and Blockers

## Likely Files

## Validation Approach

## Recommended Hird Route

## Not Started
Confirm that implementation has not started.
