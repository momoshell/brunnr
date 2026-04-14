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

## Quick Start

```bash
# Clone brunnr to a central location
git clone <your-brunnr-repo> ~/.config/brunnr

# Install the brunnr skill into your project
cd your-project
just -f ~/.config/brunnr/justfile install

# Add a skill from brunnr to your current project
just -f ~/.config/brunnr/justfile add skill code-reviewer
```

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
| **cookbook/** | Task-oriented guides for common operations |
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
└── cookbook/           # Usage guides
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
just -f ~/.config/brunnr/justfile install

# 2. Add skills you need
just -f ~/.config/brunnr/justfile add skill code-reviewer
just -f ~/.config/brunnr/justfile add skill test-writer

# 3. Use them in your project
# (Skills are now available to Claude in .claude/skills/)

# 4. Push improvements back to brunnr (for repo-backed skills)
just -f ~/.config/brunnr/justfile push skill code-reviewer
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
just -f ~/.config/brunnr/justfile sync
just -f ~/.config/brunnr/justfile install
```

## Skill Optimization (autoresearch)

brunnr includes an autonomous skill optimization pipeline inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch). The idea: an agent iteratively edits a SKILL.md, runs binary eval assertions, and keeps only the changes that improve pass rate — the same way autoresearch optimizes a neural network training script overnight.

### The pipeline

```
/gen-evals          → eval-designer creates evals.json     → you review
/autoresearch-skill → agent optimizes SKILL.md against evals → you review results
/skill-status       → shows which skills need attention next
```

### Step 1: Generate evals (`/gen-evals`)

The `eval-designer` agent reads your skill, asks clarifying questions about your real goals and failure modes, then generates `evals/evals.json` — a suite of binary pass/fail assertions.

```json
{
  "assertions": [
    { "check": "output contains 'parameterized query'", "type": "deterministic" },
    { "check": "fix does not introduce a new vulnerability", "type": "semantic", "reason": "requires understanding of fix safety" }
  ]
}
```

**Key design choices:**
- **Binary, not fuzzy.** Every assertion is YES/NO. No scores, no scales.
- **Deterministic first.** String match and regex checks are preferred (>80% target). Semantic LLM checks (haiku-class, YES/NO only) are a flagged fallback.
- **Train/holdout split.** 70% of evals are used for optimization, 30% are held back to catch overfitting.

Generated evals are a draft — review them and add 1–2 handcrafted cases based on real failures.

### Step 2: Optimize the skill (`/autoresearch-skill`)

The `autoresearch-skill` agent runs in a loop:

1. **Propose** a focused change to the SKILL.md (add, tweak, delete, or simplify an instruction)
2. **Commit** the change
3. **Run** the eval suite N times (configurable `RUNS` parameter) and average the pass rate
4. **Keep or discard** — improved pass rate = keep, regressed or negligible gain with added complexity = discard
5. **Holdout check** every 10 experiments — revert if holdout regresses (overfitting)
6. **Log** every experiment to `results.tsv`
7. **Loop** — never stops until you stop it

The agent also runs **delete-and-test** experiments (at least every 5th) to remove instructions that aren't pulling their weight, keeping skills lean.

When done, optimization history is recorded in `evals.json`:

```json
{
  "history": [
    {
      "run_tag": "apr14",
      "date": "2026-04-14",
      "experiments_total": 47,
      "baseline_pass_rate": 71.0,
      "best_pass_rate": 92.3,
      "holdout_pass_rate": 88.5
    }
  ]
}
```

### Step 3: Check status (`/skill-status`)

Shows which skills need optimization next, ranked by priority:

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

### Generic autoresearch

For non-skill targets (optimizing code, configs, or anything with a measurable metric and a run command), the generic `autoresearch` agent works directly. Give it a target file, a run command, and a metric regex.

### Agents and prompts summary

| Agent | Purpose |
|-------|---------|
| `autoresearch` | Generic — optimize any file against any metric |
| `autoresearch-skill` | Specialized — optimize a SKILL.md against binary eval assertions |
| `eval-designer` | Generate `evals.json` for a skill |

| Prompt | Triggers |
|--------|----------|
| `/autoresearch` | Kickoff for generic optimization |
| `/autoresearch-skill` | Kickoff for skill optimization |
| `/gen-evals` | Kickoff for eval generation |
| `/fork-skill` | Fork an external skill into brunnr for editing/optimization |
| `/skill-status` | Check which skills need attention |

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

### library.yaml

The `library.yaml` file is the source of truth for your catalog. See `SKILL.md` for the full schema and source semantics.

## Cookbook

See the `cookbook/` directory for detailed guides:

- [`cookbook/install.md`](cookbook/install.md) — Install brunnr into a project
- [`cookbook/add.md`](cookbook/add.md) — Add skills/agents/prompts to your project
- [`cookbook/use.md`](cookbook/use.md) — Use installed components
- [`cookbook/push.md`](cookbook/push.md) — Push local improvements back to brunnr
- [`cookbook/remove.md`](cookbook/remove.md) — Remove components safely
- [`cookbook/list.md`](cookbook/list.md) — List available and installed items
- [`cookbook/sync.md`](cookbook/sync.md) — Sync brunnr across devices
- [`cookbook/search.md`](cookbook/search.md) — Search the catalog

## Contributing

brunnr is designed to be forked and customized. Adapt it to your team's workflows, naming conventions, and AI tools.
