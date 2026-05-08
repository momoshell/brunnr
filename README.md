# brunnr

> A reference-first catalog for [Pi](https://github.com/badlogic/pi-mono) — skills, agents, prompts, extensions, and themes.

`brunnr <command>` installs catalog items into the directories Pi reads natively. Then use them in Pi.

## Prerequisites

| Tool | What it's for | Install |
|---|---|---|
| **git** | Cloning brunnr; every catalog mutation goes through git | [git-scm.com](https://git-scm.com) |
| **just** | Runs `brunnr` commands | `brew install just` or [just.systems](https://just.systems) |
| **Pi** | The coding agent that loads your skills, agents, prompts, extensions, themes | [pi-mono](https://github.com/badlogic/pi-mono) |
| **gh** | GitHub CLI — powers `brunnr push` / `brunnr scrap` / `brunnr status` | `brew install gh` then `gh auth login`, or [cli.github.com](https://cli.github.com) |

## Install

```bash
# 1. Clone brunnr to a stable location
git clone <your-brunnr-repo> ~/.config/brunnr

# 2. Add a shell alias so `brunnr` is available everywhere.
#    Append this line to ~/.zshrc (or ~/.bashrc if you use bash):
alias brunnr='just -f ~/.config/brunnr/justfile'
#    Then reload your shell: `source ~/.zshrc`  (or open a new terminal)

# 3. Verify it works
brunnr help              # prints the command list
brunnr list              # shows every catalog item, grouped by section
```

Initialize brunnr in any project where you plan to run Pi:

```bash
cd path/to/your/project  # any directory; if you don't have one, run `mkdir my-pi-project && cd $_`
brunnr install           # creates .pi/skills, .pi/agents, .pi/prompts, .pi/extensions, .pi/themes
```

Then pull items from the catalog into that project:

```bash
brunnr search <query>           # find items by name, description, or tag
brunnr add <section> <name>     # install into this project's .pi/
brunnr add -g <section> <name>  # install globally — every project sees it
```

**Eitri** — the authoring tool that ships with brunnr — is **not** installed anywhere. `brunnr eitri` loads it on demand directly from `$BRUNNR_HOME/extensions/eitri/`, so plain `pi` sessions stay free of it.

`-g` (global) routes installs to `~/.pi/agent/<section>s/`, available in every project. Use it for items you want everywhere (e.g. `eval-designer`).

## I want to…

### …build a new Pi component

```bash
brunnr eitri          # launches Pi with eitri loaded on-demand from $BRUNNR_HOME
```

In Pi, describe what to build:

> Build a Pi extension that watches `.trigger` and replays its contents into the editor on save.

Eitri picks the relevant experts (here: `ext` + `tui` + maybe `keybinding`), runs them in parallel, and writes the file:

```
◉ Querying ext-expert, tui-expert, keybinding-expert (3 experts, parallel)
✓ ext-expert      done in 14s
✓ tui-expert      done in 11s
✓ keybinding-expert done in 9s
✓ Wrote extensions/replay-trigger.ts (143 lines)

To use: pi -e extensions/replay-trigger.ts
```

Eitri has 10 experts (`ext`, `theme`, `skill`, `config`, `tui`, `prompt`, `agent`, `pattern`, `keybinding`, `cli`). For sequential dependencies between experts, ask for `mode: chain` (each query can reference `{previous}`). Details: `extensions/eitri/`.

### …have Eitri apply production-grade patterns

Same flow as above. When describing the agent, mention production constraints — long-running, large batches, irreversible side effects, multiple specialties:

> Build me an agent that processes 10k customer reviews, flags the bad ones, and emails me a summary.

Eitri routes through `pattern-expert` and the resulting agent ships with stanzas like:

```markdown
## Checkpointing
After every 50 reviews, write `.pi/checkpoints/review-batch/state.json`
with `last_processed`, `flagged_ids`, `timestamp`. On startup, read this
file if present and resume from `last_processed`.

## Approval gate
Before sending the summary email, output a one-paragraph preview
(recipient, subject, top-5 flags) and request confirmation. Treat
ambiguous responses as "no."
```

The six patterns: **checkpoint-and-resume**, **HITL gates**, **coordinator+specialists**, **read-only research vs. write-capable execution split**, **idempotency**, **tool-allowlist minimization**. Each documented with when-to-use, when-not-to-use, and Pi-specific stanzas in `extensions/eitri/agents/eitri/pattern-expert.md`.

### …optimize a skill

```bash
brunnr add -g agent eval-designer autoresearch-skill autoresearch-skill-gepa
brunnr add prompt gen-evals autoresearch-pipeline skill-status
```

In Pi:

```
/fork-skill code-reviewer                   # only if source is file:// or https://
/gen-evals                                  # writes evals/evals.json — review and tweak

/autoresearch-pipeline
  SKILL=code-reviewer
  SKILL_PATH=.pi/skills/code-reviewer/SKILL.md
  EVAL_FILE=evals/evals.json
  RUNS=3
  EPOCH_TAG=apr14
  TARGET_PASS_RATE=95
```

Pipeline runs hill-climb → GEPA → compaction; auto-escalates on plateau or stops early on `TARGET_PASS_RATE`.

Check progress across all skills:

```
/skill-status

| Skill          | Last optimized | Pass rate | Status          |
|----------------|---------------|-----------|-----------------|
| api-docs       | never         | —         | Never optimized |
| test-writer    | 2026-03-01    | 68.1%     | Stale (44 days) |
| code-reviewer  | 2026-04-14    | 92.3%     | Current         |

Recommended next:
1. api-docs       — no evals exist. Run /gen-evals first.
2. test-writer    — pass rate 68%, stale. Ready for /autoresearch-pipeline.
```

**Resume an interrupted run** — re-invoke with the same `EPOCH_TAG` plus `Resume.`:

```
/autoresearch-pipeline SKILL=code-reviewer EPOCH_TAG=apr14 Resume.
```

The pipeline detects which stage was interrupted from existing branches + `evals.json` history and continues. More examples in `lore/use.md`.

### …optimize an agent

```bash
brunnr add -g agent eval-designer-agent autoresearch-agent
brunnr add prompt gen-evals-agent autoresearch-agent agent-status
```

In Pi:

```
/fork-agent my-coder                        # only if external
/gen-evals-agent                            # writes trajectory-style evals

/autoresearch-agent
  AGENT=my-coder
  AGENT_PATH=.pi/agents/my-coder.md
  EVAL_FILE=evals/evals.json
  RUNS=2
  RUN_TAG=apr14-agent
  PARETO_WIDTH=4
```

Trajectory evals categorize each assertion as `final-state`, `trajectory`, `safety`, or `quality`. Every case needs at least one safety check — example:

```json
{
  "category": "safety",
  "type": "deterministic",
  "check": "trace contains no 'rm -rf' or 'git push --force'"
}
```

Any candidate that triggers a safety violation is hard-discarded, regardless of pass rate.

**Resume:** `/autoresearch-agent AGENT=my-coder RUN_TAG=apr14-agent Resume.`

Default `RUNS=2` for agents (eval runs are expensive — multi-turn, fixture reset).

### …optimize code, configs, queries — anything with a metric

```bash
brunnr add -g agent autoresearch
brunnr add prompt autoresearch
```

```
/autoresearch
  TARGET=src/optimizer.ts
  RUN_CMD=npm run bench > run.log 2>&1
  METRIC_NAME=p99_latency_ms
  METRIC_DIRECTION=minimize
  METRIC_REGEX=^p99_latency_ms:\s*([\d.]+)
  BUDGET=60s
  RUN_TAG=bench-apr14
```

Same keep/discard loop, git-based experiment tracking, same `Resume.` (`/autoresearch RUN_TAG=bench-apr14 Resume.`). Details: `agents/autoresearch.md`.

### …share with my team

```bash
brunnr push <section> <name>      # PR adding the item to the catalog
brunnr status                     # open PRs in the queue
brunnr sync                       # pull merged items
```

Skill / agent / prompt only. Details: `lore/push.md`.

### …remove

```bash
brunnr remove [-g] <section> <name>      # uninstall locally
brunnr scrap <section> <name>            # PR removing it from the catalog
```

`scrap` lists dependents and refuses if anything still depends on the item. Details: `lore/scrap.md`.

## Catalog reference

### Agents

| Name | Purpose |
|---|---|
| `autoresearch` | Generic optimizer for any file against any metric |
| `autoresearch-skill` | Skill hill-climb optimizer |
| `autoresearch-skill-gepa` | Skill GEPA optimizer (reflection + Pareto front) |
| `autoresearch-agent` | Agent GEPA optimizer (safety-aware) |
| `eval-designer` | Generates skill eval suites |
| `eval-designer-agent` | Generates agent eval suites |

### Prompts (slash commands)

| Name | Behavior |
|---|---|
| `/autoresearch` | Generic optimization kickoff |
| `/autoresearch-skill` | Skill hill-climb |
| `/autoresearch-skill-gepa` | Skill GEPA |
| `/autoresearch-pipeline` | Hill-climb → GEPA → compaction |
| `/autoresearch-agent` | Agent GEPA |
| `/gen-evals` | Generate skill eval suite |
| `/gen-evals-agent` | Generate agent eval suite |
| `/fork-skill` / `/fork-agent` | Copy an external item into brunnr |
| `/skill-status` / `/agent-status` | Rank items by what needs optimization next |

All optimizer prompts and the pipeline support the `Resume.` kickoff.

## Repository structure

```
brunnr/
├── library.yaml          # Catalog index — the authority
├── SKILL.md              # Catalog format spec
├── CLAUDE.md             # Conventions for AI sessions working on brunnr
├── justfile              # `brunnr` commands
├── agents/
│   ├── autoresearch.md
│   ├── autoresearch-skill.md
│   ├── autoresearch-skill-gepa.md
│   ├── autoresearch-agent.md
│   ├── eval-designer.md
│   └── eval-designer-agent.md
├── prompts/
│   ├── autoresearch.md
│   ├── autoresearch-skill.md
│   ├── autoresearch-skill-gepa.md
│   ├── autoresearch-pipeline.md
│   ├── autoresearch-agent.md
│   ├── gen-evals.md
│   ├── gen-evals-agent.md
│   ├── fork-skill.md
│   ├── fork-agent.md
│   ├── skill-status.md
│   └── agent-status.md
├── extensions/eitri/
│   ├── eitri.ts
│   └── agents/eitri/
│       ├── eitri-orchestrator.md
│       └── {ext,theme,skill,config,tui,prompt,agent,pattern,keybinding,cli}-expert.md
├── themes/               # Pi colour themes (empty)
└── lore/                 # Per-command guides
    └── {install,add,remove,use,list,search,push,scrap,status,check,sync}.md
```

## See also

- `SKILL.md` — catalog format spec (frontmatter, source types, dependencies)
- `CLAUDE.md` — conventions for AI sessions modifying brunnr
- [`lore/`](lore/) — per-command guides

## Contributing

brunnr is designed to be forked. Adapt it to your team's workflows.
