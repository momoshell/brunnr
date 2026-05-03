# Add Items to Your Project (or Globally)

> Install skills, agents, prompts, extensions, or themes from brunnr — to the current project or to your user-level Pi config.

## Overview

The `add` command copies items from your brunnr catalog to a target directory Pi reads from. By default that's `.pi/<section>s/` in the current project. Pass `-g` to install globally to `~/.pi/agent/<section>s/`, where Pi picks them up for **every** project.

## Syntax

```bash
brunnr add [-g|--global] <section> <name>
```

| Arg | Meaning |
|---|---|
| `-g`, `--global` | Install to `~/.pi/agent/<section>s/` (every project gets it) |
| `<section>` | `skill`, `agent`, `prompt`, `extension`, or `theme` |
| `<name>` | The item name as listed in `library.yaml` |

## Project vs Global Scope

| Scope | Path | When to use |
|---|---|---|
| Project (default) | `.pi/<section>s/` | One-off use; per-project customization; experiments |
| Global (`-g`) | `~/.pi/agent/<section>s/` | Items you want in every project — meta-agents, eval generators, common prompts |

**Project entries shadow global ones on name collision** — Pi prefers the project-level item if both exist. So you can globally install `eitri` and still override it per project with `brunnr add extension eitri`.

## How It Works

The `add` command follows a catalog-aware resolution process:

1. **Lookup**: Finds the item in `library.yaml` by name within the section
2. **Source Resolution**: Resolves the `source` field to determine the actual file location:
   - **Repo-backed**: Path relative to BRUNNR_HOME (e.g., `skills/code-reviewer/SKILL.md`)
   - **file://**: Absolute local path (e.g., `file:///Users/me/.local/share/...`)
   - **Remote (https://)**: Not supported in this phase - fails with clear message
3. **Validation**: Checks that source exists and target doesn't conflict
4. **Installation**: Copies from resolved source to target directory

## Per-Section Targets

| Section | Project target | Global target (`-g`) |
|---|---|---|
| `skill` | `.pi/skills/<name>/` | `~/.pi/agent/skills/<name>/` |
| `agent` | `.pi/agents/<name>.md` | `~/.pi/agent/agents/<name>.md` |
| `prompt` | `.pi/prompts/<name>.md` | `~/.pi/agent/prompts/<name>.md` |
| `extension` | `.pi/extensions/<name>.ts` (single-file) or routed (directory-style — see below) | `~/.pi/agent/extensions/...` (same routing rules) |
| `theme` | `.pi/themes/<name>.json` | `~/.pi/agent/themes/<name>.json` |

### Directory-Style Extensions

Extensions can be a single `.ts` file or a directory tree (like `eitri`). For directory-style extensions, files route across multiple install targets:

| Source path inside `<extension-dir>/` | Project install target | Global install target |
|---|---|---|
| `*.ts` (top level) | `.pi/extensions/` | `~/.pi/agent/extensions/` |
| `agents/<sub>/...` | `.pi/agents/<sub>/...` | `~/.pi/agent/agents/<sub>/...` |
| `themes/<sub>/...` | `.pi/themes/<sub>/...` | `~/.pi/agent/themes/<sub>/...` |

`brunnr add -g extension eitri` installs `eitri.ts` globally *and* routes the `agents/eitri/` expert tree into the global agents directory.

## Examples

```bash
# Skill — only useful for one project
brunnr add skill code-reviewer

# Agent + prompt — useful everywhere, install globally
brunnr add -g agent eval-designer
brunnr add -g prompt gen-evals

# Eitri meta-agent — definitely global
brunnr add -g extension eitri

# Theme — usually a personal preference, global
brunnr add -g theme my-dark-theme
```

## Dependencies

Dependencies are documented in `library.yaml` but are NOT automatically installed. Use `brunnr check` (or read `library.yaml`) to see what an item depends on, then install those manually.

## Fail-Closed Behavior

The `add` command fails with clear error messages for:

| Error | Cause |
|-------|-------|
| `not found in library.yaml` | Item doesn't exist in catalog |
| `Source file not found` | `source` path in library.yaml doesn't exist |
| `Remote sources not supported` | Source is `https://` (not implemented) |
| `already installed` | Target directory already has this item — message reports project / global scope |

## Handling Conflicts

```bash
$ brunnr add -g agent eval-designer
Error: agent 'eval-designer' already installed (global: ~/.pi/agent/agents/)
Use 'push' to update brunnr with local changes, or remove first.
```

Options:
1. **Keep local version**: do nothing — your edits are preserved
2. **Push to brunnr**: if your version is better, `brunnr push` it back
3. **Remove and re-add**: `brunnr remove [-g] <section> <name>` then `brunnr add` to get the catalog version

## See Also

- [`use.md`](use.md) — Invoke installed items inside Pi
- [`remove.md`](remove.md) — Uninstall items safely (also takes `-g`)
- [`list.md`](list.md) — See what's installed (also takes `-g`)
- [`search.md`](search.md) — Search the catalog
- [`push.md`](push.md) — Forge a new item into the catalog
