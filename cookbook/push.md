# Push Local Changes to brunnr

> Contribute improvements from your project back to the central brunnr catalog.

## Overview

When you improve a skill, agent, or prompt in your local project, you can push those changes back to brunnr to share them across your devices and team. The `push` command is a **safer reviewed workflow** that checks the catalog before copying.

## When to Push

Push changes when:
- You've created a new item you want to share in brunnr
- You've fixed bugs or updated documentation in a new item

> **Note**: Push is for **new items only**. If the item already exists in brunnr, push will fail. To update an existing item, you must manually copy files after comparing versions (see [Updating Existing Items](#updating-existing-items)).

## Syntax

```bash
just -f ~/.config/brunnr/justfile push <section> <name>
```

Where:
- `<section>` is one of: `skill`, `agent`, `prompt`
- `<name>` is the item name

## Pushing Skills

```bash
# Push an improved skill back to brunnr
just -f ~/.config/brunnr/justfile push skill my-improved-skill
```

This copies `.claude/skills/my-improved-skill/` to `~/.config/brunnr/skills/`.

## Pushing Agents

```bash
# Push an improved agent back to brunnr
just -f ~/.config/brunnr/justfile push agent my-improved-agent
```

This copies `.claude/agents/my-improved-agent.md` to `~/.config/brunnr/agents/`.

## Pushing Prompts

```bash
# Push an improved prompt back to brunnr
just -f ~/.config/brunnr/justfile push prompt my-improved-prompt
```

This copies `.claude/commands/my-improved-prompt.md` to `~/.config/brunnr/prompts/`.

## Safety Behavior

The `push` command follows these safety rules:

1. **Catalog awareness**: Checks `library.yaml` to determine the source type
2. **Source type enforcement**: Refuses to push to local (`file://`) or remote (`https://`) references
3. **Conflict detection**: If the item already exists in brunnr, warns and stops
4. **Clear reporting**: Shows exactly what would change or why push is not allowed

## Source Type Restrictions

The push command only works with **repo-backed** sources (items stored in brunnr):

| Source Type | Example | Push Allowed? |
|-------------|---------|---------------|
| Repo-backed | `skills/my-skill/SKILL.md` | Yes |
| Local reference | `file:///Users/me/path/to/skill.md` | No |
| Remote reference | `https://raw.githubusercontent.com/...` | No |

### If Source is Local Reference

```bash
$ just -f ~/.config/brunnr/justfile push skill my-local-skill
Error: Source is external - cannot push to file:// reference
Source: file:///Users/me/.local/share/skills/my-skill
Local references cannot be pushed to brunnr.
```

### If Source is Remote Reference

```bash
$ just -f ~/.config/brunnr/justfile push skill external-skill
Error: Source is remote - cannot push to remote reference
Source: https://raw.githubusercontent.com/org/repo/main/skills/external-skill.md
Remote references cannot be pushed to brunnr.
```

## Updating Existing Items

Push will fail if the item already exists in brunnr:

```bash
$ just -f ~/.config/brunnr/justfile push skill code-reviewer
Warning: skill 'code-reviewer' already exists in brunnr
Review differences manually before overwriting.
Source: ~/.config/brunnr/skills/code-reviewer
Target: .claude/skills/code-reviewer
```

To update an existing item, manually compare and copy:

1. **Compare versions**:
   ```bash
   diff -r ~/.config/brunnr/skills/code-reviewer .claude/skills/code-reviewer
   # or use a visual diff tool
   ```

2. **Decide which version is authoritative** or merge changes manually

3. **Manually copy after reviewing**:
   ```bash
   # Copy from your project to brunnr
   cp -r .claude/skills/code-reviewer ~/.config/brunnr/skills/
   ```

4. **Update library.yaml if needed** (e.g., description, tags)

5. **Commit your changes**:
   ```bash
   cd ~/.config/brunnr
   git add .
   git commit -m "Update code-reviewer"
   ```

## After Pushing

After pushing to brunnr, you **must** update `library.yaml`:

1. **If this is a new item**, add an entry:
   ```yaml
   skills:
     - name: my-new-skill
       description: What this skill does
       source: skills/my-new-skill/SKILL.md
   ```

2. **Commit and push brunnr**:
   ```bash
   cd ~/.config/brunnr
   git add .
   git commit -m "Add/improve my-new-skill"
   git push
   ```

3. **Sync other devices**:
   ```bash
   # On other machines
   just -f ~/.config/brunnr/justfile sync
   ```

## Team Workflow

For team-maintained brunnr repositories:

1. **Push to a branch**:
   ```bash
   cd ~/.config/brunnr
   git checkout -b improve-security-auditor
   # ... push changes ...
   git add . && git commit -m "Improve security-auditor"
   git push -u origin improve-security-auditor
   ```

2. **Create a pull request** for team review

3. **Merge after approval**

4. **Team members sync**:
   ```bash
   just -f ~/.config/brunnr/justfile sync
   ```

## Best Practices

1. **Test before pushing**: Verify the item works in your project first
2. **Check the catalog**: Ensure the item is repo-backed before pushing
3. **Document changes**: Update descriptions and tags in library.yaml
4. **Atomic commits**: Push related changes together
5. **Review before force**: Never blindly overwrite brunnr source

## See Also

- [`add.md`](add.md) — How to add items from brunnr
- [`sync.md`](sync.md) — How to sync brunnr across devices
- [`remove.md`](remove.md) — How to remove items safely
