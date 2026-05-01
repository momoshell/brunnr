---
name: autoresearch-skill-gepa
description: Kick off a GEPA-style skill optimization session — uses reflection on failing eval traces and a Pareto front of candidates instead of single-best hill-climbing. Use when autoresearch-skill has plateaued.
type: single
tags: [autonomous, experimentation, optimization, skills, evals, gepa, reflection]
dependencies:
  skills: []
  agents: [autoresearch-skill-gepa]
---

# Kick off GEPA-style skill optimization

You are about to act as the `autoresearch-skill-gepa` agent (see `.claude/agents/autoresearch-skill-gepa.md`). This is a more sample-efficient but more expensive optimizer than `autoresearch-skill`. Use it when the cheaper hill-climber has plateaued, or when you know the skill's failures are clustered enough that reflection-driven proposals will pay off.

## When this is the right tool

- `autoresearch-skill` already ran and hit a plateau below your target.
- Failing evals cluster around specific patterns (single-cluster plateau diagnosis).
- The skill is already lean — you don't need delete-and-test, you need targeted additions.

If none of these hold, run `/autoresearch-skill` first. Or use `/autoresearch-pipeline` to chain them automatically.

## Step 1 — Collect parameters

Ask for any that are missing:

| Parameter | Meaning | Default |
|---|---|---|
| `SKILL` | Name of the skill to optimize | required |
| `SKILL_PATH` | Path to the SKILL.md file | required |
| `EVAL_FILE` | Path to the eval suite (`evals/evals.json`) | required |
| `RUNS` | Number of times to run the full eval suite per experiment | `3` |
| `RUN_TAG` | Short tag for the branch name | required (suggest ending with `-gepa`) |
| `PARETO_WIDTH` | Max Pareto front size | `4` |

## Step 2 — Pre-flight checks

Before confirming with the user, verify:

- The skill's `source` in `library.yaml` is repo-backed (not `file://` or `https://`). If external, **stop** and direct the user to `/fork-skill` first.
- `SKILL_PATH` exists and is readable.
- `EVAL_FILE` exists and has valid schema.
- Report assertion counts: total, deterministic, semantic, train/holdout split.
- If no eval file exists, suggest `/gen-evals` first.
- Check `evals.json` history. If a recent `autoresearch-skill` run didn't plateau, suggest running that first — GEPA is the wrong tool for skills with obvious low-hanging fruit.

## Step 3 — Confirm

Echo the parameters, pre-flight summary, and the choice of GEPA over hill-climb. Ask for a single "go."

## Step 4 — Hand off

Follow the `autoresearch-skill-gepa` agent's setup protocol exactly, then enter the loop.

## Notes for the user

- This optimizer is more expensive per experiment than `autoresearch-skill` because every proposal involves reading and reasoning about full failure traces.
- Results are still logged to `results.tsv`, but the schema has two extra columns (`parent_exp`, `front_member`) for Pareto tracking.
- The Pareto front lives in `results/pareto-front.json` during the run, and is snapshotted to `evals/runs/<RUN_TAG>/pareto-front.json` at wrap-up (committed as the audit trail). The "winner" at the end is one front member, picked by **highest holdout pass rate** (primary), then highest train, then smallest token cost. You can also cherry-pick a different member if you prefer the trade-off it represents.
- To stop: interrupt the session. The branch and front are preserved.
- Ask for a summary any time — the agent reports front composition, lesson highlights, and persistent failures.
