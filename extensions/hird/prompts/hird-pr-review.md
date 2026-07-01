---
description: Run a deterministic Hird PR review with criticality-sorted findings and suggested inline comments
argument-hint: "[PR URL, PR number, branch, base..head, or review focus]"
---
Run a read-only Hird PR review.

Target/focus: {{args}}
Repository: {{cwd}}

This is a findings-only PR review. It is NOT a QA gate, NOT ship readiness, and NOT external PR action. Do not edit files, post comments, approve, request changes in GitHub/GitLab, merge, push, deploy, or alter branch state. Produce suggested inline comments only.

## Deterministic review flow

1. Establish scope from the target/focus. If absent, inspect the current branch, git status, changed files, and likely base using read-only git commands. If the base or diff cannot be determined safely, return `result: blocked`.
2. Inspect the relevant diff and surrounding code. Open tests, docs, config, CI, and call sites as needed for evidence.
3. Route through Hird reviewers when useful:
   - `hird-code-reviewer` for standard correctness/test/maintainability review.
   - `hird-code-reviewer-deep` for auth, secrets, payments, PII, data migrations, infra, public APIs, concurrency, broad refactors, or high-risk changes.
   - `hird-build-validator` only for safe read/build/test/lint validation evidence.
4. Sort findings by criticality, highest first. Within the same criticality sort by user/runtime impact, confidence, then file path.
5. For every finding, include a suggested inline comment. Do not post it.
6. Avoid style-only nits unless they hide a real defect or project-convention risk. Avoid speculation; if evidence is insufficient, classify as `question` or `needs-evidence`.

## Criticality order and markers

- 🔴 `critical` — exploitable security issue, data loss/corruption, production outage, broken core path, unsafe migration/deploy, secret exposure, or required scope missing.
- 🟠 `high` — likely user-visible bug, important regression, serious reliability issue, broken public contract, or risky behavior lacking required validation.
- 🟡 `medium` — edge-case bug, missing guard, incomplete behavior, meaningful test gap, or maintainability issue likely to cause defects.
- 🔵 `low` — minor correctness/maintainability/docs issue with limited risk.
- ⚪ `question` — unclear behavior requiring author confirmation; not enough evidence for a finding.

## Verdict rules

- `result: request-changes` if any unresolved 🔴 critical or 🟠 high finding exists.
- `result: comment` if only 🟡 medium, 🔵 low, or ⚪ question items remain.
- `result: no-blocking-findings` only if there are no critical/high findings and review evidence is sufficient. Do not call this approve/pass/ship-ready.
- `result: blocked` if the PR/diff/base/context cannot be inspected or required evidence is unavailable.

Output exactly:

# Hird PR Review

## At-a-glance

| Severity | Count | Meaning |
|---|---:|---|
| 🔴 Critical | 0 | must fix / blocks review confidence |
| 🟠 High | 0 | should block merge |
| 🟡 Medium | 0 | should fix or explicitly accept risk |
| 🔵 Low | 0 | non-blocking improvement |
| ⚪ Question | 0 | needs author/context |

- result: no-blocking-findings | comment | request-changes | blocked
- target:
- base:
- head:
- files_reviewed:
- evidence_sources:
- review_scope:
- external_actions: none; comments are suggestions only

## Criticality-Sorted Findings

If there are no findings, write `No findings.` Otherwise group findings in this order and omit empty groups.

### 🔴 Critical

#### PRR-001 — short finding title
- severity: critical | high | medium | low | question
- file: path/to/file.ext
- line: exact line/range or changed hunk near symbol
- evidence: concrete code/diff behavior observed
- impact: what can go wrong and who is affected
- suggested_fix: minimal safe remediation
- confidence: high | medium | low

**Suggested inline comment:**

```text
Concise, respectful, actionable review comment tied to this line. Explain the issue, why it matters, and the requested change.
```

```suggestion
Only include this fence when an exact small replacement is safe. Otherwise omit it.
```

### 🟠 High

### 🟡 Medium

### 🔵 Low

### ⚪ Questions / Needs Evidence

## Inline Comment Suggestions

- id: PRR-001
  file:
  line:
  severity_marker: 🔴 | 🟠 | 🟡 | 🔵 | ⚪
  comment:
  suggestion_applicable: yes | no
  suggestion:

## Validation Evidence

- command:
  status: passed | failed | not-run | impossible
  evidence_or_reason:

## Missing Evidence

- item: none | missing diff/base/tests/context/etc.
  why_required:

## Review Limits

- not_reviewed:
- assumptions:
- confidence: high | medium | low

## Non-posting confirmation

I did not post comments, approve, request changes, merge, push, deploy, or modify files.
