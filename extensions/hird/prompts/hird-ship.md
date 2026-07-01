---
description: Run Hird shipping readiness checks for current work
argument-hint: "[target or release constraints]"
---
Prepare the current work item for shipping.

Target/constraints: {{args}}
Repository: {{cwd}}

Use onboarded project context and Hird memory if available. Check git state, validation commands, tests/build/lint, docs/changelog needs, open blockers, QA ladder, and release/rollback risks. Do not run destructive or external release actions without explicit confirmation.

Output exactly:

## Ship Readiness
- recommendation: ship | no-ship | ship-after-actions

## Current Git State

## Changes Included

## Validation Performed

## Validation Still Needed

## QA Verdicts

## Docs / Changelog / Release Notes

## Risks and Rollback

## External Actions Requiring Confirmation

## Exact Remaining Actions
