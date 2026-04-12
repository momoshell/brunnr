# SKILL.md — brunnr Specification

> Specification for the brunnr meta-skill: a private, cross-repo catalog for skills, agents, prompts, and multi-agent prompts.

## Overview

brunnr is a markdown-driven system for managing reusable AI components across multiple repositories, devices, and team members. It provides consistent installation, synchronization, and dependency management without requiring runtime code or external services.

## Core Concepts

### Catalog Sections

brunnr organizes content into three top-level sections, with multi-agent prompts represented as a prompt subtype:

1. **skills** — Reusable capabilities (e.g., code review, test generation)
2. **agents** — Specialized agent configurations (e.g., security auditor, documentation writer)
3. **prompts** — Single-shot prompts and templates
   - **type: single** (default) — Standalone prompts
   - **type: multi-agent** — Orchestrated workflows involving multiple agents

### Source and Target Directories

| Section | Source (in brunnr) | Target (in project) |
|---------|-------------------|---------------------|
| skills | `skills/` | `.claude/skills/` |
| agents | `agents/` | `.claude/agents/` |
| prompts | `prompts/` | `.claude/commands/` |

> **Rationale**: Prompts install to `.claude/commands/` because they represent executable instructions, following Claude's convention.

## Variables

The following variables can be set via environment variables or `library.yaml`:

| Variable | Environment | Default | Description |
|----------|-------------|---------|-------------|
| `BRUNNR_HOME` | `BRUNNR_HOME` | `~/.config/brunnr` | Path to brunnr repository |
| `SKILLS_SRC` | — | `skills/` | Source directory for skills |
| `AGENTS_SRC` | — | `agents/` | Source directory for agents |
| `PROMPTS_SRC` | — | `prompts/` | Source directory for prompts |
| `SKILLS_DIR` | `BRUNNR_SKILLS_DIR` | `.claude/skills` | Target directory for skills |
| `AGENTS_DIR` | `BRUNNR_AGENTS_DIR` | `.claude/agents` | Target directory for agents |
| `PROMPTS_DIR` | `BRUNNR_PROMPTS_DIR` | `.claude/commands` | Target directory for prompts |

## Commands

### install

Initialize brunnr in the current project.

**Behavior**:
- Creates target directories if they don't exist
- Does not overwrite existing files
- Reports what was created vs. what already existed

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile install
```

### add <section> <name>

Add an item from brunnr to the current project.

**Parameters**:
- `section`: One of `skill`, `agent`, `prompt`
- `name`: The item name as listed in `library.yaml`

**Behavior**:
- Copies files from brunnr source to project target
- Fails if item doesn't exist in brunnr
- Fails if target already exists (use `push` to update)
- Reports all installed files

**Safety rules**:
- Never overwrites existing files
- Atomic: either all files install or none do
- Dependencies are documented in library.yaml for manual checking

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile add skill code-reviewer
just -f $BRUNNR_HOME/justfile add agent security-auditor
just -f $BRUNNR_HOME/justfile add prompt pr-description
```

### remove <section> <name>

Remove an item from the current project.

**Parameters**:
- `section`: One of `skill`, `agent`, `prompt`
- `name`: The installed item name

**Behavior**:
- Removes files from project target directory
- Fails if item is not installed
- Does not remove dependencies (orphans may remain)

**Safety rules**:
- Never removes files outside the target directory
- Never removes files not tracked by brunnr

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile remove skill code-reviewer
```

### push <section> <name>

Push local changes back to brunnr.

**Parameters**:
- `section`: One of `skill`, `agent`, `prompt`
- `name`: The item name

**Behavior**:
- Copies files from project target to brunnr source
- Updates `library.yaml` if the item is new
- Fails if source already exists and differs (use force flags with caution)

**Safety rules**:
- Never overwrites brunnr source without explicit confirmation
- Reports what would change before applying

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile push skill my-new-skill
```

### list [section]

List available or installed items.

**Parameters**:
- `section` (optional): One of `skill`, `agent`, `prompt`

**Behavior**:
- Without section: lists all catalog sections with counts
- With section: lists items in that section with install status

**Install status indicators**:
- Present in current project — Installed
- In brunnr but not installed here — Available

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile list
just -f $BRUNNR_HOME/justfile list skill
```

### sync

Synchronize brunnr repository with remote.

**Behavior**:
- Pulls latest changes from origin
- Reports any local modifications that would conflict
- Does not push local changes (use `git push` separately)

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile sync
```

### search <query>

Search the catalog.

**Parameters**:
- `query`: Search string

**Behavior**:
- Searches names, descriptions, and tags in `library.yaml`
- Returns matches across all sections

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile search "security"
```

## Source File Parsing

### SKILL.md Format

Skills are defined by a `SKILL.md` file with the following structure:

```markdown
# Skill Name

> One-line description

## Description

Full description of what the skill does.

## Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VAR_NAME` | yes/no | value | What this variable controls |

## Commands

### command-name

Description of the command.

**Parameters**:
- `param1`: Description
- `param2`: Description

**Behavior**:
- Step-by-step behavior

**Usage**:
```bash
example usage
```
```

### Agent Configuration Format

Agents are defined by markdown files with frontmatter:

```markdown
---
name: Agent Name
description: What this agent does
tags: [tag1, tag2]
dependencies:
  skills: [skill-name]
  agents: [agent-name]
---

# Agent Name

Agent instructions and behavior...
```

### Prompt Format

Prompts are markdown files with frontmatter:

```markdown
---
name: prompt-name
description: What this prompt does
type: single | multi-agent
tags: [tag1, tag2]
dependencies:
  skills: [skill-name]
  agents: [agent-name]
---

# Prompt Title

Prompt content...
```

**Multi-agent prompts** specify `type: multi-agent` and include orchestration instructions:

```markdown
---
name: complex-review
description: Multi-agent code review workflow
type: multi-agent
agents:
  - security-auditor
  - performance-reviewer
  - docs-checker
---

# Complex Review Workflow

1. Run security-auditor on the code
2. Run performance-reviewer on the code
3. Run docs-checker on the code
4. Synthesize findings into a unified report
```

## Dependency Rules

### Dependency Types

Dependencies are explicitly declared in `library.yaml` and item frontmatter:

| Type | Description | Resolution |
|------|-------------|------------|
| `skills` | Required skills | Documented for manual installation |
| `agents` | Required agents | Documented for manual installation |
| `prompts` | Related prompts | Documented for reference |

### Dependency Declaration

In `library.yaml`:

```yaml
skills:
  - name: my-skill
    dependencies:
      skills: [base-skill]
      agents: [helper-agent]
```

In item frontmatter:

```yaml
---
dependencies:
  skills: [required-skill]
  agents: [required-agent]
---
```

### Dependency Resolution

1. **Documentation**: Dependencies are documented in library.yaml for manual checking
2. **Circular detection**: Not currently implemented
3. **Missing dependencies**: Users should verify dependencies manually before installation
4. **Versioning**: Dependencies are resolved by name; versioning is not yet supported

## Target Directory Rules

### Directory Creation

- Target directories are created on first `install` or `add`
- Missing parent directories are created as needed
- Directory permissions follow umask defaults

### File Placement

| Section | Source Pattern | Target Pattern |
|---------|---------------|----------------|
| skills | `skills/<name>/` | `.claude/skills/<name>/` |
| agents | `agents/<name>.md` | `.claude/agents/<name>.md` |
| prompts | `prompts/<name>.md` | `.claude/commands/<name>.md` |

### Conflict Handling

| Scenario | Behavior |
|----------|----------|
| Target exists, identical to source | Report "already installed" |
| Target exists, differs from source | Report conflict, do not overwrite |
| Target is a directory, source is file | Error: type mismatch |
| Target is file, source is directory | Error: type mismatch |

## Repository Sync Rules

### Sync Behavior

The `sync` command updates the local brunnr repository:

1. Fetch from origin
2. Report local modifications that would conflict
3. Fast-forward if possible
4. Require manual resolution if diverged

### Multi-Device Workflow

```bash
# On device A: make changes
cd ~/.config/brunnr
# ... edit files ...
git add . && git commit -m "Update skills"
git push

# On device B: sync changes
just -f ~/.config/brunnr/justfile sync
```

### Team Workflow

```bash
# Team member adds skill locally
just -f ~/.config/brunnr/justfile push skill new-skill

# Team lead reviews and merges via git workflow
# Other team members sync
just -f ~/.config/brunnr/justfile sync
```

## library.yaml Schema

```yaml
# Catalog metadata
name: brunnr
description: Private catalog for skills, agents, and prompts
version: "1.0.0"

# Default paths (override via env vars)
paths:
  skills: skills/
  agents: agents/
  prompts: prompts/

# Skills catalog
skills: []
  # - name: skill-name
  #   description: What this skill does
  #   file: skill-name/SKILL.md
  #   tags: [tag1, tag2]
  #   dependencies:
  #     skills: [other-skill]
  #     agents: [helper-agent]

# Agents catalog
agents: []
  # - name: agent-name
  #   description: What this agent does
  #   file: agent-name.md
  #   tags: [tag1, tag2]
  #   dependencies:
  #     skills: [required-skill]

# Prompts catalog
prompts: []
  # - name: prompt-name
  #   description: What this prompt does
  #   file: prompt-name.md
  #   type: single | multi-agent
  #   tags: [tag1, tag2]
  #   dependencies:
  #     skills: [required-skill]
  #     agents: [required-agent]
```

## Safety Checklist

When implementing brunnr commands, ensure:

- [ ] No blind overwrites — always check before replacing
- [ ] No recursive deletion — never `rm -rf` without confirmation
- [ ] Explicit dependencies — all deps declared in library.yaml
- [ ] Atomic operations — all-or-nothing within a transaction
- [ ] Clear reporting — user knows exactly what changed

## Version History

- **1.0.0** — Initial specification with skills, agents, prompts, and multi-agent prompt support
