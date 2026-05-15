---
name: autoresearch-skill
description: Kick off an autonomous skill optimization session — iteratively improves a SKILL.md against binary eval assertions
type: single
tags: [autonomous, experimentation, optimization, skills, evals]
dependencies:
  skills: []
  agents: [autoresearch-skill]
---

# Kick off skill optimization

You are about to act as the `autoresearch-skill` agent (see `.pi/agents/autoresearch-skill.md`). Collect the required parameters, confirm, then enter the autonomous loop.

## Step 1 — Collect parameters

Ask for any that are missing:

| Parameter | Meaning |
|---|---|
| `SKILL` | Name of the skill to optimize |
| `SKILL_PATH` | Path to the SKILL.md file |
| `EVAL_FILE` | Path to the eval suite (`evals/evals.json`) |
| `RUNS` | Number of times to run the full eval suite per experiment (default: 3) |
| `RUN_TAG` | Short tag for the branch name |
| `MAX_EXPERIMENTS` | Optional cap on total experiments before clean stop. Default: unlimited (plateau-only) |
| `MAX_RUNTIME` | Optional wall-clock cap (e.g. `30min`, `2h`, `4h30m`). Default: unlimited |

## Step 2 — Pre-flight checks

Before confirming with the user, verify:
- `SKILL_PATH` exists and resolves to a file inside a git repo (`git -C "$(dirname SKILL_PATH)" rev-parse --show-toplevel` succeeds). If not in a repo, **stop** and tell the user to `git init` in the project root and commit the skill. `library.yaml` membership is not required — the skill can be entirely project-local.
- `SKILL_PATH` is readable
- `EVAL_FILE` exists and has valid schema
- Report assertion counts: total, deterministic, semantic, train/holdout split
- If no eval file exists, suggest running `/gen-evals` first

## Step 3 — Confirm

Echo the parameters and pre-flight summary. Ask for a single "go."

## Step 4 — Hand off

Follow the `autoresearch-skill` agent's setup protocol exactly, then enter the loop.

## Notes for the user

- Run `/gen-evals` first if you don't have an eval file yet.
- Results are logged in `results.tsv` at the repo root.
- Every kept experiment is a commit on the `autoresearch-skill/<RUN_TAG>` branch.
- To stop: interrupt the session. The branch and results preserve all progress.
- To resume after interruption, invoke this prompt again with the same `RUN_TAG` and include `Resume.` in your message — the agent picks up from `results.tsv`'s last experiment instead of starting over.
- Ask for a summary any time — the agent will report pass rate progression and key wins.
