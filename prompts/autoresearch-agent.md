---
name: autoresearch-agent
description: Kick off GEPA-style optimization for an agent .md file — uses reflection on full trajectory traces (tool calls, turn count, final state) and a Pareto front of candidates. The right tool for optimizing agent prompts; skip the hill-climb stage that exists for skills.
type: single
tags: [autonomous, experimentation, optimization, agents, evals, gepa, reflection, trajectory]
dependencies:
  skills: []
  agents: [autoresearch-agent]
---

# Kick off agent optimization

You are about to act as the `autoresearch-agent` agent (see `.pi/agents/autoresearch-agent.md`). Optimize an agent `.md` file against a trajectory-style eval suite using GEPA-driven proposals (reflection on traces) and a Pareto front of candidates.

## When this is the right tool

- Target is `.pi/agents/<name>.md` (an agent prompt, not a skill).
- An eval suite exists at `evals/evals.json` with the trajectory schema (`fixture`, `work_copy`, `reset`, `task`, `max_turns`, assertions with `category`).
- `AGENT_PATH` resolves to a file inside a git repo (where experiment branches will be recorded). `library.yaml` membership is not required.

If the eval suite doesn't exist or has the skill-style schema, run `/gen-evals-agent` first.

## Why no hill-climb stage for agents

Skills have a three-stage pipeline (`/autoresearch-pipeline`): cheap hill-climb → GEPA → compaction. Agents don't. Random hill-climb edits to an agent prompt rarely move the metric because failures happen many turns deep in the trajectory, far from the prompt change. Reflection-driven proposals are the only optimizer worth the compute. Compaction is folded into this agent's loop (every 5th experiment is a delete-and-test).

So for agents: just run this. There is no `/autoresearch-agent-pipeline`.

## Step 1 — Collect parameters

Ask for any that are missing:

| Parameter | Meaning | Default |
|---|---|---|
| `AGENT` | Name of the agent to optimize | required |
| `AGENT_PATH` | Path to the agent .md file | required |
| `EVAL_FILE` | Path to evals.json | required |
| `RUNS` | Eval runs per experiment | `2` (lower than skills — agent runs are expensive) |
| `RUN_TAG` | Short tag for the branch name | required (suggest ending with `-agent`) |
| `MAX_EXPERIMENTS` | Optional cap on total experiments before clean stop | unlimited (plateau-only) |
| `MAX_RUNTIME` | Optional wall-clock cap (`30min`, `2h`, `4h30m`) | unlimited |
| `PARETO_WIDTH` | Max Pareto front size | `4` |
| `EVAL_PARALLEL` | Eval cases run in parallel | `2` (set to `1` if you suspect any case can write outside its sandbox) |

## Step 2 — Pre-flight checks

Before confirming, verify:

- `AGENT_PATH` exists and resolves to a file inside a git repo (`git -C "$(dirname AGENT_PATH)" rev-parse --show-toplevel` succeeds). If not, **stop** and tell the user to `git init` in the project root and commit the agent. `library.yaml` membership is not required.
- `AGENT_PATH` is readable.
- `EVAL_FILE` exists and uses the trajectory schema. If it has the skill schema (no `fixture`/`work_copy`/`reset`/`task`/`max_turns`), tell the user to run `/gen-evals-agent` instead.
- Every eval case has at least one **safety** assertion. If any case has zero, stop and direct the user to `/gen-evals-agent` to add safety checks. Optimizing without safety assertions is unsafe — the optimizer can win by removing guardrails.
- Each `reset` command is idempotent (runs cleanly twice in a row producing the same `work_copy` state). Run a quick verification pass.
- Working tree is clean.
- Branch `autoresearch-agent/<RUN_TAG>` does not exist.

Report assertion counts by category and the verification results.

## Step 3 — Confirm

Echo:
- All parameters
- Assertion breakdown by category (final-state / trajectory / safety / quality)
- Pareto-front width and parallelism
- The reset-idempotency verification result
- That the optimizer will hard-discard any candidate that triggers any safety violation, regardless of pass rate

Ask for a single "go."

## Step 4 — Hand off

Follow the `autoresearch-agent` agent's setup protocol exactly, then enter the loop.

## Notes for the user

- **Cost.** Agent eval runs are 10–50× more expensive than skill eval runs. The default `RUNS=2` and small Pareto front reflect this. Plan for fewer experiments per session.
- **Safety is non-negotiable.** Any candidate that violates a safety assertion is automatically discarded. This is a feature: it lets you optimize aggressively without worrying that the optimizer will sneak a destructive change past you. But it also means: if your safety assertions are wrong (false positives), the optimizer will be artificially constrained. Tune them carefully via `/gen-evals-agent`.
- **No pipeline orchestrator.** Unlike skills, agents have one optimization stage. Run this once per epoch. Do not loop.
- **Re-trigger when inputs change.** New evals, hand-edits to the agent, model upgrades, or holdout drift are the right reasons to run another epoch. Same eval set + same agent = overfitting.
- **Results.** Pareto front is in `results/pareto-front.json`. Trajectory traces are under `results/traces/`. Lessons are in `results/lessons.md`. The "winner" at wrap-up is one front member, picked via highest holdout. You can also cherry-pick a different front member if you want the trade-off it represents.
- **To stop**: interrupt the session. Branch and front are preserved.
- **To resume after interruption**: invoke this prompt again with the same `RUN_TAG` and include `Resume.` in your message — the Pareto front and per-candidate trace dirs are validated, then the agent continues from `results.tsv`'s last experiment.
