# brunnr

> A reference-first catalog for [Pi](https://github.com/badlogic/pi-mono) — skills, agents, prompts, extensions, and themes.

brunnr is your team's central well of agentic knowledge for the Pi coding agent. The `library.yaml` file is the single source of truth—it catalogs what exists and where to find it. Content can be stored in the brunnr repository (repo-backed) or referenced from external locations (local paths or remote URLs).

## Why brunnr?

- **Reference-first**: `library.yaml` is the authority; it points to content rather than containing it
- **Flexible sourcing**: Store content in brunnr, reference local files, or link to remote URLs
- **Cross-repo**: Install the same skill into multiple projects without copy-paste
- **Cross-device**: Sync your personal catalog across machines
- **Team sharing**: Share vetted prompts and workflows with your entire team
- **Versioned**: Track changes to your AI components like any other code
- **Forge-style contribution**: `brunnr push` and `brunnr retire` open reviewed PRs — every catalog mutation is auditable, dependency-checked, and revertable
- **Pi-native**: Default install paths land in the directories Pi reads natively — no auxiliary extension or settings shim required

## Prerequisites

| Tool | What it's for | Install |
|------|---------------|---------|
| **git** | Version control, syncing brunnr across devices | [git-scm.com](https://git-scm.com) |
| **just** | Runs brunnr commands (modern make alternative) | `brew install just` or [just.systems](https://just.systems) |
| **Pi** | The coding agent that uses your skills, agents, prompts, extensions, themes | [pi-mono](https://github.com/badlogic/pi-mono) |
| **gh** | GitHub CLI — opens PRs for `brunnr push` / `brunnr retire` and powers `brunnr status` | `brew install gh` then `gh auth login`, or [cli.github.com](https://cli.github.com) |

brunnr manages files that Pi reads from `.pi/` in your project (and `~/.pi/agent/` globally). The `just` commands handle copying files between brunnr and your projects. Pi reads the installed content at runtime — `.pi/skills/`, `.pi/agents/`, `.pi/prompts/`, `.pi/extensions/`, `.pi/themes/` are all native discovery paths.

## Quick Start

```bash
# 1. Install just (if you don't have it)
brew install just

# 2. Clone brunnr to a central location
git clone <your-brunnr-repo> ~/.config/brunnr

# 3. (Optional) Create a shell alias for convenience
alias brunnr='just -f ~/.config/brunnr/justfile'

# 4. Install brunnr into your project
cd your-project
brunnr install

# 5. Add an item from the catalog (try the eitri extension to start)
brunnr add extension eitri

# 6. Launch Pi — it picks up everything in .pi/ natively
pi
```

After `install`, your project will have `.pi/skills/`, `.pi/agents/`, `.pi/prompts/`, `.pi/extensions/`, and `.pi/themes/` directories. Pi automatically discovers anything placed there — no extra config or extension required.

**From here:**

- **Day-to-day**: see the [Command Reference](#command-reference) below or jump to [Workflows](#workflows) for end-to-end examples.
- **Build *new* Pi components without reading docs**: add the [Eitri meta-agent](#building-pi-components-with-eitri) — `brunnr add extension eitri`, then `pi -e .pi/extensions/eitri.ts` and ask it to build something.
- **Improve an *existing* skill or agent against evals**: see [Skill Optimization](#skill-optimization-autoresearch--gepa) (autoresearch + GEPA) and [Agent Optimization](#agent-optimization).
- **Reference**: [Source Types](#source-types), [Catalog Sections](#catalog-sections), and the per-command guides in [`lore/`](lore/).

## Command Reference

| Command | What it does | Example |
|---|---|---|
| `brunnr install` | Create `.pi/{skills,agents,prompts,extensions,themes}` in the current project so Pi can discover them | `brunnr install` |
| `brunnr list [section]` | List catalog items (and what's installed locally if you pass a section) | `brunnr list skill` |
| `brunnr search <query>` | Search names, descriptions, and tags across the catalog | `brunnr search eval` |
| `brunnr add <section> <name>` | Copy a catalog item into the project — installs to `.pi/<section>s/` | `brunnr add agent eval-designer` |
| `brunnr remove <section> <name>` | Uninstall an item from the project (does **not** touch the brunnr catalog) | `brunnr remove agent eval-designer` |
| `brunnr push <section> <name>` | Forge a new item into the catalog: file copy → library.yaml entry → `brunnr check` → branch → commit → push → PR. New items only; skill/agent/prompt only. | `brunnr push skill code-reviewer` |
| `brunnr retire <section> <name>` | Open a PR removing an item from the catalog. Refuses if other entries depend on it. | `brunnr retire agent stale-optimizer` |
| `brunnr status` | List open PRs in the brunnr remote — the queue of items "waiting to be forged" | `brunnr status` |
| `brunnr sync` | Fast-forward your local brunnr clone from `origin` (no merge conflicts allowed) | `brunnr sync` |
| `brunnr check` | Validate `library.yaml` integrity — frontmatter names, source paths, dependencies, orphan files | `brunnr check` |

`<section>` is one of `skill`, `agent`, `prompt`, `extension`, `theme` (auto-push and retire are limited to skill/agent/prompt).

## Core Concepts

| Concept | What it is |
|---------|------------|
| **brunnr** | A reference-first catalog where `library.yaml` is the authority pointing to content |
| **library.yaml** | The catalog index—source of truth for what exists and where to find it |
| **Source types** | Repo-backed (in brunnr), local reference (`file://`), remote reference (GitHub URL) |
| **Skills** | Reusable capabilities stored in directories and installed to `.pi/skills/` |
| **Agents** | Specialized AI configurations stored as files and installed to `.pi/agents/` |
| **Prompts** | Single-shot instructions stored as files and installed to `.pi/prompts/` |
| **Extensions** | Pi TypeScript extensions installed to `.pi/extensions/` (single file or directory tree) |
| **Themes** | Pi colour themes (.json) installed to `.pi/themes/` |
| **Multi-agent prompts** | Orchestrated workflows using `type: multi-agent`; stored alongside regular prompts |
| **SKILL.md** | The specification document defining the brunnr format and behavior |
| **lore/** | Task-oriented guides for common operations |
| **justfile** | Thin terminal wrapper providing convenient shortcuts |

## Source Types

brunnr supports three ways to reference content:

| Type | Source Format | Use Case |
|------|---------------|----------|
| **Repo-backed** | `skills/my-skill/SKILL.md` | Content stored in brunnr, synced with git |
| **Local reference** | `file:///Users/you/path/to/skill.md` | Content outside brunnr on your machine |
| **Remote reference** | `https://raw.githubusercontent.com/...` | Content fetched from GitHub on demand |

### Repo-Backed (Default)

Store content in the brunnr repository. Best for team-vetted, versioned components.

```yaml
# library.yaml
skills:
  - name: code-reviewer
    description: Review code for bugs, style, and best practices
    source: skills/code-reviewer/SKILL.md
```

### Local Reference

Reference content at an absolute path on your machine. Best for personal components.

```yaml
# library.yaml
skills:
  - name: my-local-skill
    description: Personal skill stored outside brunnr
    source: file:///Users/me/.local/share/brunnr-skills/my-skill/SKILL.md
```

### Remote Reference

Reference content from a GitHub raw URL. Best for published external components.

```yaml
# library.yaml
agents:
  - name: external-agent
    description: Reference to an agent from another repo
    source: https://raw.githubusercontent.com/org/ai-catalog/main/agents/docs-checker.md
```

## Catalog Sections

brunnr organizes content into five top-level sections:

| Section | Location in brunnr | Installs to | Description |
|---------|-------------------|-------------|-------------|
| **skills** | `skills/` or external | `.pi/skills/` | Reusable capabilities (analysis, generation, review) |
| **agents** | `agents/` or external | `.pi/agents/` | Specialized agent configurations |
| **prompts** | `prompts/` or external | `.pi/prompts/` | Single-shot prompts and templates |
| **extensions** | `extensions/` or external | `.pi/extensions/` (+ routed subtree) | Pi TypeScript extensions, single file or directory tree |
| **themes** | `themes/` or external | `.pi/themes/` | Pi colour themes (.json with all 51 tokens) |

> **Note**: Multi-agent prompts are a prompt subtype (use `type: multi-agent`), not a separate section. Directory-style extensions route their files across multiple install dirs per the convention in `SKILL.md`.

## Repository Structure

```
brunnr/
├── README.md           # This file
├── SKILL.md            # Main skill specification
├── library.yaml        # Catalog index (the authority)
├── justfile            # Terminal shortcuts
├── agents/             # Agent configurations
│   ├── autoresearch.md              # Generic autonomous optimizer
│   ├── autoresearch-skill.md        # Skill hill-climb optimizer (with plateau diagnosis)
│   ├── autoresearch-skill-gepa.md   # Skill GEPA-style optimizer (reflection + Pareto front)
│   ├── autoresearch-agent.md        # Agent GEPA-style optimizer (trajectory-aware)
│   ├── eval-designer.md             # Skill eval suite generator
│   └── eval-designer-agent.md       # Agent (trajectory-style) eval suite generator
├── prompts/            # Kickoff prompts
│   ├── autoresearch.md              # /autoresearch
│   ├── autoresearch-skill.md        # /autoresearch-skill
│   ├── autoresearch-skill-gepa.md   # /autoresearch-skill-gepa
│   ├── autoresearch-pipeline.md     # /autoresearch-pipeline (chains the three skill stages)
│   ├── autoresearch-agent.md        # /autoresearch-agent
│   ├── gen-evals.md                 # /gen-evals (skills)
│   ├── gen-evals-agent.md           # /gen-evals-agent (agents)
│   ├── fork-skill.md                # /fork-skill
│   ├── fork-agent.md                # /fork-agent
│   ├── skill-status.md              # /skill-status
│   └── agent-status.md              # /agent-status
├── extensions/         # Pi TypeScript extensions (single files OR directory packages)
│   └── eitri/                       # Meta-agent that builds Pi agents (parallel/chain expert research)
│       ├── eitri.ts
│       └── agents/eitri/            # → routed to .pi/agents/eitri/ on install
│           ├── eitri-orchestrator.md
│           └── *-expert.md          # 9 domain experts
├── themes/             # Pi colour themes (.json files; empty for now)
└── lore/              # Usage guides
    ├── install.md      # Install brunnr into a project
    ├── add.md          # Add items to your project
    ├── use.md          # Use installed items
    ├── push.md         # Push local changes to brunnr
    ├── remove.md       # Remove items safely
    ├── list.md         # List available items
    ├── sync.md         # Sync across devices
    └── search.md       # Search the catalog
```

## Workflows

### Personal Workflow

```bash
# 1. Install brunnr into a project (creates .pi/* directories Pi reads from)
brunnr install

# 2. Browse the catalog
brunnr list                          # everything available, grouped by section
brunnr search eval                   # find eval-related items by name / tags / description

# 3. Add what you need
brunnr add agent eval-designer       # generates evals.json for skills
brunnr add prompt skill-status       # /skill-status command
brunnr add extension eitri           # meta-agent for building Pi components

# 4. Launch Pi — it discovers everything in .pi/ natively
pi
# For extensions you also need: pi -e .pi/extensions/eitri.ts

# 5. Stay current with the catalog
brunnr sync                          # fast-forward your brunnr clone from origin

# 6. Stop using something (project-only — leaves the catalog untouched)
brunnr remove prompt skill-status
```

### Team Workflow

Authors propose new items via `brunnr push`. Reviewers see the queue with `brunnr status`. Consumers pick up merged items with `brunnr sync`.

```bash
# 1. Author drafts a new skill in their project
mkdir -p .pi/skills/security-review
$EDITOR .pi/skills/security-review/SKILL.md   # write content + frontmatter

# 2. One command: copies the file, registers it in library.yaml from the
#    SKILL.md frontmatter, runs `brunnr check`, branches, commits, pushes,
#    and opens a GitHub PR.
brunnr push skill security-review
# Forged: security-review (skill)
#   https://github.com/your-org/brunnr/pull/42

# 3. Reviewers check the queue
brunnr status   # lists open PRs awaiting review

# 4. After merge, consumers sync and install
brunnr sync
brunnr add skill security-review
```

**What `brunnr push` does** (skill / agent / prompt only):

1. Validates the source file exists and has frontmatter with `name`, `description`, `tags`
2. Refuses if the item already exists in `library.yaml` (push is for new items)
3. Copies the file into the brunnr repo (`skills/<name>/`, `agents/`, `prompts/`)
4. Appends a `library.yaml` entry derived from frontmatter, preserving comments and ordering
5. Runs `brunnr check` — reverts everything if validation fails
6. Creates branch `add-<name>` from `origin/main`, commits, pushes
7. Opens a PR via `gh pr create`

**Extensions and themes** still need manual edits (no frontmatter metadata source). Edit files under `~/.config/brunnr/extensions/` or `~/.config/brunnr/themes/`, register in `library.yaml`, and commit with `git`.

### Retiring an item from the catalog

`brunnr retire <section> <name>` is the deletion counterpart to `push`. It opens a PR that removes a skill, agent, or prompt — file plus `library.yaml` entry — after verifying nothing else in the catalog depends on it.

```bash
brunnr retire agent stale-optimizer
# Validating with brunnr check...
# All checks passed.
# Retired: stale-optimizer (agent)
#   https://github.com/your-org/brunnr/pull/47
```

**What `brunnr retire` does**:

1. Verifies the item is in `library.yaml` and repo-backed (not external)
2. Scans every other entry's `dependencies` — refuses if any item lists this one, telling you which ones need to be retired or updated first
3. Branches `retire-<name>` from `origin/main`
4. Deletes the file (`skills/<name>/`, `agents/<name>.md`, or `prompts/<name>.md`)
5. Removes the `library.yaml` entry, preserving section comments and converting the section back to `<key>: []` if it became empty
6. Runs `brunnr check` — reverts if anything's broken
7. Commits `Retire <name> <section>`, pushes, opens a PR

The dependency-aware bail is the key safety: you can't accidentally retire a skill that an agent depends on without a clear error pointing at the dependent.

### Checking the catalog queue

When new skills/agents/prompts are proposed via pull request to your brunnr repo, `brunnr status` lists what's waiting to be reviewed and merged — your team's queue of items "waiting to be forged."

```bash
brunnr status
# Open PRs in brunnr (waiting to be forged):
#
#   #42 Add security-review skill
#       add-security-review | @alice | 2d ago
#   #43 Update autoresearch-agent for new safety rules
#       autoresearch-agent/may02 | @bob | today
#
# Review: gh pr view <num> --web   (run from ~/.config/brunnr)
```

The command queries the brunnr remote via `gh pr list` and reports number, title, branch, author, and age. It exits with `No open PRs — the forge is quiet.` when nothing's pending. There's no background process or notification — call it manually when you want to see the queue (typically before `brunnr sync`).

## Building Pi components with Eitri

The `eitri` extension is a meta-agent that **builds new Pi components** — extensions, skills, agents, prompts, themes, settings — by dispatching a team of research experts that fetch fresh upstream Pi docs, then synthesizing their findings and writing the files. Reach for it whenever the alternative is reading half a dozen pages of [pi-mono](https://github.com/badlogic/pi-mono) docs to figure out how to register a tool, wire a custom widget, or set up a new theme. (Eitri is the master dwarf smith of Norse myth — the natural counterpart to brunnr, the well of wisdom the experts draw from.)

### Install and launch

```bash
# Add the eitri extension to your project — directory-routed install
brunnr add extension eitri
# This drops:
#   .pi/extensions/eitri.ts
#   .pi/agents/eitri/{eitri-orchestrator,ext,theme,skill,config,tui,prompt,agent,keybinding,cli}-expert.md

# Launch Pi with eitri loaded
pi -e .pi/extensions/eitri.ts
```

You'll see a grid of expert cards above the editor and an `Eitri (9 experts)` status. Type a build request:

```
Build a Pi extension that watches `.trigger` and replays its contents into the editor on save.
```

The orchestrator picks the relevant experts (here: `ext-expert` + `tui-expert` + maybe `keybinding-expert`), calls the `query_experts` tool with all of them at once, waits for their research, and writes the resulting `.ts` file to `extensions/`.

### Modes

`query_experts` takes an optional `mode`:

| Mode | Behavior |
|---|---|
| `parallel` (default) | All queries run as concurrent subprocesses, max 4 in flight |
| `chain` | Sequential; each question may include `{previous}` to inject the prior expert's full output |

Use `chain` when one expert's output should narrow the next expert's query — e.g. *"ask `config-expert` about provider setup, then chain to `ext-expert` with `{previous}` so they design `registerProvider` against those specific keys."*

### The expert roster

| Expert | Domain |
|---|---|
| `ext-expert` | Extensions — tools, events, commands, shortcuts, custom rendering, state, system prompts |
| `theme-expert` | Themes — JSON format, all 51 colour tokens, hot reload |
| `skill-expert` | Skills — SKILL.md frontmatter, directory structure, validation, Agent Skills standard |
| `config-expert` | Settings, providers, models, packages, keybindings |
| `tui-expert` | TUI components, keyboard input, overlays, widgets, footers, custom editors |
| `prompt-expert` | Prompt templates — single-file `.md`, `$1` / `$@` / `${@:N}` argument syntax |
| `agent-expert` | Agent personas, `teams.yaml`, dispatcher / pipeline / parallel orchestration patterns |
| `keybinding-expert` | `registerShortcut`, key IDs, reserved keys, macOS terminal compatibility |
| `cli-expert` | All `pi` CLI flags, output modes, package subcommands, env vars |

Each expert fetches fresh docs from `pi-mono` on first query (firecrawl with `curl` fallback) so answers track upstream as Pi evolves.

### Where experts live (and the safety check)

Eitri loads expert definitions from two locations:

| Path | Trusted? |
|---|---|
| `~/.pi/agent/agents/eitri/` | Yes — user-installed, always loaded |
| `<project>/.pi/agents/eitri/` | No — Eitri prompts via `ctx.ui.confirm()` before loading; project-level entries shadow user-level on name collision |

In headless mode (`--mode json`) project-level experts are never auto-loaded. Project-controlled experts can execute arbitrary subagent system prompts, so the confirmation prompt is the safety gate.

### Eitri vs. the optimizers

| You want to… | Use |
|---|---|
| Build a *new* Pi component from scratch | `eitri` |
| Improve an *existing* skill against evals | `/autoresearch-skill` → `/autoresearch-skill-gepa` if it plateaus, or `/autoresearch-pipeline` for hands-off |
| Improve an *existing* agent `.md` against trajectory evals | `/autoresearch-agent` |
| Generate evals before optimizing | `/gen-evals` (skills) or `/gen-evals-agent` (agents) |

Build first with Eitri, then sharpen with the optimizers.

## Skill Optimization (autoresearch + GEPA)

brunnr includes two optimization algorithms and a pipeline orchestrator for skills, drawn from [karpathy/autoresearch](https://github.com/karpathy/autoresearch) and [gepa-ai/gepa](https://github.com/gepa-ai/gepa). An agent iteratively edits a SKILL.md, runs binary eval assertions, and keeps only the changes that improve pass rate.

| Optimizer | Algorithm | When to use |
|---|---|---|
| `/autoresearch-skill` | Hill-climb on a single best candidate; cheap delete-and-test | First pass on a new or untouched skill — clears the obvious wins |
| `/autoresearch-skill-gepa` | Reflection on failing traces; Pareto front of candidates | After hill-climb plateaus, or for skills with clustered failure patterns |
| `/autoresearch-pipeline` | Runs both, then a compaction pass, with plateau-based escalation | Default choice for "best result without micromanaging which optimizer to run" |

The hill-climb optimizer is fast and good enough for easy skills. GEPA-style optimization is more sample-efficient but more expensive per experiment because each proposal involves reading and reasoning about full failure traces. The pipeline orchestrates them so you don't have to decide manually.

### Eval philosophy

Every eval needs three things:

- **Objective metric**: a number you can measure — not "feels better," an actual pass rate
- **Measurement tool**: automated, reliable, no human needed — deterministic string checks or binary LLM judge
- **Lever to pull**: something the agent can change — the SKILL.md instructions

Assertions are **binary** (pass/fail, not scores) and **deterministic first** (string match > regex > LLM judge). This keeps evals cheap, fast, and low-noise.

### The pipeline

```
/fork-skill              → (if external) copy skill into brunnr repo
/gen-evals               → eval-designer creates evals.json                 → you review
/autoresearch-pipeline   → hill-climb → GEPA → compaction with auto-escalation
                           (or run /autoresearch-skill or /autoresearch-skill-gepa
                            individually if you prefer manual control)
/skill-status            → shows which skills need attention next
```

> **Requirement:** Only repo-backed skills can be optimized — the agent needs to edit and commit the SKILL.md. If the skill is a remote or local reference, run `/fork-skill` first to bring it into the brunnr repo.

### Step 1: Fork if needed (`/fork-skill`)

If the skill's `source` in `library.yaml` is `file://` or `https://`, run `/fork-skill <name>`. This:
- Fetches the content from the external source
- Copies it into `skills/<name>/SKILL.md`
- Updates `library.yaml` to point to the repo-backed path
- Preserves the original URL in the `origin` field for attribution

Skip this step if the skill is already repo-backed.

### Step 2: Generate evals (`/gen-evals`)

The `eval-designer` agent reads the skill, asks clarifying questions about your real goals and failure modes, then generates `evals/evals.json`:

```json
{
  "skill_name": "code-reviewer",
  "evals": [
    {
      "id": 1,
      "prompt": "Review this file for security issues",
      "files": ["fixtures/sql-injection.py"],
      "assertions": [
        { "check": "output contains 'SQL injection'", "type": "deterministic" },
        { "check": "output contains 'parameterized' or 'prepared statement'", "type": "deterministic" },
        { "check": "suggested fix does not introduce a new vulnerability", "type": "semantic", "reason": "requires understanding of fix safety" }
      ],
      "split": "train"
    }
  ]
}
```

**Design choices:**
- **Binary, not fuzzy.** Every assertion is YES/NO. No scores, no scales.
- **Deterministic first.** String match and regex checks are preferred (>80% target). Semantic LLM checks (haiku-class model, YES/NO only) are a flagged fallback — if a semantic assertion gets inconsistent results, rewrite the assertion, don't upgrade the judge.
- **Train/holdout split.** ~70% of evals are used for optimization (`"split": "train"`), ~30% are held back to catch overfitting (`"split": "holdout"`).

Generated evals are a draft — review them and add 1–2 handcrafted cases based on real failures you've seen.

### Step 3: Optimize the skill (`/autoresearch-skill`)

The agent takes these parameters:

| Parameter | Example | Purpose |
|---|---|---|
| `SKILL` | `code-reviewer` | Skill name |
| `SKILL_PATH` | `.pi/skills/code-reviewer/SKILL.md` | File to optimize |
| `EVAL_FILE` | `evals/evals.json` | Eval suite to score against |
| `RUNS` | `3` | Times to run the full eval suite per experiment (averaged for stability) |
| `RUN_TAG` | `apr14` | Short tag for the git branch |

Then it runs in a loop:

1. **Propose** a focused change to the SKILL.md (add, tweak, delete, or simplify an instruction)
2. **Commit** the change to a `autoresearch-skill/<RUN_TAG>` branch
3. **Run** the eval suite `RUNS` times and average the pass rate
4. **Keep or discard** — improved pass rate = keep, regressed or negligible gain with added complexity = discard
5. **Holdout check** every 10 experiments — revert if holdout regresses (overfitting protection)
6. **Log** every experiment to `results.tsv`
7. **Loop** — never stops until you stop it

The agent also runs **delete-and-test** experiments (at least every 5th) to remove instructions that aren't pulling their weight, keeping skills lean.

**Safety rules:** the agent never modifies eval files or fixtures (that would be cheating), never touches files outside the SKILL.md, never installs packages, and never force-pushes. It verifies the skill is repo-backed before starting — if not, it stops and directs you to `/fork-skill`.

When done, optimization history is recorded in `evals.json` so `/skill-status` can track it:

```json
{
  "history": [
    {
      "run_tag": "apr14",
      "date": "2026-04-14",
      "experiments_total": 47,
      "experiments_kept": 12,
      "experiments_discarded": 32,
      "experiments_crashed": 3,
      "baseline_pass_rate": 71.0,
      "best_pass_rate": 92.3,
      "holdout_pass_rate": 88.5,
      "branch": "autoresearch-skill/apr14"
    }
  ]
}
```

After reviewing results, merge the branch to keep the improvements: `git merge autoresearch-skill/<RUN_TAG>`.

### Step 4: Check status (`/skill-status`)

Scans all skills' `evals.json` history and ranks by what needs attention:

```
| Skill         | Last optimized | Pass rate | Status          |
|---------------|---------------|-----------|-----------------|
| api-docs      | never         | —         | Never optimized |
| test-writer   | 2026-03-01    | 68.1%     | Stale (44 days) |
| code-reviewer | 2026-04-14    | 92.3%     | Current         |

Recommended next:
1. api-docs — no evals exist. Run /gen-evals first.
2. test-writer — pass rate 68%, stale. Ready for /autoresearch-skill.
```

Staleness is ranked: never optimized > low pass rate > stale (>30 days) > holdout drift > current.

### When to escalate from hill-climb to GEPA

`autoresearch-skill` will stop on its own when it hits a plateau and emit a diagnostic report. If the report's pattern is `single-cluster` or `scattered-ceiling`, GEPA's reflection has a real chance of finding the wins hill-climbing missed — `/autoresearch-skill-gepa` is the next step. If the pattern is `overfit` or `eval-quality`, more compute won't help; fix the inputs first (rotate evals, tighten flaky assertions, hand-edit the skill).

`/autoresearch-pipeline` does this escalation automatically: it runs hill-climb, reads the plateau diagnosis, and either advances to GEPA or stops the pipeline depending on what the diagnosis says.

## Agent Optimization

The same machinery applies to **agent `.md` files** with one twist: agent failures happen multiple turns deep into a trajectory, so random hill-climb edits to the agent prompt rarely move the metric. brunnr therefore skips the hill-climb stage entirely for agents and runs GEPA directly, with built-in compaction.

```
/fork-agent          → (if external) copy agent into brunnr repo
/gen-evals-agent     → eval-designer-agent creates trajectory-style evals.json → you review
/autoresearch-agent  → GEPA-driven loop: reflection on traces, Pareto front,
                       periodic delete-and-test for compaction
/agent-status        → shows which agents need attention next
```

### Trajectory-style evals

Agent evals are integration tests, not unit tests. Each case has a fixture (starting state directory), a reset command (idempotent restore between runs), a task, a max-turn cap, and assertions in four categories:

| Category | Examples |
|---|---|
| `final-state` | Output text contains X; a specific file was created; git log matches a pattern |
| `trajectory` | Agent used at most N turns; called Edit on this file; never called Bash with `rm -rf` |
| `safety` | No destructive git commands; no writes outside the sandbox; no network calls |
| `quality` | (Semantic) the diagnosis correctly identifies the root cause |

**Every case must have at least one safety assertion.** `autoresearch-agent` hard-discards any candidate that triggers a safety violation, regardless of how good its other metrics look. This lets you optimize aggressively without worrying that the optimizer will sneak a destructive change past you.

### Cost considerations

Agent eval runs are 10–50× more expensive than skill eval runs (multi-turn, tool calls, fixture reset). Keep eval suites small (5–15 cases), default `RUNS=2` instead of 3, and lean hard on deterministic checks. Trajectory and safety assertions are usually cheap to make deterministic — string-match against the trace log.

### When to re-run

Same rule as skills: one optimization epoch per **input change**, not on a timer. The triggers are new evals, hand-edits to the agent, model upgrades, or holdout drift. Re-running over the same inputs without changes leads to overfitting.

### Generic autoresearch

For non-skill, non-agent targets — optimizing code, configs, SQL queries, or anything with a measurable metric and a run command — the generic `autoresearch` agent works directly:

| Parameter | Example |
|---|---|
| `TARGET` | `src/optimizer.ts` |
| `RUN_CMD` | `npm run bench > run.log 2>&1` |
| `METRIC_NAME` | `p99_latency_ms` |
| `METRIC_DIRECTION` | `minimize` |
| `METRIC_REGEX` | `^p99_latency_ms:\s*([\d.]+)` |
| `BUDGET` | `60s` |

Same keep/discard loop, same git-based experiment tracking — just without the eval assertion layer.

### Agents and prompts

**Agents** are autonomous AI configurations — they define how the underlying agent behaves during a task. Install them with `brunnr add agent <name>`, which places them in `.pi/agents/`. Pi discovers agents in this directory natively; reference them via the system-select extension or via the `/system` command picker.

| Agent | Purpose |
|-------|---------|
| `autoresearch` | Generic — optimize any file against any run command + metric |
| `autoresearch-skill` | Hill-climb optimizer for SKILL.md against binary eval assertions; stops at plateau with diagnostic report |
| `autoresearch-skill-gepa` | GEPA-style optimizer for SKILL.md — reflection on traces + Pareto front |
| `autoresearch-agent` | GEPA-style optimizer for agent .md files — trajectory-aware reflection + safety enforcement |
| `eval-designer` | Generate `evals.json` with binary assertions for a skill |
| `eval-designer-agent` | Generate trajectory-style `evals.json` for an agent (fixtures, reset, turn caps, safety checks) |

**Prompts** are slash commands you type at the Pi prompt. Install them with `brunnr add prompt <name>`, which places them in `.pi/prompts/`. Then type the command in any Pi session to run it.

| Prompt | How to use | What it does |
|--------|-----------|--------------|
| `/autoresearch` | Type in Pi | Collects target, metric, and run command, then starts the generic optimization loop |
| `/autoresearch-skill` | Type in Pi | Hill-climb skill optimization; stops at plateau with diagnosis |
| `/autoresearch-skill-gepa` | Type in Pi | GEPA-style skill optimization — reflection + Pareto front. Run after `/autoresearch-skill` plateaus. |
| `/autoresearch-pipeline` | Type in Pi | Runs hill-climb → GEPA → compaction with auto-escalation. Default for "best result, hands-off." |
| `/autoresearch-agent` | Type in Pi | GEPA-style optimization for an agent .md file (skips hill-climb stage) |
| `/gen-evals` | Type in Pi | Generates `evals.json` for a skill |
| `/gen-evals-agent` | Type in Pi | Generates trajectory-style `evals.json` for an agent |
| `/fork-skill` | Type in Pi | Copies an external skill into brunnr so it can be edited and optimized |
| `/fork-agent` | Type in Pi | Copies an external agent into brunnr so it can be edited and optimized |
| `/skill-status` | Type in Pi | Scans all skills and reports which ones need optimization next |
| `/agent-status` | Type in Pi | Scans all agents and reports which ones need optimization next (safety-aware) |

## Safety & Consistency

brunnr's mutation commands (`push`, `retire`, `add`, `remove`) are designed so that nothing destructive happens silently:

- **No blind overwrites**: `add` refuses if the target already exists in the project; `push` refuses if the item is already in `library.yaml`. Conflicts are reported, not silently resolved.
- **Validated catalog**: `brunnr check` verifies every entry's frontmatter `name` matches `library.yaml`, every source path resolves, every declared dependency exists, and there are no orphan files. `push` and `retire` run this automatically and roll back on failure.
- **Dependency-aware retire**: `brunnr retire` scans every other entry's `dependencies` and refuses with a list of dependents if any item still relies on the one you're removing.
- **PR-based contribution**: `push` and `retire` go through a feature branch and a GitHub PR — nothing lands on `main` without review (or self-merge for solo use). The PR carries the diff plus `brunnr check` confirmation.
- **Atomic revert on failure**: If anything fails between branch creation and commit, the working tree, branch, and `library.yaml` are restored to a clean state. The local commit is kept once it lands, so push/PR failures don't lose your work.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRUNNR_HOME` | `~/.config/brunnr` | Path to brunnr repository |
| `BRUNNR_SKILLS_DIR` | `.pi/skills` | Where to install skills |
| `BRUNNR_AGENTS_DIR` | `.pi/agents` | Where to install agents |
| `BRUNNR_PROMPTS_DIR` | `.pi/prompts` | Where to install prompts |
| `BRUNNR_EXTENSIONS_DIR` | `.pi/extensions` | Where to install Pi extensions |
| `BRUNNR_THEMES_DIR` | `.pi/themes` | Where to install Pi themes |

The defaults work out of the box — Pi reads each of these paths natively. If you need to override them, add the variables to your shell profile:

**bash** (`~/.bashrc` or `~/.bash_profile`):
```bash
export BRUNNR_HOME="$HOME/.config/brunnr"
```

**zsh** (`~/.zshrc`):
```bash
export BRUNNR_HOME="$HOME/.config/brunnr"
```

**fish** (`~/.config/fish/config.fish`):
```fish
set -gx BRUNNR_HOME $HOME/.config/brunnr
```

You only need to set variables that differ from the defaults. The most common override is `BRUNNR_HOME` if you cloned brunnr somewhere other than `~/.config/brunnr`.

The five `BRUNNR_*_DIR` variables are relative to your project root and control where `brunnr install` and `brunnr add` place files. Change these only if your project uses a non-standard `.pi/` layout — Pi's native discovery is the reason these defaults exist.

### library.yaml

The `library.yaml` file is the source of truth for your catalog. See `SKILL.md` for the full schema and source semantics.

## Lore

See the `lore/` directory for detailed guides:

- [`lore/install.md`](lore/install.md) — Install brunnr into a project
- [`lore/add.md`](lore/add.md) — Add skills, agents, prompts, extensions, or themes to your project
- [`lore/use.md`](lore/use.md) — Invoke installed items inside Pi (`@<name>`, `/<prompt>`, etc.)
- [`lore/push.md`](lore/push.md) — Forge new items into the catalog (and the `retire` deletion counterpart)
- [`lore/remove.md`](lore/remove.md) — Remove items safely from a project
- [`lore/list.md`](lore/list.md) — List available and installed items
- [`lore/sync.md`](lore/sync.md) — Sync brunnr across devices
- [`lore/search.md`](lore/search.md) — Search the catalog

## Contributing

brunnr is designed to be forked and customized. Adapt it to your team's workflows, naming conventions, and AI tools.
