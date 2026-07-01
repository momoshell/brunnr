---
name: hird-handover
description: Hird Handover Spec creation and linting protocol. Use to produce or validate the lead-to-coder contract before implementation.
license: MIT
compatibility: Requires Hird extension agent roster.
metadata:
  owner: hird
allowed-tools: read grep find ls
---
# Hird Handover Spec

The Handover Spec is the only artifact a coder consumes.

## Required schema

```json
{
  "task_id": "string",
  "domain": "frontend|backend|devops|qa",
  "goal": "string",
  "files_in_scope": ["concrete/path.ext"],
  "constraints": ["string"],
  "acceptance_criteria": ["string"],
  "validation_commands": ["string"],
  "discovery_context": "string",
  "out_of_scope": ["string"],
  "depends_on": ["task_id"],
  "interface_contract": "string or none"
}
```

## Lint fails if

- file scope uses globs, directories, or vague modules;
- domain is not frontend/backend/devops/qa;
- acceptance criteria are not observable;
- validation commands are missing without explanation;
- discovery_context omits external symbols or patterns to mirror;
- runtime facts are guessed;
- dependencies are unresolved;
- interface contracts conflict;
- implementation would require files outside scope.

Use `/hird-handover-lint` for deterministic lint output.
