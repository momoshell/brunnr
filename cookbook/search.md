# Search the brunnr Catalog

> Find skills, agents, and prompts in your brunnr catalog.

## Overview

The `search` command helps you find items in your brunnr catalog by searching names, descriptions, and tags from `library.yaml`.

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

The search command looks in `library.yaml` catalog fields:

1. **name** — Item identifier
2. **description** — What the item does
3. **tags** — Searchable keywords

Results show the matching entry with its section, name, description, and tags.

## Search Results

```bash
$ just -f ~/.config/brunnr/justfile search security
Searching brunnr catalog for 'security'...

skill: code-reviewer - Review code for bugs, style, and best practices
  tags: review, code-quality, security

agent: security-auditor - Audit code for security vulnerabilities
  tags: security, audit, review
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

### Partial Matches

Search finds partial matches in names, descriptions, and tags:

```bash
# Finds items with "review" in name, description, or tags
just -f ~/.config/brunnr/justfile search review

# Finds items with "code" in any field
just -f ~/.config/brunnr/justfile search code
```

### Searching by Tag

Tags are automatically searched:

```bash
# Find items tagged with "audit"
just -f ~/.config/brunnr/justfile search audit

# Find items tagged with "multi-agent"
just -f ~/.config/brunnr/justfile search multi-agent
```

## Combining with List

Use search to find items, then list to see all available items:

```bash
# Find security items
just -f ~/.config/brunnr/justfile search security

# List all available items
just -f ~/.config/brunnr/justfile list
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
# Search library.yaml for dependencies
ruby -ryaml -e "
  catalog = YAML.load_file('~/.config/brunnr/library.yaml')
  catalog.values.flatten.each do |item|
    deps = item['dependencies'] || {}
    if deps['skills']&.include?('code-reviewer')
      puts \"#{item['name']} depends on code-reviewer\"
    end
  end
"
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
# Count matching items
just -f ~/.config/brunnr/justfile search security | wc -l

# Get just the item names
just -f ~/.config/brunnr/justfile search review | grep "^  \w" | cut -d' ' -f2

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

No matches found in catalog
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

### Library.yaml not found

```bash
$ just -f ~/.config/brunnr/justfile search test
Error: library.yaml not found at ~/.config/brunnr/library.yaml
```

Check that BRUNNR_HOME is set correctly:
```bash
echo $BRUNNR_HOME
```

## Best Practices

1. **Use specific terms**: "security" finds more than "audit"
2. **Check tags**: Tags are searchable and often more precise
3. **Combine with list**: Search to find, list to see all options
4. **Search before adding**: Make sure the item exists
5. **Search before creating**: Avoid duplicating existing items

## See Also

- [`list.md`](list.md) — How to list available and installed items
- [`add.md`](add.md) — How to add found items to your project
- [library.yaml](../library.yaml) — The catalog index
