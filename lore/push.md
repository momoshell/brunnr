# Push Local Changes to brunnr

> Forge new skills, agents, and prompts into the central brunnr catalog with a single command.

## Overview

`brunnr push` is the one-command workflow for proposing a new item to the brunnr catalog. It copies the file, registers it in `library.yaml` from its frontmatter, runs `brunnr check`, creates a feature branch, commits, pushes, and opens a GitHub pull request.

```bash
brunnr push <section> <name>
```

`<section>` is one of: `skill`, `agent`, `prompt`. Auto-push is **not supported** for `extension` or `theme` (no frontmatter metadata to derive entries from — see [Extensions and Themes](#extensions-and-themes)).

## When to Push

Push when you have a new item ready to publish to the catalog. Push is for **new items only** — if the item is already registered in `library.yaml`, push refuses and tells you to edit the entry under `~/.config/brunnr/` directly.

## Prerequisites

| Requirement | Why |
|---|---|
| The item exists in your project (e.g. `.pi/skills/<name>/SKILL.md`) | Push reads it from there |
| Frontmatter has `name`, `description`, `tags` | Used to populate the `library.yaml` entry |
| `name` in frontmatter matches the push target | Catalog integrity (catches typos) |
| brunnr's working tree is clean | Push won't commingle stray edits into the auto-commit |
| `origin` remote configured on brunnr | Push needs somewhere to push to |
| `gh` CLI installed and authenticated | Required only for opening the PR — branch still pushes without it |

## What Push Does

```
brunnr push skill security-review
```

Step by step:

1. **Validates section** — `skill`, `agent`, `prompt` only
2. **Locates the file** — `.pi/skills/<name>/SKILL.md`, `.pi/agents/<name>.md`, or `.pi/prompts/<name>.md`
3. **Checks library.yaml** — refuses if the name already exists, even with an external (`file://` / `https://`) source
4. **Validates frontmatter** — `name`, `description`, `tags` required; `name` must match push target
5. **Pre-flight git checks** — clean working tree, `origin` remote exists, branch `add-<name>` doesn't already exist
6. **Branches** — `git checkout -b add-<name> origin/main`
7. **Copies the file** into the brunnr repo
8. **Upserts library.yaml** — appends a new entry preserving section comments and ordering. Handles the `<section>: []` → multi-line conversion when adding the first item to an empty section.
9. **Runs `brunnr check`** — full catalog validation; if it fails, *all* changes are reverted (file copy, library.yaml edit, branch deletion)
10. **Commits** — message `Add <name> <section>`
11. **Pushes the branch** to `origin`
12. **Opens a PR** via `gh pr create` with a generated title and body

The PR title is `Add <name> <section>` and the body summarises the source path, registry section, and that `brunnr check` passed.

## Output

```bash
$ brunnr push skill security-review
Validating with brunnr check...
library.yaml: parsed OK
  skills      4
  agents      6
  prompts     11
  extensions  1
  themes      0

All checks passed.

Forged: security-review (skill)
  https://github.com/your-org/brunnr/pull/42
```

## Failure Modes

Push fails fast with a clear error and **never leaves the brunnr repo in a half-modified state**:

| Failure | Behavior |
|---|---|
| Frontmatter missing required fields | Bails before any git ops |
| Item already in `library.yaml` | Bails, points you to the existing entry |
| External source (`file://` / `https://`) | Bails, suggests `/fork-skill` or `/fork-agent` |
| Working tree dirty | Bails with `git status --porcelain` |
| Branch `add-<name>` already exists | Bails with delete instructions |
| `brunnr check` fails after upsert | Reverts file copy + library.yaml change, deletes branch, returns to default branch |
| `git push` fails (network, auth) | Local commit is preserved; prints manual `git push` hint |
| `gh` not installed or not authenticated | Branch still pushes; prints manual `gh pr create` hint |
| `gh pr create` fails | Branch already pushed; prints manual create command |

## Extensions and Themes

Auto-push is unavailable for `extension` and `theme` because:

- **Extensions** can be either single-file (`extensions/<name>.ts`) or directory-style (`extensions/<name>/` with routed install paths to `.pi/agents/<name>/` and `.pi/themes/<name>/`). The directory-style routing isn't reversible, and TypeScript files don't carry frontmatter to derive a `library.yaml` entry from.
- **Themes** are single `.json` files with no metadata channel for `description` or `tags`.

For these, edit files directly:

```bash
cd ~/.config/brunnr
# Edit extensions/<name>/ or themes/<name>.json
$EDITOR library.yaml          # add/update the entry
brunnr check                  # validate
git checkout -b add-<name>
git add . && git commit -m "Add <name> extension"
git push -u origin add-<name>
gh pr create
```

## Updating Existing Items

`brunnr push` is for new items. To update an existing entry:

1. Edit the file in `~/.config/brunnr/<section>s/<name>...` directly.
2. Update `library.yaml` if metadata (description, tags, dependencies) changed.
3. `brunnr check` to validate.
4. Commit + PR with `git`/`gh`.

Reasoning: updates need human judgement on what changed and why. Auto-overwrite would silently clobber the description, tags, or dependencies a maintainer hand-edited.

## Solo vs Team Use

- **Solo brunnr** (you are the only contributor): self-merge the PR (`gh pr merge --auto --squash`) and you're done. The PR adds a review checkpoint for free without slowing you down.
- **Team brunnr**: PRs are reviewed by maintainers; merged items become available to all team members after `brunnr sync`.

Run `brunnr status` any time to see the queue of open PRs ("items waiting to be forged").

## See Also

- [`add.md`](add.md) — Install items from brunnr into a project
- [`sync.md`](sync.md) — Sync brunnr across devices
- [`remove.md`](remove.md) — Remove items safely
