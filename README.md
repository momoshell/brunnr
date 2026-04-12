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
