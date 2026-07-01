---
name: hird-qa-gate
description: "Hird deterministic QA gate and review-depth ladder. Use after implementation or before shipping to produce pass/changes-needed/blocked/conditional verdicts with evidence."
license: "MIT"
compatibility: "Requires Hird reviewer agents and read-only validation tools."
metadata:
  owner: "hird"
  maturity: "bundled"
  reads:
    - .pi/hird/**
    - git diff/status
    - source files in scope
    - test/build/lint output
  writes: []
  network: false
  destructive: false
  requires-approval:
    - running expensive or external validation
    - destructive commands
allowed-tools: "read grep find ls bash"
---
# Hird QA Gate

## Purpose

Use this skill for post-implementation gates, pre-ship review, and deterministic readiness decisions.

## When to use

- After a coder or test engineer completes a Handover Spec.
- Before `/hird-ship` recommends shipping.
- When a user asks for a structured review of a task, diff, branch, or release candidate.

## When not to use

- Do not use it as an implementation planner.
- Do not mark pass without inspecting the relevant diff, files, and validation evidence.
- Do not run destructive, external, or release actions without explicit confirmation.

## Review ladder

- Standard: risk 0–1 and no deep trigger → `hird-code-reviewer`.
- Deep: any deep trigger or risk ≥ 2 → `hird-code-reviewer-deep`.
- Adversarial panel: risk ≥ 3 or at least two deep triggers → correctness/security/rollback lenses.

Deep triggers: auth/authz, secrets, encryption, tokens, sessions, payments, PII, DB migrations, destructive ops, CI/CD, infra, production deploy, public API/contract changes, security incidents/hotfixes.

## QA gate contract

A QA gate is valid only if all required fields are present:

- `result`: pass | changes-needed | blocked | conditional
- `review_depth`: standard | deep | adversarial-panel
- `reviewer_verdicts`: one or more reviewer outputs, each beginning exactly with `verdict: pass` or `verdict: changes-needed`
- `validation_evidence`: commands run, not run, or impossible with reason
- `missing_evidence`: explicit list, use `none` only when verified
- `blocking_findings`: explicit list, use `none` only when verified

Treat malformed, missing, truncated, stale, or inconclusive reviewer output as `changes-needed`. `conditional` is not pass; list the exact next action.

## Verdict discipline

A valid reviewer output begins with one line: `verdict: pass` or `verdict: changes-needed`.
No verdict means inconclusive and must be rerun or treated as changes-needed.

Use `blocked` for security risk, data loss risk, broken public contract, unsafe migration/deploy risk, secret exposure, or inability to inspect required scope.

## Workflow

1. Identify scope, changed files, acceptance criteria, and validation requirements.
2. Select standard/deep/adversarial review depth.
3. Run or inspect deterministic validation evidence where safe.
4. Dispatch reviewers with exact scope and required leading verdict.
5. Parse reviewer verdicts strictly.
6. Produce the `/hird-qa-gate` output contract.

## Safety gates

Ask before running external services, expensive integration tests, migrations, deployments, destructive commands, or network writes.

## Output format

Use `/hird-qa-gate` for the canonical output sections. Never summarize as complete unless `result: pass` and missing evidence is `none`.

## Failure handling

- Missing diff or scope → `blocked` if review cannot proceed, otherwise `changes-needed`.
- Missing validation → `changes-needed` unless impossible with a documented reason.
- Conflicting reviewer outputs → choose the stricter result and list required next action.
