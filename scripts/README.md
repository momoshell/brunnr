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
| `run-skillopt.sh` | end-to-end wrapper: converts evals, drives SkillOpt's train, captures result |
| `skillopt-bridge.py` | standalone eval-format converter (brunnr canonical → SkillOpt items.json) |

### One-time setup

Just have Python 3.10+ on `$PATH` (`brew install python@3.12` on macOS).
The wrapper handles the rest:

1. First `brunnr skillopt` clones `microsoft/SkillOpt` to
   `~/Development/SkillOpt` and creates a sibling venv at `.venv/` with
   `pip install -e .`.
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
SYSTEM_PY=python3.12                                  brunnr skillopt argon-stance-chart  # bootstrap interpreter
SKILLOPT_PY=/path/to/python                           brunnr skillopt argon-stance-chart  # override venv interpreter
SKIP_UPDATE=1                                         brunnr skillopt argon-stance-chart  # don't git-pull
OPTIMIZER_MODEL=gpt-5.5 TARGET_MODEL=claude-sonnet-4-6 brunnr skillopt argon-stance-chart
SKILLOPT_CONFIG=configs/livemath/default.yaml         brunnr skillopt argon-stance-chart
```

### What gets lost in translation

SkillOpt's evaluator only does substring positive-match against expected
`answers`. Brunnr's eval schema has three assertion types:

| Brunnr `type` | Translates? |
|---|---|
| `deterministic` with `output contains 'X'` | yes — `'X'` becomes an expected substring |
| `deterministic` with `does not contain` or `matches /regex/` | no — dropped |
| `semantic` (LLM judge) | no — dropped |
| `visual` (vision judge on rendered SVG) | no — dropped |

For SVG-rendering skills, the deterministic structural assertions
usually carry ~80% of the signal. The bridge logs counts so you know
exactly what's been dropped:

```
Converted stance-chart.json → outputs/skillopt-stance-chart/data
  Train items: 8
  Val/test items: 4
  Dropped evals (no deterministic signal): 0
  Skipped assertions: semantic=2 visual=2 other=3
```

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
