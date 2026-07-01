---
name: "hird-migration-safety"
description: "Hird migration safety protocol. Use when reviewing database, schema, data, storage, queue, config, or backward-incompatible migrations for deploy, rollback, and data-loss risk."
license: "MIT"
compatibility: "Requires migration files, application code, and deployment context. Running migrations requires explicit approval."
metadata:
  owner: "hird"
  maturity: "bundled"
  domain: "migration-safety"
  reads:
    - "migration files"
    - "models, queries, and data access code"
    - "deployment and rollback documentation"
    - "test and seed fixtures"
  writes: []
  network: false
  destructive: false
  requires-approval:
    - "running migrations or rollbacks"
    - "data mutation scripts"
    - "production or staging access"
    - "destructive schema changes"
allowed-tools: "read grep find ls bash"
---
# Hird Migration Safety

## Purpose

Use this skill to review migrations for expand/contract safety, data preservation, deploy ordering, and rollback viability.

## Workflow

1. Identify migration type: schema, data backfill, destructive, config, storage, queue, or API contract.
2. Check forward compatibility with old and new application versions.
3. Check rollback path, lock/downtime risk, idempotency, batching, and observability.
4. Inspect reads/writes, defaults, nullability, indexes, constraints, and data volume assumptions.
5. Require tests or dry-run evidence appropriate to risk.

## Safety gates

Never run migrations, rollbacks, data scripts, or production/staging commands without explicit approval. Treat irreversible drops, lossy transforms, credential changes, and public contract breaks as blocking unless mitigated.

## Output format

- `result`: safe | changes-needed | blocked | needs-plan
- `migration_scope`: files and systems affected
- `risk_level`: low | medium | high | critical
- `forward_safety`: pass/fail/unknown with evidence
- `rollback_safety`: pass/fail/unknown with evidence
- `data_loss_risk`: none | possible | likely | unknown
- `required_changes`: ordered mitigations
- `validation_evidence`: commands/logs inspected or missing
- `deploy_sequence`: required ordering or `unknown`

## Failure handling

If deploy order, data volume, or rollback is unknown, do not call the migration safe. Return `needs-plan` or `blocked` with exact missing evidence.
