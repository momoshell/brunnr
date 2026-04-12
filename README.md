# brunnr

> A private, cross-repo catalog for skills, agents, prompts, and multi-agent prompts.

brunnr is your team's central well of agentic knowledge. It stores reusable AI components—skills, agents, prompts, and multi-agent workflows—and distributes them safely across repositories, devices, and team members.

## Why brunnr?

- **Private-first**: Your catalog lives in a repository you control. No external services required.
- **Cross-repo**: Install the same skill into multiple projects without copy-paste.
- **Cross-device**: Sync your personal catalog across machines.
- **Team sharing**: Share vetted prompts and workflows with your entire team.
- **Versioned**: Track changes to your AI components like any other code.

## Quick Start

```bash
# Clone brunnr to a central location
git clone <your-brunnr-repo> ~/.config/brunnr

# Install the brunnr skill into your project
cd your-project
just -f ~/.config/brunnr/justfile install

# Add a skill from brunnr to your current project
just -f ~/.config/brunnr/justfile add skill my-skill
```

## Repository Structure

```
brunnr/
├── README.md           # This file
├── SKILL.md            # Main skill specification
├── library.yaml        # Catalog index
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

## Catalog Sections

brunnr organizes content into four categories:

| Section | Location in brunnr | Installs to | Description |
|---------|-------------------|-------------|-------------|
| **skills** | `skills/` | `.claude/skills/` | Reusable capabilities (analysis, generation, review) |
| **agents** | `agents/` | `.claude/agents/` | Specialized agent configurations |
| **prompts** | `prompts/` | `.claude/commands/` | Single-shot prompts and templates |
| **multi-agent prompts** | `prompts/` (with `type: multi-agent`) | `.claude/commands/` | Orchestrated multi-step workflows |

> **Note**: Multi-agent prompts are stored alongside regular prompts with a `type: multi-agent` metadata field, rather than a separate top-level section.

## Default Paths

brunnr uses Claude-style defaults:

- **Source** (in brunnr repo): `skills/`, `agents/`, `prompts/`
- **Target** (in your project): `.claude/skills/`, `.claude/agents/`, `.claude/commands/`

These can be customized via environment variables or `library.yaml`.

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

# 4. Push improvements back to brunnr
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

The `library.yaml` file is the source of truth for your catalog. See `SKILL.md` for the full schema.

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


