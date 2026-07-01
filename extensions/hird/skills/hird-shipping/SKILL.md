---
name: hird-shipping
description: "Hird shipping readiness protocol: git state, validation, QA verdicts, docs, rollback, and external-action gates."
license: "MIT"
compatibility: "Requires Hird extension."
metadata:
  owner: "hird"
allowed-tools: "read grep find ls bash"
---
# Hird Shipping

Use this skill for `/hird-ship` and release readiness checks.

## Deterministic steps

1. Check current git state and changed files.
2. Confirm each task/spec has QA pass or a documented blocker.
3. Run or verify required validation commands.
4. Check docs, changelog, release notes, and onboarding/board status.
5. Identify rollback plan and operational risks.
6. Produce ship/no-ship/ship-after-actions recommendation.
7. Gate external or destructive actions.

## No pass without evidence

Recommend `ship` only when git state is understood, required validation passed or is explicitly impossible with reason, QA gate result is `pass`, missing evidence is `none`, and release/rollback risk is documented. Conditional QA is not ship.

## Safety gates / HITL required before

- push, merge, release tag, deploy;
- migrations or rollback;
- changelog publication;
- external board status update;
- user/customer notification;
- destructive cleanup.

## Failure handling

Use `no-ship` for blockers or unsafe uncertainty. Use `ship-after-actions` only when exact remaining actions are listed and can be re-gated before release.

Use `/hird-ship` for exact output sections.
