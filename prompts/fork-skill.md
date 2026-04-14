---
name: fork-skill
description: Fork an externally-referenced skill into the brunnr repo — converts a remote or local reference to repo-backed so it can be edited and optimized. Use this when autoresearch-skill tells you to fork a skill first, or when you want to take ownership of an external skill.
type: single
tags: [skills, fork, import, catalog]
dependencies:
  skills: []
  agents: []
---

# Fork an external skill into brunnr

Convert a `file://` or `https://` referenced skill into a repo-backed skill so it can be edited, optimized with `/autoresearch-skill`, and versioned in brunnr.

## Parameters

| Parameter | Meaning |
|---|---|
| `SKILL_NAME` | Name of the skill as listed in `library.yaml` |

## Steps

### 1. Look up the skill in `library.yaml`

Find the entry by name. Verify the source is external:
- If `source` starts with `file://` — it's a local reference
- If `source` starts with `https://` — it's a remote reference
- If it's already a repo-backed path — **stop**, the skill is already in brunnr. Nothing to do.

### 2. Fetch the content

- **Local reference** (`file://`): read the file from the absolute path.
- **Remote reference** (`https://`): fetch the raw content from the URL.

If the fetch fails, stop and report the error. Do not create partial files.

### 3. Copy into brunnr

Create the skill directory and write the content:

```
skills/<SKILL_NAME>/SKILL.md
```

If the skill has additional files (scripts, templates) referenced in its content, fetch those too and place them in the same directory structure.

If `skills/<SKILL_NAME>/` already exists, **stop** — do not overwrite. Ask the user what to do.

### 4. Update `library.yaml`

Change the entry's `source` from the external URL/path to the repo-backed path:

```yaml
# Before
- name: my-skill
  source: https://raw.githubusercontent.com/org/repo/main/skills/my-skill/SKILL.md

# After
- name: my-skill
  source: skills/my-skill/SKILL.md
  origin: https://raw.githubusercontent.com/org/repo/main/skills/my-skill/SKILL.md
```

- Set `source` to `skills/<SKILL_NAME>/SKILL.md`
- Preserve the original URL/path in `origin` for attribution
- Keep all other fields (`tags`, `dependencies`, `sync`, etc.) unchanged
- Set `sync` to `manual` if it was previously `auto` or `never` — auto-sync no longer applies since the source changed

### 5. Report

Tell the user:
- The skill is now repo-backed at `skills/<SKILL_NAME>/SKILL.md`
- The original source is preserved in `origin`
- They can now run `/gen-evals` and `/autoresearch-skill` on it
- Remind them to commit the new files
