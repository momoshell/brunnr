---
name: hird-memory
description: Hird memory discipline: project/global precedence, single-writer commits, proposals, deprecation, and durable memory hygiene.
license: MIT
compatibility: Requires Hird `hird_memory` tool.
metadata:
  owner: hird
allowed-tools: read grep find ls
---
# Hird Memory

Use this skill when reading, proposing, or committing Hird memory.

## Paths

- Project: `.pi/hird/memory/`
  - `conventions.md`
  - `frontend-notes.md`
  - `backend-notes.md`
  - `devops-notes.md`
  - `qa-notes.md`
  - `architecture-notes.md`
- Global: `~/.pi/hird/memory/conventions.md`

## Rules

- Precedence: code > project memory > global memory.
- Only the orchestrator commits memory.
- Specialists may propose deltas only.
- Do not store secrets, tokens, PII, speculative claims, or task-local trivia.
- Deprecate stale entries instead of deleting them.
- Global memory and cross-cutting conventions require explicit confirmation.

Use `hird_memory` for deterministic read/propose/commit/status actions and `/hird-memory-commit` for structured memory decisions.
