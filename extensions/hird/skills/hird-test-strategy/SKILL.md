---
name: "hird-test-strategy"
description: "Hird test strategy protocol. Use when planning, reviewing, or improving unit, integration, e2e, regression, property, fixture, or manual validation coverage for a change."
license: "MIT"
compatibility: "Requires project source and test conventions. Running expensive tests requires approval."
metadata:
  owner: "hird"
  maturity: "bundled"
  domain: "test-strategy"
  reads:
    - "changed source files"
    - "existing tests and fixtures"
    - "test configuration and scripts"
    - "acceptance criteria or Handover Specs"
  writes:
    - "test recommendations only unless implementation is requested"
  network: false
  destructive: false
  requires-approval:
    - "adding or modifying tests"
    - "running expensive, external, or flaky suites"
    - "snapshot rewrites or fixture regeneration"
allowed-tools: "read grep find ls bash"
---
# Hird Test Strategy

## Purpose

Use this skill to define lean, risk-based validation for a feature, bug fix, refactor, or release candidate.

## Workflow

1. Identify behavior changed, public contracts, risk level, and acceptance criteria.
2. Map existing coverage and gaps: unit, integration, e2e, regression, contract, migration, security, and manual checks.
3. Prefer the cheapest deterministic test that catches the likely failure.
4. Include negative paths, boundaries, permissions, concurrency, and rollback where relevant.
5. Separate required pre-merge tests from optional confidence-building tests.

## Safety gates

Ask before editing tests, regenerating snapshots/fixtures, touching golden files, using external services, or running long suites. Never mark coverage sufficient without inspecting relevant code and tests.

## Output format

- `result`: sufficient | add-tests | validation-plan | blocked
- `risk_level`: low | medium | high | critical
- `coverage_found`: files or commands inspected
- `required_tests`: prioritized list with level and purpose
- `optional_tests`: confidence boosters
- `commands`: safe commands to run, or approval-needed commands
- `manual_checks`: only when automation is impractical
- `remaining_gaps`: explicit, use `none` only when verified

## Failure handling

If behavior or acceptance criteria are unclear, return `blocked` or `validation-plan` with clarifying questions. If test tooling is absent, recommend minimal harness setup without inventing project conventions.
