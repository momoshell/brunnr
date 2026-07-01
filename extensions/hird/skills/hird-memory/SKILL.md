---
name: hird-memory
description: "Hird memory discipline. Use when reading, proposing, or committing durable project/global conventions with single-writer control and redaction hygiene."
license: "MIT"
compatibility: "Requires Hird `hird_memory` tool."
metadata:
  owner: "hird"
  maturity: "bundled"
  reads:
    - .pi/hird/memory/**
    - ~/.pi/hird/memory/conventions.md
  writes:
    - .pi/hird/memory/**
    - ~/.pi/hird/memory/conventions.md
  network: false
  destructive: false
  requires-approval:
    - global memory commits
    - cross-cutting convention changes
    - deprecating existing memory
allowed-tools: "read grep find ls"
---
# Hird Memory

## Purpose

Use this skill when reading, proposing, or committing Hird memory. Memory is durable guidance, not a scratchpad.

## When to use

- Before relying on long-term project conventions.
- When a lead/reviewer discovers a reusable convention that future Hird runs should know.
- During `/hird-memory-commit` after resolving conflicts and confirming durability.

## When not to use

- Do not store task-local notes, speculation, TODOs, guesses, secrets, credentials, tokens, PII, or copied code.
- Do not use memory to override repository code or explicit user instruction.
- Do not commit memory in parallel with another memory write.

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
- Deprecate stale entries instead of deleting them.
- Global memory and cross-cutting conventions require explicit confirmation.

## Redaction gate

Before proposing or committing memory, scan the delta for:

- secrets, credentials, tokens, passwords, API keys, private keys
- PII or email addresses
- `.env`-style key/value material
- task-local trivia
- speculative language such as “maybe”, “guess”, “not sure”, “temporary”, or “TODO”

If present, reject the memory delta and report the redaction or rewrite needed. Memory must be durable, evidence-backed, and reusable across future tasks.

## Workflow

1. Read relevant project and global memory.
2. Compare against repository code and current user instruction.
3. Decide whether the proposed delta is durable and evidence-backed.
4. Check redaction gate.
5. Use `hird_memory propose` for pending deltas or `commit` only after approval/conflict resolution.
6. Commit one file at a time.

## Safety gates

Ask before global memory commits, cross-cutting convention changes, deprecating existing memory, or writing anything outside the declared memory paths.

## Output format

For memory decisions, report:

- `verdict: commit | propose | reject | no-op`
- target path
- durable evidence
- redactions required, if any
- committed/proposed proposal id, if any

Use `hird_memory` for deterministic read/propose/commit/status actions and `/hird-memory-commit` for structured memory decisions.
