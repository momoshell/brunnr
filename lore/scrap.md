# Scrap an Item from brunnr

> Open a PR that removes a skill, agent, or prompt from the catalog. The deletion counterpart to [`push`](push.md).

## Syntax

```bash
brunnr scrap <section> <name>
```

`<section>` is `skill`, `agent`, or `prompt`. Extensions and themes are not supported (no auto-managed entries — edit them under `~/.config/brunnr/` directly).

## What It Does

1. Verifies the item is in `library.yaml` and repo-backed (refuses external `file://` / `https://` sources)
2. **Dependency check** — scans every other catalog entry's `dependencies` and refuses with the list of dependents if any item references this one
3. Pre-flight git checks: clean working tree, `origin` remote, branch `scrap-<name>` doesn't already exist
4. Branches `scrap-<name>` from `origin/main`
5. Deletes the file (`skills/<name>/`, `agents/<name>.md`, or `prompts/<name>.md`)
6. Removes the `library.yaml` entry, preserving section comments and converting `<key>:` back to `<key>: []` if the section becomes empty
7. Runs `brunnr check` — reverts everything if validation fails
8. Commits `Scrap <name> <section>`, pushes, opens a PR via `gh pr create`

## Output

```bash
$ brunnr scrap agent stale-optimizer
Validating with brunnr check...
All checks passed.

Scrapped: stale-optimizer (agent)
  https://github.com/your-org/brunnr/pull/47
```

If another item depends on the target:

```bash
$ brunnr scrap skill code-reviewer
Error: skill 'code-reviewer' is a dependency of:
  - agents/review-pipeline
  - prompts/run-review

Scrap those items first, or remove the dependency from their library.yaml entry.
```

## Failure Modes

| Failure | Behavior |
|---|---|
| Entry not in `library.yaml` | Bails with "not found" |
| External source (`file://` / `https://`) | Bails — manual deletion required |
| Other items depend on this one | Bails with the list of dependents |
| Working tree dirty | Bails with `git status --porcelain` |
| Branch `scrap-<name>` already exists | Bails with delete instructions |
| `brunnr check` fails after deletion | Reverts file deletion + library.yaml edit, returns to default branch |
| `git push` / `gh pr create` fails | Local commit preserved, manual hint printed |

## See Also

- [`push.md`](push.md) — The forge counterpart for adding items
- [`check.md`](check.md) — The validation step `scrap` runs internally
