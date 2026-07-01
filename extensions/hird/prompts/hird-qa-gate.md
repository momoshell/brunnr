---
description: Run a deterministic Hird QA gate for a task or diff
argument-hint: "<task id or scope>"
---
Run the Hird QA gate for the specified task/diff.

Task/scope: {{args}}
Repository: {{cwd}}

Inspect task context, Handover Spec if present, current git state and diff, tests, docs, validation evidence, reviewer verdicts, and acceptance criteria. Select standard/deep/adversarial review depth using Hird's QA ladder. Do not mark pass unless required evidence exists.

QA gate contract:
- A valid gate has `result`, `review_depth`, `reviewer_verdicts`, `validation_evidence`, `missing_evidence`, and `blocking_findings`.
- Every reviewer output must begin exactly with `verdict: pass` or `verdict: changes-needed`.
- Malformed, missing, truncated, stale, or inconclusive reviewer output counts as `changes-needed`.
- Unknown or missing validation evidence is never `pass`.
- `conditional` is not pass; list the exact next action before completion.
- Security, data-loss, public-contract, unsafe migration/deploy, or secret-exposure risks are `blocked` unless disproven by evidence.

Output exactly:

## QA Gate
- result: pass | changes-needed | blocked | conditional
- review_depth: standard | deep | adversarial-panel

## Scope Reviewed
- task_scope:
- repository:
- files_inspected:

## Reviewer Verdicts
- reviewer:
  verdict: pass | changes-needed
  evidence:

## Validation Evidence
- command:
  status: passed | failed | not-run | impossible
  evidence_or_reason:

## Evidence Reviewed
- git_state:
- diff_reviewed:
- tests_reviewed:
- docs_release_impact:

## Acceptance Criteria
- criterion:
  status: pass | fail | unknown
  evidence:

## Checks Passed

## Checks Failed

## Missing Evidence
- missing_evidence:
  why_required:

## Blocking Findings
- blocking_findings:
  location:
  evidence:
  required_action:

## Required Next Action
