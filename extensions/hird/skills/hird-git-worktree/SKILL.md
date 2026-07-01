---
name: "hird-git-worktree"
description: "Hird git worktree and branch hygiene protocol. Use when creating, inspecting, switching, cleaning, or validating git worktrees, branches, detached checkouts, or parallel task sandboxes."
license: "MIT"
compatibility: "Requires a git repository and local git CLI. Destructive git operations require explicit user approval."
metadata:
  owner: "hird"
  maturity: "bundled"
  domain: "git-worktree"
  reads:
    - "git status/branch/log/worktree"
    - "repository files relevant to branch state"
  writes:
    - "optional worktree or branch creation after approval"
  network: false
  destructive: false
  requires-approval:
    - "deleting worktrees or branches"
    - "reset, clean, rebase, force push, or checkout that discards work"
    - "writing outside the repository"
allowed-tools: "read grep find ls bash"
---
# Hird Git Worktree

## Purpose

Use this skill to manage safe parallel git workspaces for Hird tasks while preserving uncommitted work and branch provenance.

## Workflow

1. Inspect repo state with read-only git commands: `status`, `branch --show-current`, `worktree list`, and relevant `log`.
2. Identify target base commit/branch, task name, and intended worktree path.
3. Refuse ambiguous branch bases, dirty-state moves, or name collisions until clarified.
4. Prefer additive operations: create a new worktree/branch rather than mutating the current one.
5. After any approved creation, report path, branch, base, and next command to enter it.

## Safety gates

Ask before creating branches/worktrees if the location or base is uncertain. Require explicit approval before deletion, `git clean`, `git reset`, rebase, force-push, overwriting a path, or any command that can discard work.

## Output format

- `repo_state`: current branch, dirty/clean, existing worktrees
- `requested_action`: inspect | create | switch | clean | remove
- `plan`: exact git commands, with approval markers where needed
- `result`: completed | waiting-for-approval | blocked
- `next_step`: concise command or question

## Failure handling

If git metadata is missing, paths collide, branch ancestry is unclear, or uncommitted work is at risk, stop with `blocked` and state the safest recovery action.
