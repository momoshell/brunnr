# brunnr/scripts/

Standalone helpers invoked by brunnr's `justfile` recipes. Distributed
through brunnr like the rest of the catalog (`brunnr sync` keeps them
current).

## SkillOpt sidecar — alternative skill optimizer

Runs Microsoft's [SkillOpt](https://github.com/microsoft/SkillOpt) against
one of a project's skills as a parallel optimizer to brunnr's
`autoresearch-skill` / `autoresearch-skill-gepa`. Does not replace
anything — it sits alongside so you can A/B SkillOpt's method on your
skills + evals without giving up the existing flow.

### Files

| File | Role |
|---|---|
| `run-skillopt.sh` | end-to-end wrapper: converts evals, drives SkillOpt's train, re-grades snapshots, captures winner |
| `skillopt-bridge.py` | standalone eval-format converter (brunnr canonical → SkillOpt items.json) |
| `grade-skill.py`    | re-grader: runs the full brunnr eval schema (deterministic + semantic + visual) against any SKILL.md |

### One-time setup

Install [uv](https://docs.astral.sh/uv/) — the wrapper handles the rest:

```bash
brew install uv                                       # macOS
# or
curl -LsSf https://astral.sh/uv/install.sh | sh       # any unix
```

The wrapper:

1. First `brunnr skillopt` clones `microsoft/SkillOpt` to
   `~/Development/SkillOpt`, then provisions a sibling
   `.venv/` with `uv venv --python 3.12` + `uv pip install -e .`. uv
   fetches the right Python on its own — no system Python required.
2. Subsequent runs `git pull --ff-only` to keep current. Set
   `SKIP_UPDATE=1` to pin to the working copy you have.
3. On first run it drops a placeholder `~/Development/SkillOpt/.env`
   and exits with a hint. Fill in whichever provider you use
   (Azure OpenAI / OpenAI / Anthropic) and re-run.

### Run against a skill in your project

From the project's root (one with `.pi/skills/<name>/SKILL.md` and
`evals/<short>.json`):

```bash
brunnr skillopt argon-stance-chart
```

The recipe:

1. Calls `skillopt-bridge.py` to convert `evals/stance-chart.json` →
   SkillOpt's `items.json` schema in
   `outputs/skillopt-stance-chart/data/{train,val,test}/`. Drops
   semantic and visual assertions (logged with counts) — SkillOpt's
   evaluator is substring-match only.
2. Runs `python scripts/train.py` inside the cloned SkillOpt repo with
   your `SKILL.md` as the starting point.
3. Captures `outputs/skillopt-<short>/best_skill.md` and writes it as
   `.pi/skills/<skill>/SKILL.md.skillopt-candidate` alongside the live
   skill — **does not overwrite**. Diff before promoting.

### Env overrides

```bash
SKILLOPT_DIR=/custom/path                             brunnr skillopt argon-stance-chart
UV_PYTHON=3.11                                        brunnr skillopt argon-stance-chart  # python version for the venv
SKILLOPT_PY=/path/to/python                           brunnr skillopt argon-stance-chart  # override venv interpreter
SKIP_UPDATE=1                                         brunnr skillopt argon-stance-chart  # don't git-pull
RESET_VENV=1                                          brunnr skillopt argon-stance-chart  # rebuild .venv from scratch
REGRADE=0                                             brunnr skillopt argon-stance-chart  # skip the brunnr post-hoc re-grade
REGRADE_TOP_N=10                                      brunnr skillopt argon-stance-chart  # how many snapshots to re-grade (default 5)
REGRADE_RUNS=2                                        brunnr skillopt argon-stance-chart  # repeat each eval N times (catches LLM flakiness)
OPTIMIZER_MODEL=gpt-5.5 TARGET_MODEL=claude-sonnet-4-6 brunnr skillopt argon-stance-chart
SKILLOPT_CONFIG=configs/livemath/default.yaml         brunnr skillopt argon-stance-chart
```

### What gets lost in translation (and how we get it back)

SkillOpt's evaluator only does substring positive-match against expected
`answers`. Brunnr's eval schema has three assertion types:

| Brunnr `type` | Translates? |
|---|---|
| `deterministic` with `output contains 'X'` | yes — `'X'` becomes an expected substring |
| `deterministic` with `does not contain` or `matches /regex/` | no — dropped at bridge time |
| `semantic` (LLM judge) | no — dropped at bridge time |
| `visual` (vision judge on rendered SVG) | no — dropped at bridge time |

The bridge logs counts so you know exactly what's been dropped:

```
Converted stance-chart.json → outputs/skillopt-stance-chart/data
  Train items: 8
  Val/test items: 4
  Dropped evals (no deterministic signal): 0
  Skipped assertions: semantic=2 visual=2 other=3
```

**Post-hoc re-grading recovers the dropped signal.** After SkillOpt's
training loop finishes, the wrapper invokes `grade-skill.py` on
SkillOpt's `best_skill.md` plus its `REGRADE_TOP_N` most recent
versioned snapshots, runs them through brunnr's **full** eval schema
(including the semantic + visual assertions the bridge had to drop),
and writes the highest-scoring snapshot as the `.skillopt-candidate`.
Effectively: *SkillOpt proposes (with degraded signal), brunnr judges
(with full signal)*. A leaderboard lands at
`outputs/skillopt-<short>/regrade/leaderboard.tsv`. Set `REGRADE=0` to
skip and promote SkillOpt's pick verbatim.

### Side-by-side comparison

After both autoresearch and SkillOpt have run on the same eval suite:

```bash
# Final pass rates
cat results/<your-autoresearch-tag>/report.md          # autoresearch
cat outputs/skillopt-<short>/history.json              # SkillOpt

# Optimized skills
diff -u .pi/skills/<skill>/SKILL.md \
        .pi/skills/<skill>/SKILL.md.skillopt-candidate

# Cost (sum tokens from each side's logs)
```

Decision rule:

- **SkillOpt wins by ≥5 pp at comparable cost** → adopt or borrow more aggressively
- **Parity** → keep autoresearch; the trace-analysis + rejected-edits buffer (brunnr 3.0.18) were the real lift
- **Autoresearch wins** → our stack is well-tuned, SkillOpt was an interesting paper but not portable
