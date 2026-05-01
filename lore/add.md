# Add Items to Your Project

> Install skills, agents, and prompts from brunnr into your current project.

## Overview

The `add` command copies items from your brunnr catalog to the current project. It uses `library.yaml` as the authoritative source and ensures safe, non-destructive installation.

## Syntax

```bash
just -f ~/.config/brunnr/justfile add <section> <name>
```

Where:
- `<section>` is one of: `skill`, `agent`, `prompt`, `extension`, `theme`
- `<name>` is the item name as listed in `library.yaml`

## How It Works

The `add` command follows a catalog-aware resolution process:

1. **Lookup**: Finds the item in `library.yaml` by name within the section
2. **Source Resolution**: Resolves the `source` field to determine the actual file location:
   - **Repo-backed**: Path relative to BRUNNR_HOME (e.g., `skills/code-reviewer/SKILL.md`)
   - **file://**: Absolute local path (e.g., `file:///Users/me/.local/share/...`)
   - **Remote (https://)**: Not supported in this phase - fails with clear message
3. **Validation**: Checks that source exists and target doesn't conflict
4. **Installation**: Copies from resolved source to target directory

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

Skills are installed to `.pi/skills/<skill-name>/`.

## Adding Agents

Agents are specialized AI configurations for specific tasks:

```bash
# Add a security auditor agent
just -f ~/.config/brunnr/justfile add agent security-auditor

# Add a performance reviewer agent
just -f ~/.config/brunnr/justfile add agent performance-reviewer
```

Agents are installed to `.pi/agents/<agent-name>.md`.

## Adding Prompts

Prompts are single-shot instructions or templates:

```bash
# Add a PR description prompt
just -f ~/.config/brunnr/justfile add prompt pr-description

# Add a commit message prompt
just -f ~/.config/brunnr/justfile add prompt commit-message
```

Prompts are installed to `.pi/prompts/<prompt-name>.md`.

## Adding Extensions

Pi extensions are TypeScript modules loaded with `pi -e <path>`. They register tools, commands, shortcuts, and custom UI:

```bash
# Add the eitri meta-agent that builds Pi agents
just -f ~/.config/brunnr/justfile add extension eitri
```

Single-file extensions install to `.pi/extensions/<name>.ts`. **Directory-style extensions** route their files across multiple targets per the brunnr convention:

| Source path inside `<extension-dir>/` | Install target |
|---|---|
| `*.ts` (top level) | `.pi/extensions/` |
| `agents/<sub>/...` | `.pi/agents/<sub>/...` |
| `themes/<sub>/...` | `.pi/themes/<sub>/...` |

For example, `add extension eitri` installs `eitri.ts` to `.pi/extensions/` *and* the `agents/eitri/` expert tree to `.pi/agents/eitri/`.

## Adding Themes

Pi themes are .json files defining all 51 colour tokens:

```bash
# Add a theme (single-file install)
just -f ~/.config/brunnr/justfile add theme rose-pine
```

Themes are installed to `.pi/themes/<theme-name>.json`.

## Adding Multi-Agent Prompts

Multi-agent prompts are prompts that orchestrate multiple agents. They are stored alongside regular prompts with `type: multi-agent` metadata:

```bash
# Add a complex review workflow
just -f ~/.config/brunnr/justfile add prompt complex-review
```

Check library.yaml for required agents and install them manually if needed.

## Dependencies

Dependencies are documented in `library.yaml` but are NOT automatically installed. Check library.yaml before adding items to ensure required dependencies are available:

```bash
# Check what dependencies an item requires
ruby -ryaml -e "puts YAML.load_file('~/.config/brunnr/library.yaml')['agents'].find { |a| a['name'] == 'security-auditor' }['dependencies']"
```

Install any required dependencies manually before or after adding an item.

## Fail-Closed Behavior

The `add` command fails with clear error messages for:

| Error | Cause |
|-------|-------|
| `not found in library.yaml` | Item doesn't exist in catalog |
| `Source file not found` | Source path in library.yaml doesn't exist |
| `Remote sources not supported` | Source is https:// (not implemented) |
| `Unsupported source format` | Source has invalid format |
| `already installed` | Target directory already has this item |

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
ls -la .pi/skills/

# List installed agents
ls -la .pi/agents/

# List installed prompts
ls -la .pi/prompts/

# List installed extensions (.ts files)
ls -la .pi/extensions/

# List installed themes (.json files)
ls -la .pi/themes/
```

## See Also

- [`use.md`](use.md) — How to use installed items
- [`remove.md`](remove.md) — How to remove items safely
- [`push.md`](push.md) — How to push local changes back to brunnr
- [`list.md`](list.md) — How to list available items
- [`search.md`](search.md) — How to search the catalog
