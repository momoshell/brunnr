# SKILL.md — brunnr Specification v3.0

> Specification for the brunnr meta-skill: a reference-first catalog for Pi (badlogic/pi-mono) — skills, agents, prompts, extensions, themes.

## Overview

brunnr is a **reference-first** catalog system for managing reusable Pi components. The `library.yaml` file is the single source of truth for what exists in your catalog and where to find it. Content may be stored in the brunnr repository (repo-backed) or referenced from external locations (local paths or remote URLs).

### Key Principles

1. **Reference-first**: `library.yaml` is the authority; it points to content rather than containing it
2. **Flexible sourcing**: Content can be repo-backed, local, or remote
3. **Minimal schema**: Only `name`, `description`, and `source` are required
4. **Safe operations**: No blind overwrites; explicit dependencies; atomic transactions
5. **Pi-native paths**: Default install targets are the directories Pi reads natively (`.pi/skills/`, `.pi/agents/`, `.pi/prompts/`, `.pi/extensions/`, `.pi/themes/`) — no auxiliary extensions or settings shims required

## Catalog Structure

### Top-Level Sections

brunnr organizes content into five top-level sections:

| Section | Description | Install Target |
|---------|-------------|----------------|
| **skills** | Reusable capabilities with their own directories | `.pi/skills/<name>/` |
| **agents** | Specialized AI configurations (single markdown files) | `.pi/agents/<name>.md` |
| **prompts** | Single-shot prompts and templates | `.pi/prompts/<name>.md` |
| **extensions** | Pi TypeScript extensions (single file or directory tree) | `.pi/extensions/<name>.ts` (+ routed subtree) |
| **themes** | Pi colour themes (single .json file with all 51 tokens) | `.pi/themes/<name>.json` |

**Multi-agent prompts** are a subtype of prompts (use `type: multi-agent`), not a separate section.

### Directory-style extension sources

Extension entries may point to a single `.ts` file (`source: extensions/foo.ts`) or to a directory (`source: extensions/foo/`). Directory-style packages let an extension ship with sibling artefacts that need to land at known runtime locations — for example, agent definitions that the extension reads at startup. On install, files route per the brunnr convention:

| Source path inside `<extension-dir>/` | Install target |
|---|---|
| `*.ts` (top level) | `.pi/extensions/` |
| `agents/<sub>/...` | `.pi/agents/<sub>/...` |
| `themes/<sub>/...` | `.pi/themes/<sub>/...` |
| Other top-level files (e.g. `README.md`) | ignored |

### Source Semantics

Every catalog entry requires a `source` field that defines where the content lives:

#### 1. Repo-Backed Source (Default)

Content is stored within the brunnr repository and versioned with git.

```yaml
source: skills/my-skill/SKILL.md
```

- Path is relative to brunnr repository root
- Content is synced with brunnr git operations
- Use for team-vetted, shared components

#### 2. Local Reference

Content lives outside brunnr at an absolute path on your machine.

```yaml
source: file:///Users/you/projects/shared-skills/my-skill/SKILL.md
```

- Must use `file://` URI scheme with absolute path
- Not synced with brunnr git
- Use for personal components or external project repos

#### 3. Remote Reference

Content is fetched from a GitHub blob/raw URL.

```yaml
source: https://raw.githubusercontent.com/org/repo/main/skills/my-skill/SKILL.md
```

- Must use raw GitHub content URL
- Fetched on demand, not stored in brunnr
- Use for referencing published external components

## library.yaml Schema

### Required Fields (Per Entry)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier within the section |
| `description` | string | One-line description of what this item does |
| `source` | string | Content location (see Source Semantics above) |

### Optional Metadata

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | For prompts: `"single"` (default) or `"multi-agent"` |
| `install_to` | string | Override default install path (rarely needed) |
| `tags` | array | Searchable tags for filtering |
| `dependencies` | object | Required skills/agents and related prompts |
| `origin` | string | Source attribution (URL, author, etc.) |
| `sync` | string | `"auto"`, `"manual"`, or `"never"` — update behavior |

### Example library.yaml

```yaml
name: brunnr
description: Private catalog for skills, agents, prompts, and multi-agent prompts
version: "2.0.0"

skills:
  - name: code-reviewer
    description: Review code for bugs, style, and best practices
    source: skills/code-reviewer/SKILL.md
    tags: [review, code-quality]
    sync: auto

  - name: my-local-skill
    description: Personal skill stored outside brunnr
    source: file:///Users/me/.local/share/brunnr-skills/my-skill/SKILL.md
    sync: manual

agents:
  - name: security-auditor
    description: Audit code for security vulnerabilities
    source: agents/security-auditor.md
    tags: [security, audit]
    dependencies:
      skills: [code-reviewer]

  - name: external-agent
    description: Reference to an agent from another repo
    source: https://raw.githubusercontent.com/org/ai-catalog/main/agents/docs-checker.md
    origin: https://github.com/org/ai-catalog
    sync: never

prompts:
  - name: pr-description
    description: Generate a pull request description from commits
    source: prompts/pr-description.md
    type: single
    tags: [git, documentation]

  - name: complex-review
    description: Multi-agent code review with security, perf, and docs
    source: prompts/complex-review.md
    type: multi-agent
    tags: [review, multi-agent]
    dependencies:
      skills: [code-reviewer]
      agents: [security-auditor]
```

## Content Formats

### Skill Format

Skills are directories containing a `SKILL.md` file:

```
skills/my-skill/
├── SKILL.md          # Main specification
├── scripts/          # Optional helper scripts
└── templates/        # Optional templates
```

The `SKILL.md` follows this structure:

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

**Behavior**:
- Step-by-step behavior

**Usage**:
```bash
example usage
```
```

### Agent Format

Agents are single markdown files with YAML frontmatter:

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

Prompts are single markdown files with YAML frontmatter:

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

**Multi-agent prompts** specify `type: multi-agent` and include orchestration:

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

## Target Directories

| Section | Default Source | Default Target |
|---------|---------------|----------------|
| skills | `skills/<name>/` | `.pi/skills/<name>/` |
| agents | `agents/<name>.md` | `.pi/agents/<name>.md` |
| prompts | `prompts/<name>.md` | `.pi/prompts/<name>.md` |
| extensions | `extensions/<name>.ts` or `extensions/<name>/` | `.pi/extensions/<name>.ts` (single) or routed (directory) |
| themes | `themes/<name>.json` | `.pi/themes/<name>.json` |

> **Note**: All defaults match Pi's native discovery paths so installed content is found by Pi without any settings.json shim or auxiliary extension.

## Variables

| Variable | Environment | Default | Description |
|----------|-------------|---------|-------------|
| `BRUNNR_HOME` | `BRUNNR_HOME` | `~/.config/brunnr` | Path to brunnr repository |
| `SKILLS_DIR` | `BRUNNR_SKILLS_DIR` | `.pi/skills` | Target directory for skills |
| `AGENTS_DIR` | `BRUNNR_AGENTS_DIR` | `.pi/agents` | Target directory for agents |
| `PROMPTS_DIR` | `BRUNNR_PROMPTS_DIR` | `.pi/prompts` | Target directory for prompts |
| `EXTENSIONS_DIR` | `BRUNNR_EXTENSIONS_DIR` | `.pi/extensions` | Target directory for extensions |
| `THEMES_DIR` | `BRUNNR_THEMES_DIR` | `.pi/themes` | Target directory for themes |

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
- `section`: One of `skill`, `agent`, `prompt`, `extension`, `theme`
- `name`: The item name as listed in `library.yaml`

**Behavior**:
- Resolves the source from `library.yaml`
- Copies files from source to project target
- For directory-style extensions, routes files per the convention table above (`.ts` → `EXTENSIONS_DIR`, `agents/` → `AGENTS_DIR`, `themes/` → `THEMES_DIR`)
- Fails if item doesn't exist in catalog
- Fails if target already exists (use `push` to update)

**Safety rules**:
- Never overwrites existing files
- Atomic: either all files install or none do

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile add skill code-reviewer
just -f $BRUNNR_HOME/justfile add agent security-auditor
just -f $BRUNNR_HOME/justfile add prompt pr-description
just -f $BRUNNR_HOME/justfile add extension eitri
just -f $BRUNNR_HOME/justfile add theme rose-pine
```

### remove <section> <name>

Remove an item from the current project.

**Parameters**:
- `section`: One of `skill`, `agent`, `prompt`, `extension`, `theme`
- `name`: The installed item name

**Behavior**:
- Removes files from project target directory
- For extensions, removes the `.ts` file plus the matching `agents/<name>/` and `themes/<name>/` subdirs that were created on install
- Fails if item is not installed

**Safety rules**:
- Never removes files outside the target directory
- Never removes files not tracked by brunnr

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile remove skill code-reviewer
just -f $BRUNNR_HOME/justfile remove extension eitri
```

### push <section> <name>

Push local changes back to brunnr.

**Parameters**:
- `section`: One of `skill`, `agent`, `prompt`, `extension`, `theme`
- `name`: The item name

**Behavior**:
- Looks up item in `library.yaml` to verify source type
- For repo-backed sources: copies files from project to brunnr
- For local/remote sources (`file://` or `https://`): fails with error
- For directory-style extensions: fails with guidance (multi-target routing can't be auto-reversed; edit files in brunnr directly)
- If item already exists in brunnr: fails with warning (no overwrite)
- After push, instructs user to manually update `library.yaml` for new items

**Safety rules**:
- Fails-closed for local/remote references (cannot push to external sources)
- Fails if item already exists in brunnr (no blind overwrite)
- Catalog-aware: validates entry exists in `library.yaml`

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile push skill my-new-skill
just -f $BRUNNR_HOME/justfile push theme my-theme
```

### list [section]

List available or installed items.

**Parameters**:
- `section` (optional): One of `skill`, `agent`, `prompt`

**Behavior**:
- Reads from `library.yaml` (the catalog authority)
- Shows install status for each item

**Usage**:
```bash
just -f $BRUNNR_HOME/justfile list
just -f $BRUNNR_HOME/justfile list skill
```

### sync

Synchronize brunnr repository with remote.

**Behavior**:
- Verifies BRUNNR_HOME is a git repository
- Checks for uncommitted changes (fails if dirty)
- Checks remote is configured
- Fetches latest from origin
- Checks upstream tracking is set
- Fast-forwards only when safe (ff-only merge)
- Stops on divergence with error message

**Safety rules**:
- Fails if working tree is dirty
- Fails if branch has diverged from remote
- Uses ff-only merge to prevent unintended commits

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

## Dependency Rules

Dependencies are declared in `library.yaml` and item frontmatter for documentation purposes. brunnr does not automatically resolve or install dependencies—users should verify dependencies manually.

| Type | Description |
|------|-------------|
| `skills` | Required skills |
| `agents` | Required agents |
| `prompts` | Related prompts |

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

## Safety Checklist

When implementing brunnr commands, ensure:

- [ ] No blind overwrites — always check before replacing
- [ ] No recursive deletion — never `rm -rf` without confirmation
- [ ] Explicit dependencies — all deps declared in library.yaml
- [ ] Atomic operations — all-or-nothing within a transaction
- [ ] Clear reporting — user knows exactly what changed

## Version History

- **3.0.0** — Pi pivot: install paths default to `.pi/*`, `extensions:` and `themes:` top-level sections added, directory-style extension sources route per convention
- **2.0.0** — Reference-first redesign: `library.yaml` as catalog authority, explicit source semantics (repo-backed, local, remote)
- **1.0.0** — Initial specification with skills, agents, prompts, and multi-agent prompt support
