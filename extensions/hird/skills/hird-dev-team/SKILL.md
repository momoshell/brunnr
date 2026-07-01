---
name: hird-dev-team
description: Core Hird dev-team protocol: star topology, tiering, Handover Specs, specialist routing, QA ladder, memory discipline, and HITL gates. Use for any Hird engineering workflow.
license: MIT
compatibility: Requires the Hird extension.
metadata:
  owner: hird
allowed-tools: read grep find ls bash
---
# Hird Dev-Team Protocol

Use this skill whenever operating the Hird engineering retinue.

## Invariants

- Star topology: only the orchestrator talks to the user and dispatches specialists.
- Leads plan; coders execute; reviewers validate.
- Specialists do not talk to each other or write memory.
- Static prompts stay stable; variable task content goes in the spawn prompt.
- Tier 2/3 work is proposed before takeover unless auto mode is active.
- Destructive/external/irreversible actions require explicit confirmation.

## Tiering

- Tier 1: trivial, direct edit, inline validation.
- Tier 2: one domain, domain lead → Handover Spec → coder → QA.
- Tier 3: cross-domain/architecture/phased, explorer → architecture lead → plan review → user approval → domain specs → phased execution → QA.

## Core flows

Use deterministic prompt templates where available:

- `/hird-onboard`
- `/hird-next`
- `/hird-workflow`
- `/hird-handover-lint`
- `/hird-qa-gate`
- `/hird-memory-commit`
- `/hird-ship`

## Output discipline

Every Hird phase should report:

- route/tier used
- agents dispatched
- files changed or inspected
- validation evidence
- QA verdict
- memory changes proposed/committed
- next action or user question
