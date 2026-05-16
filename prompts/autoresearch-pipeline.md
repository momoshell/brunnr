---
name: autoresearch-pipeline
description: Run the full skill-optimization pipeline — autoresearch-skill (hill-climb) → autoresearch-skill-gepa (reflection) → autoresearch-skill in delete-only mode (compaction) — with plateau-based escalation between stages. Supports resume-from-checkpoint via the "Resume." kickoff (detects which stage was interrupted from existing branches + evals.json history, resumes that stage, runs subsequent stages fresh). One pass per epoch. Use this instead of running the optimizers individually when you want best-effort results without manually deciding when to escalate.
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
- Skills whose file isn't inside a git repo — experiment branches need somewhere to live. `git init` in the project root first.

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

### Architecture: fleet orchestration

The pipeline is a **coordinator + specialists** topology. This prompt is the coordinator — it does not propose experiments, run evals, or edit the skill. It owns the *transitions*: pre-flight checks, plateau detection, seed-commit selection between stages, and the wrap-up summary. The three specialists (`autoresearch-skill` hill-climb, `autoresearch-skill-gepa` reflection, `autoresearch-skill` delete-only) each run in their own branch with their own checkpoint ledger; they communicate back to the coordinator only through `results.tsv`, the branch tip, and their plateau reports. Specialists never call other specialists. This is the same shape Eitri uses (orchestrator + experts) and the same shape the Cloud Next 26 "Fleet Orchestration" pattern names.

The pipeline also supports resume-from-checkpoint: include `Resume.` in the kickoff message and the orchestrator detects which stage was interrupted from the existing branches + `evals.json` history entries, hands `Resume.` to that stage's specialist, and runs subsequent stages fresh. See "Pipeline resume" below.

## Step 1 — Collect parameters

| Parameter | Meaning | Default |
|---|---|---|
| `SKILL` | Name of the skill | required |
| `SKILL_PATH` | Path to SKILL.md | required |
| `EVAL_FILE` | Path to evals.json | required |
| `RUNS` | Eval runs per experiment | `3` |
| `EPOCH_TAG` | Short tag identifying this epoch (used as a prefix for stage branches) | required |
| `TARGET_PASS_RATE` | Stop early if a stage reaches this on train AND holdout | `95` |
| `MAX_EXPERIMENTS` | Optional **per-stage** experiment cap — passed unchanged to each of the three stages. Worst-case total = `3 × MAX_EXPERIMENTS`. | unlimited |
| `MAX_RUNTIME` | Optional **per-stage** wall-clock cap (`30min`, `2h`, `4h30m`) — passed unchanged to each stage. Worst-case total = `3 × MAX_RUNTIME`. | unlimited |

The pipeline creates three branches and uses three distinct run_tags:
- Stage 1: branch `autoresearch-skill/<EPOCH_TAG>-stage1`, `RUN_TAG=<EPOCH_TAG>-stage1`
- Stage 2: branch `autoresearch-skill-gepa/<EPOCH_TAG>-gepa`, `RUN_TAG=<EPOCH_TAG>-gepa`
- Stage 3: branch `autoresearch-skill/<EPOCH_TAG>-compact`, `RUN_TAG=<EPOCH_TAG>-compact`

The distinct suffixes prevent the per-stage `git checkout -b` from colliding with sibling stages and prevent the per-stage `evals.json` history entries from overwriting each other.

## Step 2 — Pre-flight checks

- Verify `SKILL_PATH` resolves to a file inside a git repo (`git -C "$(dirname SKILL_PATH)" rev-parse --show-toplevel` succeeds). All branches and the per-stage `results.tsv` are recorded in this resolved repo. If not in a repo, stop and tell the user to `git init` in the project root and commit the skill. `library.yaml` membership is NOT required — the skill can be entirely project-local.
- Verify `SKILL_PATH` and `EVAL_FILE` exist.
- Report assertion counts and split.
- Verify the working tree is clean.
- **Branch existence check** — depends on whether this is a fresh run or a resume:
  - **Fresh (default):** all three branch names (`-stage1`, `-gepa`, `-compact`) must NOT exist. If any does, ask the user to choose a new `EPOCH_TAG` or invoke with `Resume.` to continue the existing run.
  - **Resume** (kickoff contains `Resume.`): at least one of the three must exist, and the set of existing branches must match a valid resume state (see "Pipeline resume" below). Abort with a diagnostic if the state is inconsistent (e.g. `-stage1` and `-compact` exist but `-gepa` does not).
- **In-flight pipeline guard.** Refuse to start if the working tree is currently checked out on any branch matching `autoresearch-skill/*` or `autoresearch-skill-gepa/*` belonging to a *different* `EPOCH_TAG` — another optimization may be running. (When resuming, being on this epoch's own branch is expected.)
- Check `evals.json` history: if a previous epoch ran in the last 7 days and the user has not added new evals or changed the skill, **warn** that a fresh epoch is likely to overfit. Confirm with the user before proceeding. (This warning is suppressed in resume mode — the previous epoch *is* the run being resumed.)

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

## Pipeline resume

When the kickoff message contains `Resume.`, the pipeline continues an interrupted run rather than starting fresh. The orchestrator's job during resume is to figure out *which stage was interrupted* and which subsequent stages still need to run from scratch. Detection works by combining two signals:

- **Branch existence:** which of `autoresearch-skill/<EPOCH_TAG>-stage1`, `autoresearch-skill-gepa/<EPOCH_TAG>-gepa`, `autoresearch-skill/<EPOCH_TAG>-compact` exist.
- **`evals.json` history entries:** an entry with `run_tag = <EPOCH_TAG>-stage1` (or `-gepa`, `-compact`) is written by the stage's agent only at its wrap-up. So *entry present = stage finished cleanly; entry absent = stage was interrupted before wrap-up.*

Resume action by state:

| Branches present | History entries present | Resume action |
|---|---|---|
| (none) | (none) | "Resume." was given but there is nothing to resume. Surface this and ask the user whether they meant a fresh start. |
| stage1 | (none) | Resume Stage 1 with `Resume.`. Then run Stage 2 and Stage 3 fresh. |
| stage1 | stage1 | Stage 1 finished but Stage 2 never started. Skip Step 4; run Stage 2 fresh from the existing stage-1 winner; then Stage 3 fresh. |
| stage1, gepa | stage1 | Resume Stage 2 with `Resume.`. Then run Stage 3 fresh. |
| stage1, gepa | stage1, gepa | Stage 2 finished but Stage 3 never started. Skip Steps 4–5; run Stage 3 fresh from the existing stage-2 winner. |
| stage1, gepa, compact | stage1, gepa | Resume Stage 3 with `Resume.`. |
| stage1, gepa, compact | stage1, gepa, compact | Pipeline already complete. Abort with a "this epoch is done — pick a new `EPOCH_TAG` for the next epoch" message. |
| any other combination | — | Inconsistent state (e.g. `-stage1` + `-compact` exist but `-gepa` does not). Abort with a diagnostic listing the existing branches and history entries. The user must clean up manually before resuming. |

When the table calls for **resuming a stage**, modify that stage's handoff (Step 4 / 5 / 6 below) by:
1. Checking out the existing branch instead of detached-HEAD'ing onto a seed commit (the seed commit is the resumed branch's own root).
2. Including `Resume.` in the kickoff prompt, in addition to any other kickoff lines that stage uses (e.g. Stage 3 still says `Run in delete-only mode.`).
3. Skipping the seed-selection step that would normally come before this stage — the seed is implicit in the existing branch.

When the table calls for **running a stage fresh** during a resume (because earlier stages finished but this one never started), follow that stage's normal handoff verbatim, picking the seed commit from the previous stage's branch as usual.

## Step 4 — Run Stage 1 (autoresearch-skill)

**Resume case:** if Pipeline resume directs resuming Stage 1 (table above), check out `autoresearch-skill/<EPOCH_TAG>-stage1` and hand off with `Resume.` in the kickoff. Skip the rest of this step's setup. The agent's own resume protocol handles state restoration.

**Fresh case (default):** hand off to the `autoresearch-skill` agent with parameters:
- `SKILL`, `SKILL_PATH`, `EVAL_FILE`, `RUNS` — as collected
- `MAX_EXPERIMENTS`, `MAX_RUNTIME` — pass through unchanged if the user supplied them; omit if not
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

**Resume case:** if Pipeline resume directs resuming Stage 2, check out `autoresearch-skill-gepa/<EPOCH_TAG>-gepa` directly (not detached-HEAD on a seed) and hand off with `Resume.` in the kickoff. Skip the seed-selection step — the seed is the resumed branch's own root commit. The agent's resume protocol restores the Pareto front and continues.

**Fresh case (default):** position the working tree at the seed commit *without* creating the branch yet — the agent's setup protocol creates the branch itself and aborts if one already exists. Use `git checkout <seed_commit>` to enter detached-HEAD on the seed commit. Then hand off to the `autoresearch-skill-gepa` agent with parameters:
- `SKILL`, `SKILL_PATH`, `EVAL_FILE`, `RUNS` — as before
- `MAX_EXPERIMENTS`, `MAX_RUNTIME` — pass through unchanged if supplied
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

**Resume case:** if Pipeline resume directs resuming Stage 3, check out `autoresearch-skill/<EPOCH_TAG>-compact` directly and hand off with both kickoff lines: `Run in delete-only mode.` and `Resume.` (order doesn't matter; the agent recognizes both substrings independently). The agent's resume protocol restores state and continues in delete-only.

**Fresh case (default):** position the working tree at the stage-2 winner commit without pre-creating the stage-3 branch (`git checkout <winner_commit>`). Hand off to the `autoresearch-skill` agent with parameters:
- `SKILL`, `SKILL_PATH`, `EVAL_FILE`, `RUNS` — as before
- `MAX_EXPERIMENTS`, `MAX_RUNTIME` — pass through unchanged if supplied
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

1. **Produce the pipeline summary report.** Use the per-stage `results.tsv` files (read each stage's branch's TSV via `git show <branch>:results.tsv`) plus the per-stage `evals.json` history entries. Do **not** approximate — compute these from the actual data.

   ```
   ╭─ Pipeline summary — <SKILL> · epoch <EPOCH_TAG> ────────────────────╮
   │  Stage 1 (hill-climb):  <exp> exp · <baseline>% → <s1_best>% train  │
   │                                       · <s1_holdout>% holdout        │
   │  Stage 2 (GEPA):        <exp> exp · <s1_best>% → <s2_best>% train   │
   │                                       · <s2_holdout>% holdout        │
   │  Stage 3 (compaction):  <exp> exp · <s2_best>% held · lines <a>→<b> │
   │                                                                      │
   │  Overall:                                                            │
   │    Baseline →  Final:   <baseline>% →  <final>% train                │
   │                          <b_hold>%  →  <f_hold>%  holdout            │
   │    Improvement:         +<Δ_train> pts train (+<rel>% relative)      │
   │                         +<Δ_holdout> pts holdout                     │
   │    Total experiments:   <sum across stages>                          │
   │    Total elapsed:       <wall_clock_sum>                             │
   │    Token cost change:   <±N%> (vs baseline; from results.tsv tokens) │
   │                                                                      │
   │  Final winner:          <branch>@<short-sha>                         │
   │  Stop reason:           <reason for terminal stage>                  │
   ╰──────────────────────────────────────────────────────────────────────╯
   ```

   Then **trend diagnosis + next-run suggestion** — analyze the trajectory:

   | Pattern | Diagnosis | "Next run" suggestion |
   |---|---|---|
   | All three stages improved | Pipeline working as designed | "Re-invoke for a fresh epoch if you can broaden the eval suite. Same evals → overfitting." |
   | Stage 1 improved, stage 2 didn't | Hill-climb capped; reflection didn't help either | "Plateau is structural. Improve eval suite (add diverse cases) or decompose the skill before running again." |
   | Stage 1 modest, stage 2 big jump | Reflection was the key | "GEPA paid off. Pipeline well-suited; re-invoke after evolving the eval suite." |
   | Improvement < 5 pts overall | Marginal gain | "Skill may already be near-optimal for this eval suite. Add harder cases or accept the result." |
   | Holdout < train by ≥10 pts | Overfitting | "**Don't re-run on this suite.** Add diverse holdout cases, rotate split assignment." |
   | Pipeline stopped via budget cap (`MAX_*`) | Cut short | "Trend was still rising. Re-invoke with `Resume.` and a larger budget — at this slope, ~<estimate> more experiments may push another <est> pts." |
   | Stage 3 compaction shrank the skill ≥30% | Big compression win | "Skill was bloated. Consider running compaction-only (`/autoresearch-skill SKILL_PATH=... RUN_TAG=compact-pass run in delete-only mode`) on future skills earlier." |

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

4. **(Optional) Ask before pushing to brunnr's catalog** — only if the experiment repo IS `$BRUNNR_HOME` (the skill lives in the catalog):
   > "The improved skill is merged. Run `brunnr push skill <SKILL>` to open a PR against the catalog?"
   Skip this step entirely if the skill is project-local — the improvement is already in the user's project repo where it belongs.

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
