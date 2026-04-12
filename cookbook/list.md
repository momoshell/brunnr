# List Available and Installed Items

> View what's in your brunnr catalog and what's installed in your project.

## Overview

The `list` command shows you the contents of your brunnr catalog and what's currently installed in your project.

## Syntax

```bash
# List all sections
just -f ~/.config/brunnr/justfile list

# List specific section
just -f ~/.config/brunnr/justfile list <section>
```

Where `<section>` is one of: `skill`, `agent`, `prompt`

## Listing All Sections

```bash
just -f ~/.config/brunnr/justfile list
```

Output shows all catalog sections with their contents:

```
brunnr catalog sections:

skills:
  code-reviewer
  test-writer
  doc-generator

agents:
  security-auditor
  performance-reviewer
  docs-checker

prompts:
  pr-description
  commit-message
  code-explain
```

## Listing Skills

```bash
just -f ~/.config/brunnr/justfile list skill
```

Output shows both available and installed skills:

```
Available skills:
  code-reviewer
  test-writer
  doc-generator

Installed skills:
  code-reviewer
  test-writer
```

## Listing Agents

```bash
just -f ~/.config/brunnr/justfile list agent
```

Output:

```
Available agents:
  security-auditor
  performance-reviewer
  docs-checker

Installed agents:
  security-auditor
```

## Listing Prompts

```bash
just -f ~/.config/brunnr/justfile list prompt
```

Output:

```
Available prompts:
  pr-description
  commit-message
  code-explain
  complex-review

Installed prompts:
  pr-description
  commit-message
```

## Understanding Status

Items can have different statuses:

| Status | Meaning |
|--------|---------|
| **Available** | In brunnr catalog but not installed in current project |
| **Installed** | Present in current project |

## Checking for Modifications

To see if installed items differ from brunnr:

```bash
# Compare a skill
diff -r ~/.config/brunnr/skills/code-reviewer .claude/skills/code-reviewer

# Compare an agent
diff ~/.config/brunnr/agents/security-auditor.md .claude/agents/security-auditor.md

# Compare a prompt
diff ~/.config/brunnr/prompts/pr-description.md .claude/commands/pr-description.md
```

## Finding Dependencies

To see what depends on an item:

```bash
# Search for references to a skill
grep -r "code-reviewer" ~/.config/brunnr/library.yaml

# Search in installed items
grep -r "code-reviewer" .claude/
```

## Library.yaml as Source of Truth

The most detailed information is in `library.yaml`:

```bash
# View full catalog
cat ~/.config/brunnr/library.yaml

# Filter for specific item
grep -A 10 "name: code-reviewer" ~/.config/brunnr/library.yaml
```

## Use Cases

### Before Adding

Check if an item is already installed before trying to add it:

```bash
just -f ~/.config/brunnr/justfile list skill | grep code-reviewer
```

### Before Removing

Check for dependents before removing:

```bash
# List installed items that might depend on this
grep -r "code-reviewer" .claude/
```

### After Syncing

Verify new items are available after syncing:

```bash
just -f ~/.config/brunnr/justfile sync
just -f ~/.config/brunnr/justfile list
```

## Scripting with List

The list output can be used in scripts:

```bash
# Get all available skills
just -f ~/.config/brunnr/justfile list skill | grep -A 100 "Available" | tail -n +2

# Check if specific skill is installed
just -f ~/.config/brunnr/justfile list skill | grep -q "code-reviewer" && echo "Installed"
```

## Troubleshooting

### Empty lists

If a section shows as empty:

```bash
# Check brunnr home is set correctly
echo $BRUNNR_HOME

# Verify directory structure
ls -la ~/.config/brunnr/
```

### Missing items

If an item is in brunnr but not showing:

```bash
# Check library.yaml is valid
head ~/.config/brunnr/library.yaml

# Check file exists
ls ~/.config/brunnr/skills/<name>/
```

## See Also

- [`add.md`](add.md) — How to add items to your project
- [`remove.md`](remove.md) — How to remove items
- [`search.md`](search.md) — How to search the catalog
