---
description: Run Hird shipping readiness checks for current work
argument-hint: "[target or release constraints]"
---
Prepare the current work item for shipping.

Target/constraints: {{args}}
Repository: {{cwd}}

Use onboarded project context and Hird memory if available. Check git state, validation commands, tests/build/lint, docs/changelog needs, open blockers, QA ladder, and release/rollback risks. Do not run destructive or external release actions without explicit confirmation.

No pass without evidence:
- Do not recommend `ship` unless current git state is understood, relevant validation was run or explicitly impossible, QA gate result is `pass`, missing evidence is `none`, and external/destructive release actions are listed separately for confirmation.
- If QA is missing, stale, malformed, conditional, or has unaddressed findings, recommendation must be `no-ship` or `ship-after-actions`.
- `ship-after-actions` is not ship; list the exact actions and re-run QA before shipping.

Output exactly:

## Ship Readiness
- recommendation: ship | no-ship | ship-after-actions
- qa_gate_result: pass | changes-needed | blocked | conditional | missing

## Current Git State

## Changes Included

## Validation Performed
- command:
  status: passed | failed | not-run | impossible
  evidence_or_reason:

## Validation Still Needed

## QA Verdicts

## Missing Evidence

## Docs / Changelog / Release Notes

## Risks and Rollback

## External Actions Requiring Confirmation

## Exact Remaining Actions
