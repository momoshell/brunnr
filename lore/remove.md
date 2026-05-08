# Remove Items From Your Project (or Globally)

> Uninstall skills, agents, prompts, extensions, or themes from a project — or from the global Pi config.

## Overview

The `remove` command undoes a `brunnr add`. It removes the file(s) from the install target. Pass `-g` to remove from the global location instead of the project. **`remove` never touches the brunnr catalog itself** — that's what `brunnr scrap` is for.

## Syntax

```bash
brunnr remove [-g|--global] <section> <name>
```

| Arg | Meaning |
|---|---|
| `-g`, `--global` | Remove from `~/.pi/agent/<section>s/` instead of `.pi/<section>s/` |
| `<section>` | `skill`, `agent`, `prompt`, `extension`, or `theme` |
| `<name>` | The installed item name |

## What Gets Removed

| Section | Project target | Global target (`-g`) |
|---|---|---|
| `skill` | `.pi/skills/<name>/` | `~/.pi/agent/skills/<name>/` |
| `agent` | `.pi/agents/<name>.md` | `~/.pi/agent/agents/<name>.md` |
| `prompt` | `.pi/prompts/<name>.md` | `~/.pi/agent/prompts/<name>.md` |
| `extension` | `.pi/extensions/<name>.ts` + matching `.pi/agents/<name>/` + `.pi/themes/<name>/` (for directory-style extensions) | Same routing under `~/.pi/agent/` |
| `theme` | `.pi/themes/<name>.json` | `~/.pi/agent/themes/<name>.json` |

For directory-style extensions, `remove` undoes all the routed installs (`.ts` plus the matching `agents/<name>/` and `themes/<name>/` subdirs) in one go.

## Examples

```bash
# Remove from project
brunnr remove skill code-reviewer
brunnr remove prompt skill-status

# Remove from global
brunnr remove -g agent eval-designer
brunnr remove -g prompt gen-evals
```

## Safety Behavior

- **Existence check**: fails if the item is not installed at the targeted scope (project or global).
- **Scope-isolated**: `-g` only touches `~/.pi/agent/`; without `-g`, only `.pi/` in the cwd.
- **No catalog mutation**: never edits `library.yaml` or the brunnr repo.
- **No dependency cascade**: dependencies are NOT removed automatically. If you remove a skill that an installed agent depended on, that agent is now an orphan with a broken dependency.

## Errors

```bash
$ brunnr remove agent eval-designer
Error: agent 'eval-designer' is not installed (project: .pi/agents/)
```

If you're removing globally:

```bash
$ brunnr remove -g agent eval-designer
Error: agent 'eval-designer' is not installed (global: /Users/me/.pi/agent/agents/)
```

The error always reports which scope it checked.

## Catalog vs Project

| Goal | Command |
|---|---|
| Uninstall from this project | `brunnr remove <section> <name>` |
| Uninstall from your global Pi config | `brunnr remove -g <section> <name>` |
| Delete the item from the catalog (everyone loses it) | `brunnr scrap <section> <name>` (opens a PR) |

## See Also

- [`add.md`](add.md) — Install items (also takes `-g`)
- [`list.md`](list.md) — See what's installed in either scope
- [`scrap.md`](scrap.md) — Open a PR removing an item from the catalog
