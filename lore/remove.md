# Remove Items Safely

> Remove skills, agents, and prompts from your project without breaking dependencies.

## Overview

The `remove` command safely removes items from your project. It checks for dependencies and prevents accidental data loss.

## Syntax

```bash
just -f ~/.config/brunnr/justfile remove <section> <name>
```

Where:
- `<section>` is one of: `skill`, `agent`, `prompt`
- `<name>` is the installed item name

## Removing Skills

```bash
# Remove a skill from the current project
just -f ~/.config/brunnr/justfile remove skill code-reviewer
```

This removes `.pi/skills/code-reviewer/` and its contents.

## Removing Agents

```bash
# Remove an agent from the current project
just -f ~/.config/brunnr/justfile remove agent security-auditor
```

This removes `.pi/agents/security-auditor.md`.

## Removing Prompts

```bash
# Remove a prompt from the current project
just -f ~/.config/brunnr/justfile remove prompt pr-description
```

This removes `.pi/prompts/pr-description.md`.

## Safety Behavior

The `remove` command follows these safety rules:

1. **Existence check**: Fails if the item is not installed
2. **No orphan cleanup**: Does not remove dependencies (they become orphans)
3. **Scope protection**: Never removes files outside the target directory
4. **Tracked-only**: Only removes files installed by brunnr

## Orphaned Dependencies

Dependencies are not automatically removed. After removing an item, you may have orphaned dependencies:

```bash
# Remove a skill
just -f ~/.config/brunnr/justfile remove skill base-skill

# base-skill's dependencies remain installed
# These are now "orphans" — installed but not required
```

To clean up orphans:

```bash
# List all installed items
just -f ~/.config/brunnr/justfile list

# Manually remove unneeded items
just -f ~/.config/brunnr/justfile remove skill orphaned-skill
```

## What Gets Removed

| Section | Target Location | What Gets Removed |
|---------|----------------|-------------------|
| skill | `.pi/skills/<name>/` | Entire directory and contents |
| agent | `.pi/agents/<name>.md` | Single markdown file |
| prompt | `.pi/prompts/<name>.md` | Single markdown file |

## What Does NOT Get Removed

The `remove` command will never:
- Remove files outside `.pi/skills/`, `.pi/agents/`, or `.pi/prompts/`
- Remove files not installed by brunnr
- Remove directories that contain non-brunnr files
- Delete parent directories

## Handling Errors

### "Item is not installed"

```bash
$ just -f ~/.config/brunnr/justfile remove skill nonexistent
Error: skill 'nonexistent' is not installed
```

Verify the item exists:
```bash
ls .pi/skills/
```

### "Permission denied"

If files are read-only or owned by another user:

```bash
# Check permissions
ls -la .pi/skills/<name>/

# Fix if needed
chmod -R u+w .pi/skills/<name>/
```

## Best Practices

1. **Check dependents first**: Use `list` to see what depends on an item before removing
2. **Remove in reverse dependency order**: Remove dependent items before their dependencies
3. **Clean up orphans**: Periodically review and remove unneeded dependencies
4. **Commit after removal**: If you push changes back to brunnr, commit the removal

## Example: Clean Removal Workflow

```bash
# 1. Check what's installed
just -f ~/.config/brunnr/justfile list skill

# 2. Check for dependents (review library.yaml or SKILL.md files)
grep -r "code-reviewer" .pi/

# 3. Remove dependent items first
just -f ~/.config/brunnr/justfile remove agent security-auditor

# 4. Remove the dependency
just -f ~/.config/brunnr/justfile remove skill code-reviewer

# 5. Verify removal
just -f ~/.config/brunnr/justfile list skill
```

## See Also

- [`add.md`](add.md) — How to add items to your project
- [`list.md`](list.md) — How to list installed items and check dependencies
- [`push.md`](push.md) — How to push changes (including removals) back to brunnr
