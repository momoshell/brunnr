# Validate library.yaml

> Verify that every catalog entry resolves and the index is consistent. Run before committing manual edits to `library.yaml`.

## Syntax

```bash
brunnr check
```

No arguments. Validates the `library.yaml` at `$BRUNNR_HOME`.

## What It Validates

| Check | Failure mode |
|---|---|
| Required fields (`name`, `description`, `source`) | Hard error |
| Duplicate names within a section | Hard error |
| Source paths exist on disk (for repo-backed entries) | Hard error |
| Frontmatter `name:` matches `library.yaml` name | Hard error |
| Declared `dependencies.{skills,agents,prompts}` reference real catalog entries | Hard error |
| Prompt `type` is `single` or `multi-agent` if present | Hard error |
| Source files have YAML frontmatter | Warning |
| Files on disk that aren't registered in `library.yaml` (orphans) | Warning |

External sources (`file://` / `https://`) skip the path-existence and frontmatter checks.

## Output

```bash
$ brunnr check
library.yaml: parsed OK
  skills      0
  agents      6
  prompts     11
  extensions  1
  themes      0

All checks passed.
```

With a problem:

```bash
$ brunnr check
library.yaml: parsed OK
  skills      1
  agents      6
  prompts     11
  extensions  1
  themes      0

ERRORS (1):
  - skills[0] 'code-reviewer': frontmatter name `code-review` != library.yaml name `code-reviewer` (skills/code-reviewer/SKILL.md)
```

## When to Run

- **Before committing** any manual edit to `library.yaml`
- **Automatically** — `brunnr push` and `brunnr scrap` run it as a final gate and revert on failure
- **In CI** as a one-line gate: `brunnr check`

## See Also

- [`push.md`](push.md) — Forges an item and runs `check` automatically
- [`scrap.md`](scrap.md) — Scraps an item and runs `check` automatically
