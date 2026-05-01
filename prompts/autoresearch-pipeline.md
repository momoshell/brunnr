---
name: autoresearch-pipeline
description: Run the full skill-optimization pipeline — autoresearch-skill (hill-climb) → autoresearch-skill-gepa (reflection) → autoresearch-skill in delete-only mode (compaction) — with plateau-based escalation between stages. One pass per epoch. Use this instead of running the optimizers individually when you want best-effort results without manually deciding when to escalate.
type: multi-agent
tags: [autonomous, optimization, skills, evals, pipeline, orchestration]
dependencies:
  skills: []
  agents: [autoresearch-skill, autoresearch-skill-gepa]
---

# Run the skill-optimization pipeline

You are the **pipeline orchestrator**. Your job is to chain three optimization stages on a single skill, advancing between stages on plateau signals, and stopping the whole pipeline when further compute will not help. You do **not** propose experiments yourself — each stage is run by its dedicated agent. You are the conductor, not the player.

## When to use this

Use `/autoresearch-pipeline` when:
- You want the best result a skill can reach without manually deciding when to switch optimizers.
- You are starting a fresh optimization epoch (a new eval suite, a hand-edited skill, or a model upgrade).

Do **not** use this for:
- Continuous re-runs over the same eval set — overfitting compounds. One pipeline pass per epoch.
- Skills whose evals don't yet exist — run `/gen-evals` first.
- Skills that aren't repo-backed — run `/fork-skill` first.

## Pipeline shape

```
Stage 1: autoresearch-skill (hill-climb)
   ↓ plateau or 100% saturation
Stage 2: autoresearch-skill-gepa (reflection + Pareto front)
   ↓ plateau or 100% saturation
Stage 3: autoresearch-skill in delete-only mode (compaction pass)
   ↓ no kept deletion in last 5 experiments
END
```

Each stage writes its own `evals.json` `history` entry with a stage-specific `run_tag` (`<EPOCH_TAG>-stage1`, `<EPOCH_TAG>-gepa`, `<EPOCH_TAG>-compact`) and a stage-specific `method` (`autoresearch`, `gepa`, `autoresearch-compact`). The orchestrator then writes one *additional* pipeline-level entry with `method: "pipeline"` and a `stages` array referencing the three stage entries. So the final history shows four entries for one epoch — three stage records and one summary.

Each stage runs in its own branch and writes to `results.tsv`. The orchestrator advances stages by reading those logs.

## Step 1 — Collect parameters

| Parameter | Meaning | Default |
|---|---|---|
| `SKILL` | Name of the skill | required |
| `SKILL_PATH` | Path to SKILL.md | required |
| `EVAL_FILE` | Path to evals.json | required |
| `RUNS` | Eval runs per experiment | `3` |
| `EPOCH_TAG` | Short tag identifying this epoch (used as a prefix for stage branches) | required |
| `TARGET_PASS_RATE` | Stop early if a stage reaches this on train AND holdout | `95` |

The pipeline creates three branches and uses three distinct run_tags:
- Stage 1: branch `autoresearch-skill/<EPOCH_TAG>-stage1`, `RUN_TAG=<EPOCH_TAG>-stage1`
- Stage 2: branch `autoresearch-skill-gepa/<EPOCH_TAG>-gepa`, `RUN_TAG=<EPOCH_TAG>-gepa`
- Stage 3: branch `autoresearch-skill/<EPOCH_TAG>-compact`, `RUN_TAG=<EPOCH_TAG>-compact`

The distinct suffixes prevent the per-stage `git checkout -b` from colliding with sibling stages and prevent the per-stage `evals.json` history entries from overwriting each other.

## Step 2 — Pre-flight checks

- Verify the skill is repo-backed in `library.yaml`. If not: stop, direct user to `/fork-skill`.
- Verify `SKILL_PATH` and `EVAL_FILE` exist.
- Report assertion counts and split.
- Verify the working tree is clean.
- Check that the three branch names above don't already exist. If they do: ask the user to choose a new `EPOCH_TAG` rather than overwriting.
- **In-flight pipeline guard.** Refuse to start if the working tree is currently checked out on any branch matching `autoresearch-skill/*` or `autoresearch-skill-gepa/*` — another optimization may be running.
- Check `evals.json` history: if a previous epoch ran in the last 7 days and the user has not added new evals or changed the skill, **warn** that a fresh epoch is likely to overfit. Confirm with the user before proceeding.

## Step 3 — Confirm

Echo the plan:

```
Pipeline plan for <SKILL>

Stage 1: autoresearch-skill on autoresearch-skill/<EPOCH_TAG>-stage1
  Advance when: plateau (10 consecutive non-keep experiments) OR train ≥ TARGET on holdout

Stage 2: autoresearch-skill-gepa on autoresearch-skill-gepa/<EPOCH_TAG>-gepa
  Seeded from: best of stage 1 (highest holdout, then highest train)
  Advance when: plateau (10 consecutive non-front experiments) OR train ≥ TARGET on holdout

Stage 3: autoresearch-skill (delete-only mode) on autoresearch-skill/<EPOCH_TAG>-compact
  Seeded from: winner of stage 2 (highest holdout, then highest train)
  End when: no kept deletion in last 5 experiments

Stop entire pipeline early if: TARGET reached on train AND holdout in any stage.
```

Ask for a single "go."

## Step 4 — Run Stage 1 (autoresearch-skill)

Hand off to the `autoresearch-skill` agent with parameters:
- `SKILL`, `SKILL_PATH`, `EVAL_FILE`, `RUNS` — as collected
- `RUN_TAG` = `<EPOCH_TAG>-stage1`

The agent runs its loop until **one of these triggers** (the orchestrator monitors `results.tsv` and the agent's own stopping conditions):

| Trigger | Action |
|---|---|
| Plateau detected by the agent's own logic | Advance to Stage 2 |
| Train pass rate hits 100% on 3 consecutive runs | Skip remaining stages, jump to wrap-up |
| Train AND holdout both ≥ `TARGET_PASS_RATE` | Skip remaining stages, jump to wrap-up |
| Crash loop (agent reports unrecoverable) | Stop pipeline, surface error, do not advance |
| User interrupts | Stop pipeline at current stage |

Before advancing, the orchestrator:
1. Asks the agent to produce its plateau report.
2. Reads the report. **If `eval-quality` or `overfit` appears among the diagnosed patterns** (the agent may report multiple), **do not advance to Stage 2** — those patterns are not fixed by a stronger optimizer. Stop pipeline and surface the report. The user must update inputs (evals or fixtures) before another epoch.
3. Otherwise (the patterns are `single-cluster` or `scattered-ceiling` only), advance to Stage 2 — GEPA's reflection has a real chance on those.
4. Picks the best commit on the stage 1 branch as the seed for stage 2: highest holdout pass rate (primary), then highest train pass rate (tiebreaker), then smallest token cost (second tiebreaker). This matches the wrap-up tiebreaker order used by all GEPA-based optimizers in brunnr.

## Step 5 — Run Stage 2 (autoresearch-skill-gepa)

**Position the working tree at the seed commit *without* creating the branch yet** — the agent's setup protocol creates the branch itself and aborts if one already exists. Use `git checkout <seed_commit>` to enter detached-HEAD on the seed commit. Then hand off to the `autoresearch-skill-gepa` agent with parameters:
- `SKILL`, `SKILL_PATH`, `EVAL_FILE`, `RUNS` — as before
- `RUN_TAG` = `<EPOCH_TAG>-gepa`
- `PARETO_WIDTH` = `4`

The agent will run `git checkout -b autoresearch-skill-gepa/<EPOCH_TAG>-gepa` from the detached HEAD as part of its own setup. This avoids a coordination bug where pre-creating the branch would cause the agent to abort.

The agent runs its loop until:

| Trigger | Action |
|---|---|
| GEPA plateau detected by the agent | Advance to Stage 3 |
| Train pass rate 100% on 3 consecutive runs | Skip Stage 3, jump to wrap-up |
| Train AND holdout both ≥ `TARGET_PASS_RATE` | Skip Stage 3, jump to wrap-up |
| Crash loop | Stop pipeline |
| User interrupts | Stop at current stage |

On advance, the orchestrator picks the **winner** from the Pareto front using the same tiebreaker as Stage 1→2: highest holdout pass rate, then highest train pass rate, then smallest token cost. This is the seed for stage 3.

## Step 6 — Run Stage 3 (compaction)

GEPA tends to grow the skill. Stage 3 is a compaction pass.

**Position the working tree at the stage-2 winner commit without pre-creating the stage-3 branch** (`git checkout <winner_commit>`). Hand off to the `autoresearch-skill` agent with parameters:
- `SKILL`, `SKILL_PATH`, `EVAL_FILE`, `RUNS` — as before
- `RUN_TAG` = `<EPOCH_TAG>-compact`

Plus this kickoff line in the hand-off prompt, which the agent recognizes as triggering its formal **delete-only mode** (see `agents/autoresearch-skill.md` "Delete-only mode"):

> "Run in delete-only mode."

The agent runs until:

| Trigger | Action |
|---|---|
| 5 consecutive deletions discarded | End pipeline |
| User interrupts | Stop |
| Crash | Stop |

Stage 3 only ends; it never advances. There is no stage 4.

> **Note**: Unlike Stages 1 and 2, Stage 3 has no `TARGET reached` early-exit. Compaction does not raise pass rate — it just removes instructions whose loss doesn't regress it. Pass rate is already at-or-above target by definition (otherwise the pipeline would have stopped earlier). Stage 3 runs until there's nothing left to safely remove.

## Step 7 — Wrap-up

Once the pipeline ends (whichever stage it ended in):

1. **Report the trajectory** across all stages:
   ```
   Pipeline summary for <SKILL> [epoch <EPOCH_TAG>]

   Stage 1 (autoresearch-skill):    <experiments>, baseline X% → Y%
   Stage 2 (autoresearch-skill-gepa): <experiments>, Y% → Z%
   Stage 3 (compaction):            <experiments>, Z% pass rate held, lines W → V

   Final winner: <branch>@<commit>
   Train pass rate:    <final>%
   Holdout pass rate:  <final>%
   Token cost change:  <±N%>
   ```

2. **Append epoch summary to `evals.json` history**. Each stage's agent already wrote its own entry (`run_tag` = `<EPOCH_TAG>-stage1` / `-gepa` / `-compact`). Now append one additional pipeline-level entry:
   ```json
   {
     "run_tag": "<EPOCH_TAG>",
     "method": "pipeline",
     "date": "<today>",
     "stages": [
       { "run_tag": "<EPOCH_TAG>-stage1", "method": "autoresearch", "best_pass_rate": <X>, "holdout_pass_rate": <Y> },
       { "run_tag": "<EPOCH_TAG>-gepa",   "method": "gepa",         "best_pass_rate": <X>, "holdout_pass_rate": <Y> },
       { "run_tag": "<EPOCH_TAG>-compact","method": "autoresearch-compact", "best_pass_rate": <X>, "holdout_pass_rate": <Y> }
     ],
     "final_winner_commit": "<sha>",
     "final_winner_branch": "<branch>",
     "best_pass_rate": <X>,
     "holdout_pass_rate": <Y>
   }
   ```

3. **Recommend the merge command** (cherry-pick the specific winner — the stage branches are alternatives, not history):
   ```
   git checkout main
   git cherry-pick <final-winner-commit>
   ```

4. **Ask before pushing to brunnr**:
   > "The improved skill is merged. Run `brunnr push skill <SKILL>` to update the catalog?"

## Pipeline-level safety

- **One pipeline = one epoch.** Do not loop the pipeline. If train plateaus before the target, stop and report — the fix is outside the optimizer's reach (better evals, hand-edits, sub-skill decomposition). Re-running the same pipeline against the same evals will overfit.
- **Never modify eval files or fixtures** at any stage.
- **Never advance past a `eval-quality` or `overfit` plateau diagnosis** in stage 1 — those plateaus mean the inputs are wrong, and stage 2 cannot fix that.
- **Never delete branches** between stages. Each stage's branch is the audit trail.
- If any stage's agent reports an unsafe condition, stop the pipeline immediately and surface the report unmodified.

## What the pipeline is *not*

- It is not a replacement for `/skill-status`. The pipeline is "how to optimize *this* skill, end-to-end." `/skill-status` is "which skill should I optimize next."
- It is not a continuous loop. It runs once and stops. Re-trigger only when inputs change (new evals, hand-edited skill, model upgrade, holdout drift).
- It is not a guarantee of best results. There is no algorithm that can guarantee a global optimum on prompt-search. The pipeline gives the most defensible default policy for spending compute.
