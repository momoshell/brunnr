# List Available and Installed Items

> View what's in your brunnr catalog and what's installed in your project.

## Overview

The `list` command shows you the contents of your brunnr catalog (from `library.yaml`) and what's currently installed in your project.

## Syntax

```bash
brunnr list [-g|--global] [<section>]
```

| Arg | Meaning |
|---|---|
| `-g`, `--global` | Show what's installed in `~/.pi/agent/<section>s/` (every-project scope) instead of `.pi/<section>s/` (project scope). Only affects the "Installed" section of the output — the "Available" catalog list is the same in both scopes. |
| `<section>` | Optional: `skill`, `agent`, `prompt`, `extension`, or `theme`. Without it, prints the catalog index for all sections. |

## Examples

```bash
brunnr list                # full catalog index
brunnr list agent          # agents — catalog + project-installed
brunnr list -g agent       # agents — catalog + globally-installed
brunnr list -g extension   # what extensions are installed for every project
```

## Listing All Sections

```bash
just -f ~/.config/brunnr/justfile list
```

Output shows all catalog sections with names and descriptions:

```
brunnr catalog sections:

skills:
  (none)

agents:
  autoresearch - Autonomous researcher that iteratively modifies a target
  autoresearch-skill - Skill hill-climb optimizer (with plateau diagnosis)
  autoresearch-skill-gepa - Skill GEPA-style optimizer (reflection + Pareto)
  autoresearch-agent - Agent GEPA-style optimizer (trajectory-aware)
  eval-designer - Skill eval suite generator
  eval-designer-agent - Agent (trajectory-style) eval suite generator

prompts:
  autoresearch - /autoresearch
  autoresearch-skill - /autoresearch-skill
  autoresearch-skill-gepa - /autoresearch-skill-gepa
  autoresearch-pipeline - /autoresearch-pipeline (multi-agent)
  autoresearch-agent - /autoresearch-agent
  gen-evals - /gen-evals (skills)
  gen-evals-agent - /gen-evals-agent (agents)
  fork-skill - /fork-skill
  fork-agent - /fork-agent
  skill-status - /skill-status
  agent-status - /agent-status

extensions:
  eitri - Meta-agent that builds Pi components

themes:
  (none)
```

## Listing Skills

```bash
just -f ~/.config/brunnr/justfile list skill
```

Output shows both available and installed skills:

```
Available skills:
  (none)

Installed skills:
  (none)
```

## Listing Agents

```bash
just -f ~/.config/brunnr/justfile list agent
```

Output:

```
Available agents:
  autoresearch - Autonomous researcher
  autoresearch-skill - Skill hill-climb optimizer
  autoresearch-skill-gepa - Skill GEPA-style optimizer
  autoresearch-agent - Agent GEPA-style optimizer
  eval-designer - Skill eval suite generator
  eval-designer-agent - Agent eval suite generator

Installed agents:
  autoresearch-skill
```

## Listing Prompts

```bash
just -f ~/.config/brunnr/justfile list prompt
```

Output:

```
Available prompts:
  autoresearch - /autoresearch
  autoresearch-skill - /autoresearch-skill
  autoresearch-skill-gepa - /autoresearch-skill-gepa
  autoresearch-pipeline - /autoresearch-pipeline
  autoresearch-agent - /autoresearch-agent
  gen-evals - /gen-evals
  gen-evals-agent - /gen-evals-agent
  fork-skill - /fork-skill
  fork-agent - /fork-agent
  skill-status - /skill-status
  agent-status - /agent-status

Installed prompts:
  skill-status
  gen-evals
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
ruby -ryaml -e "puts YAML.load_file('~/.config/brunnr/library.yaml')['agents'].find { |a| a['name'] == 'autoresearch-skill' }.to_yaml"
```

## Checking for Modifications

To see if installed items differ from brunnr:

```bash
# Compare an agent
diff ~/.config/brunnr/agents/autoresearch-skill.md .pi/agents/autoresearch-skill.md

# Compare a prompt
diff ~/.config/brunnr/prompts/skill-status.md .pi/prompts/skill-status.md

# Compare a directory-style item (skill or extension)
diff -r ~/.config/brunnr/extensions/eitri .pi/extensions/eitri
```

## Finding Dependencies

To see what depends on an item:

```bash
# Search for references to an agent in library.yaml
ruby -ryaml -e "
  catalog = YAML.load_file('~/.config/brunnr/library.yaml')
  catalog.values.flatten.each do |item|
    deps = item['dependencies'] || {}
    if deps['agents']&.include?('autoresearch-skill')
      puts \"#{item['name']} depends on autoresearch-skill\"
    end
  end
"
```

## Use Cases

### Before Adding

Check if an item is already installed before trying to add it:

```bash
just -f ~/.config/brunnr/justfile list agent | grep autoresearch-skill
```

### Before Removing

Check for dependents before removing:

```bash
# List installed items that might depend on this
grep -r "autoresearch-skill" .pi/
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
# Get all available agent names
just -f ~/.config/brunnr/justfile list agent | ruby -lane "puts $_.split(' - ').first if $_ =~ /^  \w/"

# Check if specific agent is installed
just -f ~/.config/brunnr/justfile list agent | grep -q "autoresearch-skill" && echo "Installed"
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
