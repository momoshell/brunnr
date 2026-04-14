# Sync brunnr Across Devices

> Keep your brunnr catalog synchronized across multiple machines and team members.

## Overview

The `sync` command is a **safer reviewed workflow** that updates your local brunnr repository with the latest changes from the remote. It performs careful checks before pulling to prevent data loss.

## Syntax

```bash
just -f ~/.config/brunnr/justfile sync
```

## What Sync Does

1. **Verifies** brunnr is a git repository
2. **Checks** for uncommitted local changes (dirty working tree)
3. **Verifies** a remote is configured
4. **Fetches** latest changes from the remote
5. **Fast-forwards** if your local branch is behind (safe, no merge)
6. **Stops** with clear instructions if branches have diverged

## Safety Checks

The sync command performs these safety checks:

| Check | What It Does | Failure Message |
|-------|--------------|-----------------|
| Git repo | Verifies `.git` directory exists | "Error: ... is not a git repository" |
| Clean working tree | Checks for uncommitted changes | "Error: brunnr has uncommitted changes" |
| Remote configured | Verifies origin remote exists | "Error: No remote configured" |
| Upstream tracking | Ensures branch tracks remote | "Error: ... has no upstream tracking" |
| Fast-forward only | Only pulls if local is behind | "Error: Branch has diverged from remote" |

## Personal Workflow (Single User, Multiple Devices)

### Device A (Work Machine)

```bash
# Make improvements
cd ~/.config/brunnr
# ... edit skills/agents/prompts ...

# Commit and push
git add .
git commit -m "Improve code-reviewer skill"
git push
```

### Device B (Home Machine)

```bash
# Sync to get latest changes
just -f ~/.config/brunnr/justfile sync

# Now your home machine has the improved code-reviewer
```

## Team Workflow (Multiple Users)

### Team Member Makes Changes

```bash
cd ~/.config/brunnr

# Create a feature branch
git checkout -b add-performance-skill

# Add new skill
mkdir skills/performance-reviewer
cp ~/performance-reviewer.md skills/performance-reviewer/SKILL.md

# Update library.yaml
# ... edit library.yaml to register the new skill ...

# Commit and push branch
git add .
git commit -m "Add performance-reviewer skill"
git push -u origin add-performance-skill
```

### Team Lead Reviews

```bash
# Review the pull request via GitHub/GitLab/etc.
# Merge after approval
```

### Other Team Members Sync

```bash
# Get the new skill
just -f ~/.config/brunnr/justfile sync

# Now available to install
just -f ~/.config/brunnr/justfile list skill
```

## Handling Errors

### Dirty Working Tree

If you have uncommitted local changes:

```bash
$ just -f ~/.config/brunnr/justfile sync
Error: brunnr has uncommitted changes
Please commit or stash your changes before syncing.

Modified files:
 M skills/code-reviewer/SKILL.md
```

Options:

1. **Commit your changes**:
   ```bash
   cd ~/.config/brunnr
   git add .
   git commit -m "My local changes"
   just -f ~/.config/brunnr/justfile sync
   ```

2. **Stash your changes** (to sync now, restore later):
   ```bash
   cd ~/.config/brunnr
   git stash
   just -f ~/.config/brunnr/justfile sync
   git stash pop  # May have conflicts to resolve
   ```

3. **Discard local changes** (careful!):
   ```bash
   cd ~/.config/brunnr
   git reset --hard origin/main
   just -f ~/.config/brunnr/justfile sync
   ```

### Diverged Branch

If local and remote have diverged:

```bash
$ just -f ~/.config/brunnr/justfile sync
Error: Branch has diverged from remote
Local: 3 commit(s) ahead
Remote: 2 commit(s) behind

Manual merge required. Options:
  1. Review and merge: cd ~/.config/brunnr && git merge origin/main
  2. Rebase if safe: cd ~/.config/brunnr && git rebase origin/main
  3. Reset to remote: cd ~/.config/brunnr && git reset --hard origin/main
```

### No Upstream Tracking

If your branch doesn't track a remote branch:

```bash
$ just -f ~/.config/brunnr/justfile sync
Error: Current branch 'main' has no upstream tracking
Set upstream with: git push -u origin main
```

## After Syncing

After syncing, you may want to:

1. **Update your projects**:
   ```bash
   cd your-project
   just -f ~/.config/brunnr/justfile list skill
   # See if any installed skills have updates
   ```

2. **Install new items**:
   ```bash
   just -f ~/.config/brunnr/justfile add skill new-skill-from-sync
   ```

3. **Push local improvements** (if you made changes):
   ```bash
   just -f ~/.config/brunnr/justfile push skill my-improved-skill
   cd ~/.config/brunnr && git push
   ```

## Sync Frequency

Recommended sync timing:

- **Daily**: Start of workday to get team updates
- **Before adding**: Ensure you're getting the latest version
- **After pushing**: Confirm your changes are on remote
- **When missing items**: If an item referenced by teammates isn't found

## Automated Sync

You can add sync to your shell startup:

```bash
# In ~/.bashrc or ~/.zshrc
if [ -d ~/.config/brunnr/.git ]; then
    (cd ~/.config/brunnr && git fetch 2>/dev/null) &
fi
```

Or use a cron job:

```bash
# Sync brunnr every hour
0 * * * * cd ~/.config/brunnr && git fetch 2>/dev/null
```

> **Note**: Automated sync via cron should only fetch, not pull. Use the `sync` command interactively to ensure proper conflict handling.

## Troubleshooting

### "Not a git repository"

```bash
$ just -f ~/.config/brunnr/justfile sync
Error: ~/.config/brunnr is not a git repository
```

Your brunnr directory isn't a git clone. Fix:

```bash
# If you have a remote repository
cd ~/.config/brunnr
git init
git remote add origin <your-repo-url>
git fetch
git checkout -b main origin/main
```

### "Permission denied"

```bash
# Check remote URL
cd ~/.config/brunnr
git remote -v

# If using HTTPS, consider switching to SSH
git remote set-url origin git@github.com:username/brunnr.git
```

### "Merge conflicts"

If you manually merge and get conflicts:

```bash
cd ~/.config/brunnr

# See conflicting files
git status

# Resolve conflicts in each file
# Then:
git add .
git commit -m "Merge remote changes"
```

## Best Practices

1. **Sync before starting work**: Get latest changes before editing
2. **Sync before pushing**: Avoid push conflicts
3. **Commit before syncing**: Prevent losing work
4. **Use branches for big changes**: Avoid blocking the main branch
5. **Sync regularly**: Stay up to date with team improvements

## See Also

- [`push.md`](push.md) — How to push local changes to brunnr
- [`add.md`](add.md) — How to add items after syncing
- [`list.md`](list.md) — How to see what's available after syncing
