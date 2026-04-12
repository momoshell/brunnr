# Push Local Changes to brunnr

> Contribute improvements from your project back to the central brunnr catalog.

## Overview

When you improve a skill, agent, or prompt in your local project, you can push those changes back to brunnr to share them across your devices and team.

## When to Push

Push changes when:
- You've improved an existing item
- You've created a new item you want to share
- You've fixed bugs or updated documentation

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

1. **Conflict detection**: If the item already exists in brunnr and differs, the command warns and stops
2. **Explicit confirmation**: Overwriting brunnr source requires manual review
3. **Clear reporting**: Shows exactly what would change

## Handling Conflicts

If brunnr already has a different version:

```bash
$ just -f ~/.config/brunnr/justfile push skill code-reviewer
Warning: skill 'code-reviewer' already exists in brunnr
Review differences manually before overwriting.
Source: ~/.config/brunnr/skills/code-reviewer
Target: .claude/skills/code-reviewer
```

To resolve:

1. **Compare versions**:
   ```bash
   diff -r ~/.config/brunnr/skills/code-reviewer .claude/skills/code-reviewer
   ```

2. **Merge changes manually** or decide which version is authoritative

3. **Force push if needed** (use with caution):
   ```bash
   # Manually copy after reviewing
   cp -r .claude/skills/code-reviewer ~/.config/brunnr/skills/
   ```

## After Pushing

After pushing to brunnr, remember to:

1. **Update library.yaml** if this is a new item:
   ```yaml
   skills:
     - name: my-new-skill
       description: What this skill does
       file: my-new-skill/SKILL.md
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
2. **Document changes**: Update descriptions and tags in library.yaml
3. **Atomic commits**: Push related changes together
4. **Review before force**: Never blindly overwrite brunnr source

## See Also

- [`add.md`](add.md) — How to add items from brunnr
- [`sync.md`](sync.md) — How to sync brunnr across devices
- [`remove.md`](remove.md) — How to remove items safely
