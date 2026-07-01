---
description: Run a deterministic Hird QA gate for a task or diff
argument-hint: "<task id or scope>"
---
Run the Hird QA gate for the specified task/diff.

Task/scope: {{args}}
Repository: {{cwd}}

Inspect task context, Handover Spec if present, current diff, tests, docs, validation evidence, and acceptance criteria. Select standard/deep/adversarial review depth using Hird's QA ladder. Do not mark pass unless required evidence exists.

Output exactly:

## QA Gate
- result: pass | changes-needed | blocked | conditional
- review_depth: standard | deep | adversarial-panel

## Evidence Reviewed

## Checks Passed

## Checks Failed

## Missing Evidence

## Blocking Findings

## Required Next Action
