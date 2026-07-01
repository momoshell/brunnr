---
description: Run a deterministic Hird PR review with criticality-sorted findings and suggested inline comments
argument-hint: "[PR URL, PR number, branch, base..head, or review focus]"
---
Run a read-only Hird PR review.

Target/focus: {{args}}
Repository: {{cwd}}

This is a findings-only PR review performed by Hird specialists under orchestrator synthesis. It is NOT a QA gate, NOT ship readiness, and NOT external PR action. The orchestrator MUST NOT do the substantive review solo. Do not edit files, post comments, approve, request changes in GitHub/GitLab, merge, push, deploy, or alter branch state. Produce suggested inline comments only.

## Deterministic review flow

1. Establish scope from the target/focus. If absent, inspect the current branch, git status, changed files, and likely base using read-only git commands. If the base or diff cannot be determined safely, return `result: blocked`.
2. Inspect the relevant diff and surrounding code. Open tests, docs, config, CI, and call sites as needed for evidence.
3. Mandatory specialist dispatch. The orchestrator MUST NOT perform the substantive PR review solo. The orchestrator may establish scope, gather read-only evidence, prepare handoffs, validate specialist output shape, and synthesize the final report.

   Use `hird_dispatch_agent` in this order:

   1. `hird-qa-lead` — required for every PR review and must run before code reviewers. Ask it to assess risk, choose review tier, identify validation commands, and state whether build/test validation is needed. Required output must include: `verdict: gate-ready | needs-tests | blocked`, `review_tier: standard | deep | adversarial-panel`, `risk_reasons`, `validation_commands`, `test_engineer_needed`, `review_lenses`, and `blocking_issue_classes`.
   2. Domain lead(s) — required when the diff has an identifiable domain. Dispatch at least one of `hird-frontend-lead`, `hird-backend-lead`, `hird-devops-lead`, or `hird-architecture-lead` based on changed files and QA lead risk reasons. Ask the lead to identify domain-specific risks, contracts, expected tests, and files that need reviewer attention. If no domain lead applies, record `domain_lead_status: not-applicable` with evidence.
   3. `hird-code-reviewer` or `hird-code-reviewer-deep` — required for every PR review after QA lead/domain lead routing. Use `hird-code-reviewer` when QA lead selects `standard`; use `hird-code-reviewer-deep` when QA lead selects `deep`; if QA lead selects `adversarial-panel`, dispatch `hird-code-reviewer-deep` once per requested lens. Every reviewer output MUST begin exactly with `verdict: pass` or `verdict: changes-needed`.
   4. `hird-build-validator` — required when QA lead lists safe validation commands or says validation is needed. The validator may run only safe read-only build/typecheck/test/lint commands. If validation cannot be run safely, record it as missing evidence; do not invent results.

   If specialist dispatch is unavailable, blocked, missing, malformed, stale, truncated, or inconclusive, return `result: blocked`. Do not silently substitute a solo orchestrator review.
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

- `result: blocked` if required specialist dispatch is unavailable, missing, malformed, stale, truncated, inconclusive, or if the PR/diff/base/context cannot be inspected.
- `result: request-changes` if any required reviewer returns `verdict: changes-needed`, or if any unresolved 🔴 critical or 🟠 high finding exists.
- `result: comment` if all required specialists completed and only 🟡 medium, 🔵 low, or ⚪ question items remain.
- `result: no-blocking-findings` only if QA lead and required reviewer(s) completed with usable evidence, validation is passed or explicitly not needed, and there are no critical/high findings. Do not call this approve/pass/ship-ready.

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
- dispatch_required: yes
- dispatch_status: complete | incomplete | unavailable
- qa_lead_verdict: gate-ready | needs-tests | blocked
- review_tier: standard | deep | adversarial-panel
- domain_leads_dispatched:
- reviewers_dispatched:
- build_validator_dispatched: yes | no
- solo_orchestrator_review: prohibited
- target:
- base:
- head:
- files_reviewed:
- evidence_sources:
- review_scope:
- external_actions: none; comments are suggestions only

## Specialist Dispatch Record

- specialist: hird-qa-lead
  status: completed | missing | malformed | blocked
  required: yes
  verdict:
  review_tier:
  evidence_summary:

- specialist: hird-frontend-lead | hird-backend-lead | hird-devops-lead | hird-architecture-lead
  status: completed | not-applicable | missing | malformed | blocked
  required: yes-if-domain-applies
  domain:
  evidence_summary:

- specialist: hird-code-reviewer | hird-code-reviewer-deep
  status: completed | missing | malformed | blocked
  required: yes
  verdict: pass | changes-needed
  lens: standard | correctness | security | rollback | general
  evidence_summary:

- specialist: hird-build-validator
  status: completed | not-needed | missing | malformed | blocked
  required: yes | no
  pass: true | false | inconclusive
  evidence_summary:

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
