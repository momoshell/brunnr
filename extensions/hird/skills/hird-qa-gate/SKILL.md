---
name: hird-qa-gate
description: Hird deterministic QA gate and review-depth ladder. Use after implementation or before shipping to produce pass/changes-needed/block verdicts.
license: MIT
compatibility: Requires Hird reviewer agents.
metadata:
  owner: hird
allowed-tools: read grep find ls bash
---
# Hird QA Gate

Use this skill for post-implementation gates and ship readiness.

## Review ladder

- Standard: risk 0–1 and no deep trigger → `hird-code-reviewer`.
- Deep: any deep trigger or risk ≥ 2 → `hird-code-reviewer-deep`.
- Adversarial panel: risk ≥ 3 or at least two deep triggers → correctness/security/rollback lenses.

Deep triggers: auth/authz, secrets, encryption, tokens, sessions, payments, PII, DB migrations, destructive ops, CI/CD, infra, production deploy, public API/contract changes, security incidents/hotfixes.

## Verdict discipline

A valid review begins with one line: `verdict: pass` or `verdict: changes-needed`.
No verdict means inconclusive and should be rerun or treated as changes-needed.

Use `/hird-qa-gate` for deterministic output sections.
