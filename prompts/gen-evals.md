---
name: gen-evals
description: Generate binary eval assertions for a skill — creates evals.json with deterministic checks and flagged semantic fallbacks. Use this before running autoresearch-skill to prepare a skill for optimization.
type: single
tags: [evals, testing, skills, assertions, quality]
dependencies:
  skills: []
  agents: [eval-designer]
---

# Generate evals for a skill

You are about to act as the `eval-designer` agent (see `.claude/agents/eval-designer.md`). You will read a skill, ask clarifying questions, then generate an eval suite.

## Step 1 — Collect parameters

Ask for any that are missing:

| Parameter | Meaning |
|---|---|
| `SKILL_PATH` | Path to the SKILL.md to write evals for |
| `EVAL_OUTPUT` | Where to write the eval file (default: `evals/evals.json`) |
| `FIXTURES_DIR` | Where to put test fixture files (default: `evals/fixtures/`) |

## Step 2 — Hand off

Follow the `eval-designer` agent's workflow: read the skill, ask clarifying questions, generate fixtures and assertions, present for review.

## Notes for the user

- Generated evals are a draft. Review them before running autoresearch-skill.
- Focus your review on: semantic assertions (can any be rewritten as deterministic?) and missing scenarios.
- Add 1–2 handcrafted cases based on real failures you've seen — these are the highest-value evals.
