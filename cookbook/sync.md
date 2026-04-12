# Sync brunnr Across Devices

> Keep your brunnr catalog synchronized across multiple machines and team members.

## Overview

The `sync` command updates your local brunnr repository with the latest changes from the remote. This is essential for multi-device workflows and team collaboration.

## Syntax

```bash
just -f ~/.config/brunnr/justfile sync
```

## What Sync Does

1. **Fetches** latest changes from the remote repository
2. **Reports** any local modifications that would conflict
3. **Fast-forwards** if your local branch is behind
4. **Stops** if manual resolution is needed (diverged branches)

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

## Handling Conflicts

If you have local changes and the remote has diverged:

```bash
$ just -f ~/.config/brunnr/justfile sync
Error: Local changes would be overwritten
Please commit or stash your changes first
```

Options:

1. **Commit your changes**:
   ```bash
   cd ~/.config/brunnr
   git add .
   git commit -m "My local changes"
   git pull  # May need merge resolution
   ```

2. **Stash your changes**:
   ```bash
   cd ~/.config/brunnr
   git stash
   git pull
   git stash pop  # May have conflicts to resolve
   ```

3. **Discard local changes** (careful!):
   ```bash
   cd ~/.config/brunnr
   git reset --hard origin/main
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
    (cd ~/.config/brunnr && git pull --quiet 2>/dev/null) &
fi
```

Or use a cron job:

```bash
# Sync brunnr every hour
0 * * * * cd ~/.config/brunnr && git pull --quiet
```

## Troubleshooting

### "Not a git repository"

```bash
$ just -f ~/.config/brunnr/justfile sync
Error: Not a git repository
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

If sync results in merge conflicts:

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
