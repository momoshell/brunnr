# List Available and Installed Items

> View what's in your brunnr catalog and what's installed in your project.

## Overview

The `list` command shows you the contents of your brunnr catalog (from `library.yaml`) and what's currently installed in your project.

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

Output shows all catalog sections with names and descriptions:

```
brunnr catalog sections:

skills:
  code-reviewer - Review code for bugs, style, and best practices
  my-local-skill - Personal skill stored outside brunnr

agents:
  security-auditor - Audit code for security vulnerabilities
  external-agent - Reference to an agent from another repo

prompts:
  pr-description - Generate a pull request description from commits
  complex-review - Multi-agent code review with security, perf, and docs
  my-local-prompt - Personal prompt stored outside brunnr
```

## Listing Skills

```bash
just -f ~/.config/brunnr/justfile list skill
```

Output shows both available and installed skills:

```
Available skills:
  code-reviewer - Review code for bugs, style, and best practices
  my-local-skill - Personal skill stored outside brunnr

Installed skills:
  code-reviewer
```

## Listing Agents

```bash
just -f ~/.config/brunnr/justfile list agent
```

Output:

```
Available agents:
  security-auditor - Audit code for security vulnerabilities
  external-agent - Reference to an agent from another repo

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
  pr-description - Generate a pull request description from commits
  complex-review - Multi-agent code review with security, perf, and docs
  my-local-prompt - Personal prompt stored outside brunnr

Installed prompts:
  pr-description
```

## Understanding Status

Items can have different statuses:

| Status | Meaning |
|--------|---------|
| **Available** | In brunnr catalog (library.yaml) but not installed in current project |
| **Installed** | Present in current project |

## Library.yaml as Source of Truth

The `list` command reads from `library.yaml` which is the authoritative catalog. Each entry contains:

- `name`: Unique identifier
- `description`: What the item does
- `source`: Where the content lives (repo-backed, file://, or https://)
- `tags`: Searchable tags
- `dependencies`: Required skills, agents, or prompts

```bash
# View full catalog
cat ~/.config/brunnr/library.yaml

# View specific item details
ruby -ryaml -e "puts YAML.load_file('~/.config/brunnr/library.yaml')['skills'].find { |s| s['name'] == 'code-reviewer' }.to_yaml"
```

## Checking for Modifications

To see if installed items differ from brunnr:

```bash
# Compare a skill
diff -r ~/.config/brunnr/skills/code-reviewer .pi/skills/code-reviewer

# Compare an agent
diff ~/.config/brunnr/agents/security-auditor.md .pi/agents/security-auditor.md

# Compare a prompt
diff ~/.config/brunnr/prompts/pr-description.md .pi/prompts/pr-description.md
```

## Finding Dependencies

To see what depends on an item:

```bash
# Search for references to a skill in library.yaml
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

### Before Adding

Check if an item is already installed before trying to add it:

```bash
just -f ~/.config/brunnr/justfile list skill | grep code-reviewer
```

### Before Removing

Check for dependents before removing:

```bash
# List installed items that might depend on this
grep -r "code-reviewer" .pi/
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
# Get all available skill names
just -f ~/.config/brunnr/justfile list skill | ruby -lane "puts $_.split(' - ').first if $_ =~ /^  \w/"

# Check if specific skill is installed
just -f ~/.config/brunnr/justfile list skill | grep -q "code-reviewer" && echo "Installed"
```

## Troubleshooting

### Empty lists

If a section shows as empty:

```bash
# Check brunnr home is set correctly
echo $BRUNNR_HOME

# Verify library.yaml exists
ls -la ~/.config/brunnr/library.yaml
```

### Missing items

If an item is in brunnr but not showing:

```bash
# Check library.yaml is valid YAML
ruby -ryaml -e "YAML.load_file('~/.config/brunnr/library.yaml')"

# Check item exists in library.yaml
grep "name:" ~/.config/brunnr/library.yaml
```

## See Also

- [`add.md`](add.md) — How to add items to your project
- [`remove.md`](remove.md) — How to remove items
- [`search.md`](search.md) — How to search the catalog
