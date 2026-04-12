# Add Items to Your Project

> Install skills, agents, and prompts from brunnr into your current project.

## Overview

The `add` command copies items from your brunnr catalog to the current project. It handles dependencies and ensures safe, non-destructive installation.

## Syntax

```bash
just -f ~/.config/brunnr/justfile add <section> <name>
```

Where:
- `<section>` is one of: `skill`, `agent`, `prompt`
- `<name>` is the item name as listed in `library.yaml`

## Adding Skills

Skills are reusable capabilities that enhance your AI assistant:

```bash
# Add a code review skill
just -f ~/.config/brunnr/justfile add skill code-reviewer

# Add a test generation skill
just -f ~/.config/brunnr/justfile add skill test-writer

# Add a documentation skill
just -f ~/.config/brunnr/justfile add skill doc-generator
```

Skills are installed to `.claude/skills/<skill-name>/`.

## Adding Agents

Agents are specialized AI configurations for specific tasks:

```bash
# Add a security auditor agent
just -f ~/.config/brunnr/justfile add agent security-auditor

# Add a performance reviewer agent
just -f ~/.config/brunnr/justfile add agent performance-reviewer
```

Agents are installed to `.claude/agents/<agent-name>.md`.

## Adding Prompts

Prompts are single-shot instructions or templates:

```bash
# Add a PR description prompt
just -f ~/.config/brunnr/justfile add prompt pr-description

# Add a commit message prompt
just -f ~/.config/brunnr/justfile add prompt commit-message
```

Prompts are installed to `.claude/commands/<prompt-name>.md`.

## Adding Multi-Agent Prompts

Multi-agent prompts are prompts that orchestrate multiple agents. They are stored alongside regular prompts with `type: multi-agent` metadata:

```bash
# Add a complex review workflow
just -f ~/.config/brunnr/justfile add prompt complex-review
```

Check library.yaml for required agents and install them manually if needed.

## Dependency Resolution

Dependencies are documented in `library.yaml` for manual reference. Check library.yaml before adding items to ensure required dependencies are available:

```bash
# Check what dependencies an item requires
cat ~/.config/brunnr/library.yaml | grep -A 10 "name: security-auditor"
```

Install any required dependencies manually before or after adding an item.

## Safety Behavior

The `add` command follows these safety rules:

1. **No overwrites**: If the item already exists in your project, the command fails with a clear message
2. **Atomic installation**: Either all files install successfully, or none do
3. **Type checking**: Source and target types must match (file vs. directory)

## Handling Conflicts

If an item already exists:

```bash
$ just -f ~/.config/brunnr/justfile add skill code-reviewer
Error: skill 'code-reviewer' already installed
Use 'push' to update brunnr with local changes, or remove first.
```

Options:
1. **Keep local version**: Do nothing; your local changes are preserved
2. **Push to brunnr**: If your local version is better, push it back
3. **Remove and re-add**: If you want the brunnr version, remove first then add

## Verifying Installation

After adding an item, verify it was installed correctly:

```bash
# List installed skills
ls -la .claude/skills/

# List installed agents
ls -la .claude/agents/

# List installed prompts
ls -la .claude/commands/
```

## See Also

- [`use.md`](use.md) — How to use installed items
- [`remove.md`](remove.md) — How to remove items safely
- [`push.md`](push.md) — How to push local changes back to brunnr
