---
name: "hird-ci-diagnostics"
description: "Hird CI failure diagnostics protocol. Use when investigating failing builds, tests, linters, GitHub Actions, pipelines, flaky jobs, or local reproduction of CI failures."
license: "MIT"
compatibility: "Requires access to CI logs supplied by the user or local project commands. Network CI access requires approval."
metadata:
  owner: "hird"
  maturity: "bundled"
  domain: "ci-diagnostics"
  reads:
    - "CI logs and job summaries"
    - "workflow configuration"
    - "test, lint, build configuration"
    - "changed files and recent commits"
  writes: []
  network: false
  destructive: false
  requires-approval:
    - "network access to CI providers"
    - "rerunning jobs"
    - "pushing fixes or modifying CI settings"
    - "expensive local validation"
allowed-tools: "read grep find ls bash"
---
# Hird CI Diagnostics

## Purpose

Use this skill to turn failing CI evidence into a ranked diagnosis and minimal next actions.

## Workflow

1. Collect scope: failing job, commit/branch, log excerpt, expected gate, and recent diff.
2. Identify the first meaningful failure, not only the final cascade.
3. Classify: code regression, test bug, environment/config, dependency/cache, flake, resource limit, or unknown.
4. Compare CI commands with local scripts and project docs.
5. Reproduce locally only with safe, bounded commands.
6. Propose the smallest fix or evidence-gathering step.

## Safety gates

Ask before accessing remote CI, rerunning jobs, changing secrets, editing workflow permissions, clearing caches, installing global tools, or running long/integration suites.

## Output format

- `result`: diagnosed | likely-cause | needs-more-evidence | blocked
- `failing_gate`: job/step/command
- `first_error`: quoted or summarized evidence
- `classification`: one category from the workflow
- `root_cause`: concise hypothesis with confidence
- `local_repro`: run/not-run and result
- `next_actions`: ordered minimal steps
- `risks`: flake, env drift, missing logs, or release impact

## Failure handling

If logs are absent or truncated, do not guess as fact. Return `needs-more-evidence` with the exact log, artifact, command, or CI link needed.
