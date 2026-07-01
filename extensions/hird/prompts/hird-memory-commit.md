---
description: Propose or commit durable Hird memory from current context
argument-hint: "[target/file/topic]"
---
Create a deterministic Hird memory proposal or commit from current context.

Target/file/topic: {{args}}
Repository: {{cwd}}

Rules:
1. Capture durable facts only. Do not store secrets, credentials, tokens, PII, speculative claims, or task-local trivia.
2. Prefer project memory over global memory. Global memory requires explicit confirmation.
3. Read existing memory before committing. If there is a conflict, ask for confirmation unless ownership is clear.
4. Deprecate stale entries instead of deleting them.
5. Use `hird_memory` for propose/commit actions; only the orchestrator may commit.

Output exactly:

## Memory Action
- status: proposed | committed | rejected | needs-confirmation
- target:
- file:

## Durable Facts

## Decisions

## Evidence

## Redactions / Do Not Store

## Confirmation Needed
