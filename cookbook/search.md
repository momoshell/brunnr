# Search the brunnr Catalog

> Find skills, agents, and prompts in your brunnr catalog.

## Overview

The `search` command helps you find items in your brunnr catalog by searching names, descriptions, and tags.

## Syntax

```bash
just -f ~/.config/brunnr/justfile search <query>
```

## Basic Search

```bash
# Search for anything related to "security"
just -f ~/.config/brunnr/justfile search security

# Search for review-related items
just -f ~/.config/brunnr/justfile search review

# Search for documentation items
just -f ~/.config/brunnr/justfile search doc
```

## What Gets Searched

The search command looks in:

1. **library.yaml** — Item names, descriptions, and tags
2. **Skill files** — SKILL.md content
3. **Agent files** — Markdown content and frontmatter
4. **Prompt files** — Markdown content and frontmatter

## Search Results

Results are grouped by section:

```bash
$ just -f ~/.config/brunnr/justfile search security
Searching brunnr catalog for 'security'...

library.yaml:
  skills: security-review (tags: security, audit)
  agents: security-auditor (description: Audit code for security vulnerabilities)

skills/security-review/SKILL.md
agents/security-auditor.md
```

## Advanced Search

### Case-Insensitive Search

Searches are case-insensitive by default:

```bash
# These find the same items
just -f ~/.config/brunnr/justfile search Security
just -f ~/.config/brunnr/justfile search SECURITY
just -f ~/.config/brunnr/justfile search security
```

### Multi-Word Search

Search for phrases with spaces:

```bash
just -f ~/.config/brunnr/justfile search "code review"
```

### Partial Matches

Search finds partial matches:

```bash
# Finds "documentation", "document", "doc-generator", etc.
just -f ~/.config/brunnr/justfile search doc
```

## Searching by Tag

To find items with specific tags:

```bash
# Search library.yaml directly for tags
grep -i "tags:.*performance" ~/.config/brunnr/library.yaml
```

## Searching by Type

To find multi-agent prompts specifically:

```bash
# Search for multi-agent type in library.yaml
grep -B 5 "type: multi-agent" ~/.config/brunnr/library.yaml
```

## Combining with List

Use search to find items, then list to see details:

```bash
# Find security items
just -f ~/.config/brunnr/justfile search security

# See if a specific one is installed
just -f ~/.config/brunnr/justfile list agent | grep security
```

## Searching Installed Items

To search only items installed in your current project:

```bash
# Search installed skills
grep -r "search-term" .claude/skills/

# Search installed agents
grep -r "search-term" .claude/agents/

# Search installed prompts
grep -r "search-term" .claude/commands/
```

## Finding Dependencies

To find what depends on a specific item:

```bash
# Search for references to a skill
grep -r "code-reviewer" ~/.config/brunnr/

# Search in library.yaml dependencies section
grep -A 20 "dependencies:" ~/.config/brunnr/library.yaml | grep "code-reviewer"
```

## Use Cases

### Discovering Available Items

```bash
# See all review-related capabilities
just -f ~/.config/brunnr/justfile search review

# See all testing-related items
just -f ~/.config/brunnr/justfile search test
```

### Finding the Right Tool

```bash
# What do we have for documentation?
just -f ~/.config/brunnr/justfile search doc

# What do we have for performance?
just -f ~/.config/brunnr/justfile search performance
```

### Checking for Duplicates

```bash
# Are there multiple security-related items?
just -f ~/.config/brunnr/justfile search security
# Review results to see if there's overlap
```

## Scripting with Search

The search output can be used in scripts:

```bash
# Count security items
just -f ~/.config/brunnr/justfile search security | wc -l

# Get just the filenames
just -f ~/.config/brunnr/justfile search review | grep "\.md$"

# Check if an item exists
if just -f ~/.config/brunnr/justfile search "my-skill" | grep -q "my-skill"; then
    echo "Found my-skill"
fi
```

## Troubleshooting

### No results found

```bash
$ just -f ~/.config/brunnr/justfile search xyz
Searching brunnr catalog for 'xyz'...
No matches in library.yaml
```

Possible causes:
- Item doesn't exist in catalog
- Typo in search term
- Item not registered in library.yaml

### Too many results

Narrow your search:

```bash
# Too broad
just -f ~/.config/brunnr/justfile search code

# More specific
just -f ~/.config/brunnr/justfile search "code review"
```

### Search is slow

For large catalogs, search may be slow. Consider:

```bash
# Search only library.yaml (faster)
grep -i "search-term" ~/.config/brunnr/library.yaml

# Use find for specific file types
find ~/.config/brunnr -name "*.md" -exec grep -l "search-term" {} \;
```

## Best Practices

1. **Use specific terms**: "security-audit" is better than "security"
2. **Check library.yaml first**: It's the fastest search target
3. **Combine with list**: Search to find, list to verify
4. **Search before adding**: Make sure the item exists
5. **Search before creating**: Avoid duplicating existing items

## See Also

- [`list.md`](list.md) — How to list available and installed items
- [`add.md`](add.md) — How to add found items to your project
- [library.yaml](../library.yaml) — The catalog index
