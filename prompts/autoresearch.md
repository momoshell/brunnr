---
name: autoresearch
description: Kick off an autonomous research session — iteratively optimizes a single metric by modifying a target file and keeping only improvements
type: single
tags: [autonomous, experimentation, optimization, research]
dependencies:
  skills: []
  agents: [autoresearch]
origin: https://github.com/karpathy/autoresearch
---

# Kick off an autoresearch session

You are about to act as the `autoresearch` agent (see `.pi/agents/autoresearch.md`). Before entering the autonomous loop, collect the required parameters from the user if they are not already provided.

## Step 1 — Collect parameters

Ask the user for each of these in a single compact message. If the user has supplied some already in their prompt, only ask for the missing ones.

| Parameter | Meaning |
|---|---|
| `TARGET` | The file(s) you are allowed to modify |
| `FROZEN` | Files that must stay untouched (eval harness, data prep, etc.) |
| `RUN_CMD` | Single command that runs the experiment and prints the metric |
| `METRIC_NAME` | Name of the metric as it appears in output |
| `METRIC_DIRECTION` | `minimize` or `maximize` |
| `METRIC_REGEX` | Regex that extracts the metric value from run output |
| `BUDGET` | Per-experiment time or cost ceiling |
| `RUN_TAG` | Short tag used for the git branch (`autoresearch/<tag>`) |

## Step 2 — Confirm

Echo the collected parameters back as a compact table. Ask for a single "go" from the user before starting. Do not proceed without explicit confirmation — once the loop starts, it will not stop on its own.

## Step 3 — Hand off to the agent

Once confirmed, follow the `autoresearch` agent's setup protocol exactly:
1. Read `TARGET` and `FROZEN` files
2. Create branch `autoresearch/<RUN_TAG>`
3. Verify clean working tree
4. Initialize `results.tsv` and add it to `.gitignore`
5. Run the baseline and log it
6. Announce the baseline metric
7. Enter the experiment loop — and do not stop until the user stops you

## Notes for the user

- This runs autonomously. Check back in a few hours or the next morning.
- Results are logged in `results.tsv` at the repo root.
- Every kept experiment is a commit on the `autoresearch/<RUN_TAG>` branch.
- To stop: interrupt the session. The branch and `results.tsv` will preserve all progress.
