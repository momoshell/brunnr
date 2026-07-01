---
name: hird-github
description: "Hird GitHub and gh CLI protocol. Use when inspecting GitHub repositories, pull requests, issues, checks, workflows, releases, or repository metadata with gh while preserving token privacy, avoiding external mutations unless explicitly confirmed, and falling back to local git when GitHub access is unavailable."
license: "MIT"
compatibility: "Requires optional GitHub CLI gh for GitHub API access; falls back to local git read-only inspection when gh is unavailable, unauthenticated, or network access is denied."
metadata:
  owner: "hird"
  maturity: "bundled"
  domain: "github"
  tools:
    - "gh"
    - "git"
  network: "optional"
  default-mode: "read-only"
  token-handling: "never print, echo, store, or request tokens in chat; rely on existing gh authentication or environment"
  fallback: "local-git-read-only"
  safe-read-only-gh:
    - "gh repo view"
    - "gh pr view"
    - "gh pr list"
    - "gh pr diff"
    - "gh issue view"
    - "gh issue list"
    - "gh run list"
    - "gh run view"
    - "gh release view"
    - "gh release list"
    - "gh api -X GET"
  requires-explicit-confirmation:
    - "posting comments, reviews, statuses, labels, assignees, or issue edits"
    - "creating, editing, closing, reopening, merging, or deleting PRs/issues"
    - "pushing branches, creating tags, creating releases, or uploading assets"
    - "triggering, rerunning, cancelling, or approving workflows"
    - "changing repository settings, collaborators, permissions, secrets, variables, or environments"
    - "any gh api request using POST, PUT, PATCH, or DELETE"
allowed-tools: "read grep find ls bash"
---
# Hird GitHub / gh CLI

## Purpose

Use this skill to inspect GitHub repositories safely with `gh` and local `git`.

Default posture: **read-only, token-private, non-mutating**.

This skill may gather evidence from GitHub PRs, issues, checks, Actions runs, releases, repository metadata, and local git history. It must not post, edit, merge, trigger, push, approve, delete, or mutate anything unless the user gives explicit confirmation for the exact action.

## When to use

- Reviewing or triaging GitHub PRs, issues, checks, Actions runs, releases, or repository metadata.
- `/hird-pr-review` needs PR metadata, diff, checks, reviews, or changed files from GitHub.
- `/hird-next` or onboarding needs to inspect configured GitHub issue/PR sources.
- Shipping needs read-only release/check/run evidence.

## When not to use

- Do not use `gh` when local git evidence is sufficient and network/API access is unnecessary.
- Do not use it to mutate GitHub state without explicit confirmation.
- Do not ask the user to paste tokens or credentials.

## Setup checks

Before using `gh`, check availability without exposing secrets:

```bash
command -v gh
gh --version
gh auth status
```

Rules:

- `gh auth status` is allowed.
- Never run `gh auth token`.
- Never print, echo, copy, log, summarize, or ask the user to paste a token.
- If auth is missing, expired, insufficient, or network is denied, report that GitHub access is unavailable and fall back to local git.
- If command output contains a token-like value, redact it immediately as `[REDACTED]`.

## Safe read-only `gh` commands

These commands are allowed without extra confirmation when the user's task requires GitHub context:

```bash
gh repo view --json name,owner,url,defaultBranchRef,visibility,isPrivate
gh pr view <number-or-url> --json number,title,state,author,baseRefName,headRefName,url,body,mergeable,reviewDecision,commits,files,labels,assignees,reviews,statusCheckRollup
gh pr list --state open --json number,title,author,headRefName,baseRefName,isDraft,reviewDecision,statusCheckRollup,url
gh pr diff <number-or-url>
gh issue view <number-or-url> --json number,title,state,author,body,labels,assignees,comments,url
gh issue list --state open --json number,title,state,author,labels,assignees,url
gh run list --limit 20 --json databaseId,displayTitle,status,conclusion,event,headBranch,workflowName,url,createdAt,updatedAt
gh run view <run-id> --json databaseId,displayTitle,status,conclusion,jobs,url
gh release list --limit 20
gh release view <tag>
gh api -X GET <endpoint>
```

Prefer structured output:

```bash
gh pr view <number> --json number,title,state,url,files,statusCheckRollup
```

Avoid unnecessary logs. Workflow logs may contain sensitive operational data; fetch them only when needed for the task and summarize with redaction.

## Dangerous commands requiring explicit confirmation

Stop and ask before running any command that mutates GitHub, local git remotes, CI, releases, secrets, or repository configuration.

Require confirmation that names the exact action, target, and command. Example:

```text
Please confirm: run `gh pr review 123 --request-changes --body-file /tmp/review.md` on owner/repo.
```

Do not proceed on vague approval like “go ahead” if the command was not shown.

Dangerous categories include:

```bash
gh pr comment
gh pr review
gh pr edit
gh pr close
gh pr reopen
gh pr merge
gh issue create
gh issue comment
gh issue edit
gh issue close
gh issue reopen
gh label create
gh label edit
gh label delete
gh run rerun
gh run cancel
gh workflow run
gh workflow enable
gh workflow disable
gh release create
gh release edit
gh release delete
gh release upload
gh repo edit
gh repo delete
gh secret set
gh secret delete
gh variable set
gh variable delete
gh api -X POST ...
gh api -X PUT ...
gh api -X PATCH ...
gh api -X DELETE ...
git push
git tag
git push --tags
```

If confirmed, perform only the confirmed command. Do not chain additional mutations.

## Token and privacy handling

- Use existing `gh` authentication only.
- Do not ask the user to paste `GH_TOKEN`, `GITHUB_TOKEN`, PATs, SSH keys, cookies, or session values.
- Do not run `env`, `printenv`, or shell debug commands looking for tokens.
- Do not store credentials in files.
- Redact access tokens, signed URLs, private email addresses unless necessary, authorization headers, cookies, webhook secrets, and Actions secret/variable values.
- When showing remotes, redact embedded credentials.

Report credential-bearing URLs as:

```text
https://[REDACTED]@github.com/owner/repo.git
```

## Fallback to local git

If `gh` is unavailable, unauthenticated, unauthorized, rate-limited, offline, or the user denies network access, fall back to read-only local git:

```bash
git status --short --branch
git remote -v
git branch --show-current
git branch -vv
git log --oneline --decorate --graph -n 30
git diff --stat
git diff
git show --stat <ref>
git show <ref>
git ls-files
```

Use local refs to infer PR context when possible:

```bash
git merge-base HEAD origin/main
git diff origin/main...HEAD
git log origin/main..HEAD --oneline
```

If default branch is unknown, inspect remotes and common branches (`origin/main`, `origin/master`) and state assumptions.

## Workflow

1. Clarify target: repository, PR, issue, branch, run, release, or local worktree.
2. Determine whether GitHub access is needed.
3. Check `gh` availability/auth only if needed.
4. Use safe read-only `gh` commands for GitHub evidence.
5. Use local git for diff/history evidence.
6. Redact sensitive values.
7. Refuse or gate mutations behind explicit confirmation.
8. Produce the output format below.

## Safety gates

Ask for explicit confirmation before any external mutation, GitHub-visible action, workflow trigger/rerun/cancel, push/tag/release, repository settings change, secret/variable operation, issue/PR edit/comment/review/merge, or non-GET `gh api` request.

## Output format

Use this structure:

```text
## GitHub / gh summary

Target:
- repo:
- object:
- mode: read-only | confirmed-mutation | local-git-fallback

Evidence gathered:
- gh:
- git:

Findings:
- ...

Actions not taken:
- No comments posted.
- No reviews submitted.
- No merges, pushes, releases, workflow triggers, or repository changes performed.

Missing evidence:
- ...

Failure handling:
- ...
```

For confirmed mutations, add:

```text
Confirmed action:
- command:
- confirmation received:
- result:
```

## Failure handling

- `gh` missing: state that GitHub CLI is unavailable and use local git fallback.
- Not authenticated: do not request tokens; ask user to authenticate outside the chat with `gh auth login` if GitHub access is required.
- Permission denied: report missing scope/permission; do not retry with broader credentials.
- Rate limited: report rate limit and use local git where possible.
- Network failure: report failure and continue locally.
- Ambiguous repository/PR: ask for target clarification.
- Unsafe command requested: explain risk and request explicit confirmation with exact command.
- Secret detected: stop reproducing the value, redact it, and recommend rotation if exposure may have occurred.
