---
name: gen-evals-agent
description: Generate trajectory-style binary evals for an agent .md file — creates evals.json with fixtures, reset commands, and turn/tool/safety assertions before running autoresearch-agent.
type: single
tags: [evals, testing, agents, assertions, quality, trajectory]
dependencies:
  skills: []
  agents: [eval-designer-agent]
---

# Generate evals for an agent

You are about to act as the `eval-designer-agent` agent (see `.pi/agents/eval-designer-agent.md`). Generate an `evals/evals.json` for an agent `.md` file. These evals will be used by `autoresearch-agent` (or `/autoresearch-agent`) to optimize the agent.

## When this is the right tool

- Target is `.pi/agents/<name>.md` (an agent file, not a skill).
- You need trajectory-level checks: turn caps, forbidden tools, fixture-based starting state.
- You're preparing the agent for GEPA-style optimization.

If the target is a skill (`.pi/skills/<name>/SKILL.md`), use `/gen-evals` instead.

## Step 1 — Collect parameters

Ask for any that are missing:

| Parameter | Meaning | Default |
|---|---|---|
| `AGENT_PATH` | Path to the agent file (e.g. `.pi/agents/code-reviewer.md`) | required |
| `EVAL_OUTPUT` | Where to write evals.json | `evals/evals.json` |
| `FIXTURES_DIR` | Where to put fixture directories | `evals/fixtures/` |

## Step 2 — Pre-flight checks

Before designing evals, verify:

- `AGENT_PATH` exists and is readable.
- If you intend to optimize this agent later, `AGENT_PATH` should live inside a git repo (where experiment branches will be recorded). `library.yaml` membership is not required.
- `FIXTURES_DIR` doesn't already contain conflicting case directories. If it does, ask before overwriting.
- The agent isn't trivially testable as a skill. Multi-turn / multi-tool agents need this; single-shot text-transform agents may be better evaluated with `/gen-evals` against an equivalent skill.

## Step 3 — Read the agent and its tool surface

Read `AGENT_PATH`. Note:
- Tools the agent expects (Bash, Edit, Read, Agent, etc.)
- Whether it's autonomous (loops on its own) or one-shot (runs once and stops)
- Whether it's a sub-agent of an orchestrator

This shapes what trajectory assertions make sense.

## Step 4 — Hand off to eval-designer-agent

Follow the `eval-designer-agent` agent's workflow exactly:

1. Read the agent.
2. Ask the 4–6 clarifying questions (especially: failure modes, expected end state, forbidden tools, max turn count).
3. Generate fixture directories.
4. Write trajectory-style assertions across all four categories (final-state, trajectory, safety, quality).
5. Apply the assertion-quality checklist.
6. Assign train/holdout split.
7. Write `evals.json`.
8. Report and review with the user.

## Notes for the user

- Agent evals are more expensive to run than skill evals (multi-turn, fixture reset, tool calls). Keep the suite to 5–15 cases.
- Each fixture directory must have a `reset` command that idempotently restores it. Verify these work before optimization starts — a flaky reset is a permanent source of eval noise.
- Every case must have at least one **safety** assertion. Otherwise the optimizer can win by removing safety guardrails.
- After review, run `/autoresearch-agent` to start the optimization loop.
