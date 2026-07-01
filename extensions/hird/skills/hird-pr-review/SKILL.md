---
name: hird-pr-review
description: "Hird pull-request review protocol. Use when reviewing a PR, branch diff, merge request, or code review request to sort findings by criticality and draft inline comment suggestions without posting them."
license: "MIT"
compatibility: "Requires a git-accessible worktree and Pi read-only inspection tools. Optional validation commands may be run only when safe."
metadata:
  owner: "hird"
  maturity: "bundled"
  domain: "pull-request-review"
  reads:
    - "git status/diff/log"
    - "changed source files"
    - "tests/lint/build output when available"
    - "project docs and configuration relevant to the diff"
  writes: []
  network: false
  destructive: false
  requires-approval:
    - "network access"
    - "external service calls"
    - "expensive validation"
    - "destructive commands"
    - "posting comments to a PR"
allowed-tools: "read grep find ls bash"
---
# Hird PR Review

## Purpose

Use this skill to perform a structured, evidence-based Hird review of a pull request, merge request, branch, patch, or local diff.

The review identifies correctness, security, reliability, maintainability, test, documentation, and operational risks introduced by the change. It prioritizes actionable findings and provides inline-ready comment suggestions without posting them unless the user explicitly asks.

## When to use

- Reviewing a PR, MR, branch, commit range, patch, or local diff.
- Checking whether a change has critical/high findings before merge discussion.
- Producing GitHub/GitLab-style inline comment suggestions.
- Sorting review findings by severity or blocking status.
- Performing a final pre-merge read-only review.

## When not to use

- Do not implement fixes unless the user explicitly asks after the review.
- Do not approve, request changes externally, merge, push, deploy, or call external APIs without explicit confirmation.
- Do not treat passing tests as sufficient if code inspection reveals unresolved risk.
- Do not use this as ship readiness; use `/hird-ship` after QA evidence exists.

## Review workflow

1. Establish scope: PR URL/number, branch, commit range, patch, or current local diff.
2. Inspect `git status`, changed files, base/head, and relevant commits with read-only commands.
3. Read the full relevant diff and surrounding source when context is needed.
4. Trace call sites, data flow, error handling, permissions, persistence, and public contracts affected by the change.
5. Inspect tests, docs, configuration, CI, and validation output relevant to the changed behavior.
6. Escalate to deep/adversarial reviewer lenses for auth, secrets, payments, PII, migrations, infra, public APIs, concurrency, broad refactors, or high-risk changes.
7. Classify findings and sort by criticality.
8. Draft one inline comment suggestion per concrete finding.
9. Produce the `/hird-pr-review` output contract exactly.

## Criticality sorting

Sort findings from highest to lowest severity:

- 🔴 `critical`: security vulnerability, privilege escalation, secret exposure, data loss/corruption, unsafe migration/deploy, broken auth/payment/privacy boundary, public API break, or review-blocking missing scope.
- 🟠 `high`: likely runtime failure, user-visible regression, incorrect business logic, serious reliability issue, risky missing validation, race/resource leak, or test suite hiding failures.
- 🟡 `medium`: edge-case bug, incomplete error handling, meaningful test gap, maintainability issue likely to cause defects, or confusing contract/docs mismatch.
- 🔵 `low`: minor non-blocking correctness, docs, naming, or maintainability improvement.
- ⚪ `question`: author/context question when evidence is insufficient.

Within the same severity, sort by runtime/user impact, confidence, then file path.

## Inline comment suggestions

For every actionable finding, include an inline suggestion block:

```text
file: path/to/file.ext
line: approximate line or changed hunk near symbol
severity: critical | high | medium | low | question
comment: |
  Explain the issue and why it matters.
suggestion: |
  Describe the minimal safe fix, or include a small code suggestion when exact.
```

Rules:

- Make comments specific to the changed code.
- Prefer one comment per distinct issue.
- Group repeated pattern issues instead of duplicating many comments.
- Do not post comments automatically.
- If line numbers are uncertain, write `line: changed hunk near <symbol/function>`.

## Safety gates

Stop and ask for explicit user approval before:

- posting review comments to GitHub, GitLab, or any external system;
- approving, requesting changes, merging, rebasing, pushing, tagging, or deploying;
- running commands that write outside the worktree;
- running migrations, destructive cleanup, or production-impacting scripts;
- using network access or external services;
- running expensive integration/e2e suites;
- modifying source files.

Read-only local inspection commands are allowed. Safe local validation may be run when clearly non-destructive.

## Output format

Use `/hird-pr-review` for the canonical visually marked output:

- at-a-glance severity table;
- `result: no-blocking-findings | comment | request-changes | blocked`;
- criticality-sorted findings;
- suggested inline comments for each finding;
- validation evidence;
- missing evidence;
- review limits;
- non-posting confirmation.

## Verdict rules

- Use `request-changes` for any unresolved critical or high finding.
- Use `blocked` when the diff, base, changed files, or required context cannot be inspected.
- Use `comment` when all findings are non-blocking.
- Use `no-blocking-findings` only when inspection and validation evidence are sufficient and no critical/high findings remain.
- Missing validation for risky changes prevents `no-blocking-findings`.
- Passing tests do not override a code-level blocker.

## Failure handling

- No diff or PR scope: ask for scope or return `blocked`.
- Dirty or ambiguous worktree: state ambiguity and review only clearly scoped changes, or return `blocked`.
- Command failure: include command, exit state, relevant output, and whether failure blocks review.
- Missing files: return `blocked` if required for review; otherwise list as missing evidence.
- Huge diff: summarize reviewed areas, prioritize high-risk files, and disclose unreviewed files.
- Generated/vendor files: review generation source when possible; otherwise note limited confidence.
- Potential secret exposure: stop, avoid reproducing secrets, mark critical, and ask for remediation/rotation guidance.
