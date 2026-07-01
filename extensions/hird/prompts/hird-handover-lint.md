---
description: Lint a Hird Handover Spec for deterministic implementation readiness
argument-hint: "<spec path or pasted spec>"
---
Lint the Hird Handover Spec for completeness and deterministic implementation readiness.

Spec input: {{args}}
Repository: {{cwd}}

Fail if: file scope uses globs/directories/vague modules; domain is not frontend/backend/devops/qa; acceptance criteria are not observable; validation commands are missing without explanation; discovery_context omits external symbols or patterns to mirror; runtime facts are guessed; dependencies are unresolved; interface contracts conflict; implementation would require files outside scope.

Output exactly:

## Handover Spec Lint Result
- status: pass | fail

## Critical Findings

## Major Findings

## Minor Findings

## Missing Information

## Required Amendment Prompt
