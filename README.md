# brunnr

> A reference-first catalog for [Pi](https://github.com/badlogic/pi-mono) — skills, agents, prompts, extensions, and themes.

`brunnr <command>` installs catalog items into the directories Pi reads natively. Then use them in Pi.

## Install

```bash
brew install just gh                                # if you don't have them
git clone <your-brunnr-repo> ~/.config/brunnr
alias brunnr='just -f ~/.config/brunnr/justfile'    # optional shell alias

cd your-project
brunnr install                                      # creates .pi/{skills,agents,prompts,extensions,themes}
```

Pi must be installed separately — see [pi-mono](https://github.com/badlogic/pi-mono).

`-g` (global) routes installs to `~/.pi/agent/<section>s/`, available in every project. Use it for items you want everywhere (e.g. `eitri`, `eval-designer`).

## I want to…

### …build a new Pi component

```bash
brunnr add extension eitri
pi -e .pi/extensions/eitri.ts
```

In Pi, describe what to build:

> Build a Pi extension that watches `.trigger` and replays its contents into the editor on save.

Eitri has 10 experts (`ext`, `theme`, `skill`, `config`, `tui`, `prompt`, `agent`, `pattern`, `keybinding`, `cli`); the orchestrator picks the relevant ones and writes the file. Details: `extensions/eitri/`.

### …have Eitri apply production-grade patterns

Same flow as above. When describing the agent, mention production constraints — long-running, large batches, irreversible side effects, multiple specialties:

> Build me an agent that processes 10k customer reviews, flags the bad ones, and emails me a summary.

Eitri routes through `pattern-expert` (checkpoint-and-resume, HITL gates, coordinator+specialists, role splits, idempotency, tool-allowlist minimization). Patterns: `extensions/eitri/agents/eitri/pattern-expert.md`.

### …optimize a skill

```bash
brunnr add -g agent eval-designer autoresearch-skill autoresearch-skill-gepa
brunnr add prompt gen-evals autoresearch-pipeline skill-status
```

In Pi:

1. `/fork-skill <name>` — if the skill's source is `file://` or `https://`
2. `/gen-evals` — review the generated `evals.json`
3. `/autoresearch-pipeline` — runs hill-climb → GEPA → compaction with auto-escalation
4. `/skill-status` — what to optimize next

**Resume an interrupted run:** re-invoke with the same `RUN_TAG` / `EPOCH_TAG` and include `Resume.` in your message. Examples in `lore/use.md`.

### …optimize an agent

```bash
brunnr add -g agent eval-designer-agent autoresearch-agent
brunnr add prompt gen-evals-agent autoresearch-agent agent-status
```

In Pi:

1. `/fork-agent <name>` — if external
2. `/gen-evals-agent`
3. `/autoresearch-agent` — same `Resume.` semantics
4. `/agent-status`

Default `RUNS=2` for agents (eval runs are expensive).

### …optimize code, configs, queries — anything with a metric

```bash
brunnr add -g agent autoresearch
brunnr add prompt autoresearch
```

`/autoresearch` collects `TARGET`, `RUN_CMD`, `METRIC_*`, `BUDGET`, then runs the same keep/discard loop. Same `Resume.`. Details: `agents/autoresearch.md`.

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

### Extensions

| Name | Purpose |
|---|---|
| `eitri` | Builds new Pi components from natural-language requests |

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
