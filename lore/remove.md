# Remove Items Safely

> Remove skills, agents, and prompts from your project without breaking dependencies.

## Overview

The `remove` command safely removes items from your project. It checks for dependencies and prevents accidental data loss.

## Syntax

```bash
just -f ~/.config/brunnr/justfile remove <section> <name>
```

Where:
- `<section>` is one of: `skill`, `agent`, `prompt`, `extension`, `theme`
- `<name>` is the installed item name

## Removing Skills

```bash
just -f ~/.config/brunnr/justfile remove skill <skill-name>
```

This removes `.pi/skills/<skill-name>/` and its contents.

## Removing Agents

```bash
just -f ~/.config/brunnr/justfile remove agent autoresearch-skill
```

This removes `.pi/agents/autoresearch-skill.md`.

## Removing Prompts

```bash
just -f ~/.config/brunnr/justfile remove prompt skill-status
```

This removes `.pi/prompts/skill-status.md`.

## Removing Extensions

Directory-style extensions install files across multiple `.pi/` subdirectories. Removal undoes all of those:

```bash
just -f ~/.config/brunnr/justfile remove extension eitri
```

This removes:
- `.pi/extensions/eitri.ts` (the extension entry point)
- `.pi/agents/eitri/` (any expert agents the extension shipped with)
- `.pi/themes/eitri/` (any themes the extension shipped with)

Single-file extensions just remove the matching `.ts` file from `.pi/extensions/`.

## Removing Themes

```bash
just -f ~/.config/brunnr/justfile remove theme <theme-name>
```

This removes `.pi/themes/<theme-name>.json`.

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
| extension | `.pi/extensions/<name>.ts` (+ `.pi/agents/<name>/` and `.pi/themes/<name>/` if present) | All files routed by the original install |
| theme | `.pi/themes/<name>.json` | Single JSON file |

## What Does NOT Get Removed

The `remove` command will never:
- Remove files outside the configured `.pi/*` target directories
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
just -f ~/.config/brunnr/justfile list agent

# 2. Check for dependents (review library.yaml or SKILL.md files)
grep -r "autoresearch-skill" .pi/

# 3. Remove dependent items first (e.g. a prompt that wraps the agent)
just -f ~/.config/brunnr/justfile remove prompt autoresearch-skill

# 4. Remove the dependency
just -f ~/.config/brunnr/justfile remove agent autoresearch-skill

# 5. Verify removal
just -f ~/.config/brunnr/justfile list agent
```

## See Also

- [`add.md`](add.md) — How to add items to your project
- [`list.md`](list.md) — How to list installed items and check dependencies
- [`push.md`](push.md) — How to push changes (including removals) back to brunnr
