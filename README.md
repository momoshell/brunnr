# brunnr

> A reference-first catalog for skills, agents, prompts, and multi-agent prompts.

brunnr is your team's central well of agentic knowledge. The `library.yaml` file is the single source of truth—it catalogs what exists and where to find it. Content can be stored in the brunnr repository (repo-backed) or referenced from external locations (local paths or remote URLs).

## Why brunnr?

- **Reference-first**: `library.yaml` is the authority; it points to content rather than containing it
- **Flexible sourcing**: Store content in brunnr, reference local files, or link to remote URLs
- **Cross-repo**: Install the same skill into multiple projects without copy-paste
- **Cross-device**: Sync your personal catalog across machines
- **Team sharing**: Share vetted prompts and workflows with your entire team
- **Versioned**: Track changes to your AI components like any other code

## Prerequisites

| Tool | What it's for | Install |
|------|---------------|---------|
| **git** | Version control, syncing brunnr across devices | [git-scm.com](https://git-scm.com) |
| **just** | Runs brunnr commands (modern make alternative) | `brew install just` or [just.systems](https://just.systems) |
| **Claude Code** | AI assistant that uses your skills, agents, and prompts | [claude.ai/code](https://claude.ai/code) |

brunnr manages files that Claude Code reads from `.claude/` in your project. The `just` commands handle copying files between brunnr and your projects. Claude Code reads the installed skills/agents/prompts at runtime.

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

# 5. Add a skill from the catalog
brunnr add skill code-reviewer
```

After `install`, your project will have `.claude/skills/`, `.claude/agents/`, and `.claude/commands/` directories. Claude Code automatically picks up anything placed there.

## Core Concepts

| Concept | What it is |
|---------|------------|
| **brunnr** | A reference-first catalog where `library.yaml` is the authority pointing to content |
| **library.yaml** | The catalog index—source of truth for what exists and where to find it |
| **Source types** | Repo-backed (in brunnr), local reference (`file://`), remote reference (GitHub URL) |
| **Skills** | Reusable capabilities stored in directories and installed to `.claude/skills/` |
| **Agents** | Specialized AI configurations stored as files and installed to `.claude/agents/` |
| **Prompts** | Single-shot instructions stored as files and installed to `.claude/commands/` |
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

brunnr organizes content into three top-level sections:

| Section | Location in brunnr | Installs to | Description |
|---------|-------------------|-------------|-------------|
| **skills** | `skills/` or external | `.claude/skills/` | Reusable capabilities (analysis, generation, review) |
| **agents** | `agents/` or external | `.claude/agents/` | Specialized agent configurations |
| **prompts** | `prompts/` or external | `.claude/commands/` | Single-shot prompts and templates |

> **Note**: Multi-agent prompts are a prompt subtype (use `type: multi-agent`), not a separate section.

## Repository Structure

```
brunnr/
├── README.md           # This file
├── SKILL.md            # Main skill specification
├── library.yaml        # Catalog index (the authority)
├── justfile            # Terminal shortcuts
├── agents/             # Agent configurations
│   ├── autoresearch.md         # Generic autonomous optimizer
│   ├── autoresearch-skill.md   # Skill-specific optimizer
│   └── eval-designer.md        # Eval suite generator
├── prompts/            # Kickoff prompts
│   ├── autoresearch.md         # /autoresearch
│   ├── autoresearch-skill.md   # /autoresearch-skill
│   ├── fork-skill.md           # /fork-skill
│   ├── gen-evals.md            # /gen-evals
│   └── skill-status.md         # /skill-status
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
# 1. Install brunnr into a new project
brunnr install

# 2. Add skills you need
brunnr add skill code-reviewer
brunnr add skill test-writer

# 3. Use them in your project
# (Skills are now available to Claude in .claude/skills/)

# 4. Push improvements back to brunnr (for repo-backed skills)
brunnr push skill code-reviewer
```

### Team Workflow

```bash
# Team lead maintains brunnr with vetted components
cd ~/.config/brunnr

# Add a new team-approved skill
cp ~/Downloads/security-review.md skills/
# Edit library.yaml to register it

# Commit and push
git add .
git commit -m "Add security-review skill"
git push

# Team members sync and install
brunnr sync
brunnr install
```

## Skill Optimization (autoresearch)

brunnr includes an autonomous skill optimization pipeline inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch). An agent iteratively edits a SKILL.md, runs binary eval assertions, and keeps only the changes that improve pass rate — the same way autoresearch optimizes a neural network training script overnight.

### Eval philosophy

Every eval needs three things:

- **Objective metric**: a number you can measure — not "feels better," an actual pass rate
- **Measurement tool**: automated, reliable, no human needed — deterministic string checks or binary LLM judge
- **Lever to pull**: something the agent can change — the SKILL.md instructions

Assertions are **binary** (pass/fail, not scores) and **deterministic first** (string match > regex > LLM judge). This keeps evals cheap, fast, and low-noise.

### The pipeline

```
/fork-skill         → (if external) copy skill into brunnr repo
/gen-evals          → eval-designer creates evals.json        → you review
/autoresearch-skill → agent optimizes SKILL.md against evals   → you review results
/skill-status       → shows which skills need attention next
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
| `SKILL_PATH` | `.claude/skills/code-reviewer/SKILL.md` | File to optimize |
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

### Generic autoresearch

For non-skill targets — optimizing code, configs, SQL queries, or anything with a measurable metric and a run command — the generic `autoresearch` agent works directly:

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

**Agents** are autonomous AI configurations — they define how Claude behaves during a task. Install them with `brunnr add agent <name>`, which places them in `.claude/agents/`. You can then invoke an agent in Claude Code by selecting it from the agent picker or referencing it directly.

| Agent | Purpose |
|-------|---------|
| `autoresearch` | Generic — optimize any file against any run command + metric |
| `autoresearch-skill` | Specialized — optimize a SKILL.md against binary eval assertions |
| `eval-designer` | Generate `evals.json` with binary assertions for a skill |

**Prompts** are slash commands you type in Claude Code. Install them with `brunnr add prompt <name>`, which places them in `.claude/commands/`. Then type the command in any Claude Code session to run it.

| Prompt | How to use | What it does |
|--------|-----------|--------------|
| `/autoresearch` | Type in Claude Code | Collects target, metric, and run command, then starts the generic optimization loop |
| `/autoresearch-skill` | Type in Claude Code | Collects skill name, eval file, and run count, then starts the skill optimization loop |
| `/gen-evals` | Type in Claude Code | Reads a skill, asks about your goals and failure modes, generates `evals/evals.json` |
| `/fork-skill` | Type in Claude Code | Copies an external skill into brunnr so it can be edited and optimized |
| `/skill-status` | Type in Claude Code | Scans all skills and reports which ones need optimization next |

## Safety & Consistency

brunnr prioritizes safe operations:

- **No blind overwrites**: Existing files are preserved; conflicts are reported
- **Explicit dependencies**: Skills declare what they need in library.yaml (manual checking)
- **Atomic operations**: Add/remove operations are all-or-nothing within a section

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRUNNR_HOME` | `~/.config/brunnr` | Path to brunnr repository |
| `BRUNNR_SKILLS_DIR` | `.claude/skills` | Where to install skills |
| `BRUNNR_AGENTS_DIR` | `.claude/agents` | Where to install agents |
| `BRUNNR_PROMPTS_DIR` | `.claude/commands` | Where to install prompts |

The defaults work out of the box for most setups. If you need to override them, add the variables to your shell profile:

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

The `BRUNNR_SKILLS_DIR`, `BRUNNR_AGENTS_DIR`, and `BRUNNR_PROMPTS_DIR` variables are relative to your project root and control where `brunnr install` and `brunnr add` place files. Change these only if your project uses a non-standard `.claude/` layout.

### library.yaml

The `library.yaml` file is the source of truth for your catalog. See `SKILL.md` for the full schema and source semantics.

## Lore

See the `lore/` directory for detailed guides:

- [`lore/install.md`](lore/install.md) — Install brunnr into a project
- [`lore/add.md`](lore/add.md) — Add skills/agents/prompts to your project
- [`lore/use.md`](lore/use.md) — Use installed components
- [`lore/push.md`](lore/push.md) — Push local improvements back to brunnr
- [`lore/remove.md`](lore/remove.md) — Remove components safely
- [`lore/list.md`](lore/list.md) — List available and installed items
- [`lore/sync.md`](lore/sync.md) — Sync brunnr across devices
- [`lore/search.md`](lore/search.md) — Search the catalog

## Contributing

brunnr is designed to be forked and customized. Adapt it to your team's workflows, naming conventions, and AI tools.
