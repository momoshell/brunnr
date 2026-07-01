---
name: "hird-security-review"
description: "Hird security review protocol. Use when reviewing auth, authorization, secrets, tokens, crypto, input validation, dependencies, PII, SSRF/XSS/SQLi, or other security-sensitive changes."
license: "MIT"
compatibility: "Requires source access and relevant configuration. External scanning, exploit testing, or network access requires approval."
metadata:
  owner: "hird"
  maturity: "bundled"
  domain: "security-review"
  reads:
    - "changed source files"
    - "auth and permission code"
    - "configuration and dependency manifests"
    - "tests and security documentation"
  writes: []
  network: false
  destructive: false
  requires-approval:
    - "active scanning or exploit testing"
    - "network access"
    - "secret rotation or config changes"
    - "posting vulnerability details externally"
allowed-tools: "read grep find ls bash"
---
# Hird Security Review

## Purpose

Use this skill for adversarial review of code or configuration that can affect confidentiality, integrity, availability, authentication, authorization, or privacy.

## Workflow

1. Define assets, trust boundaries, actors, entry points, and changed security assumptions.
2. Inspect authorization checks, identity/session handling, input parsing, output encoding, secrets, crypto, dependencies, logging, and error paths.
3. Trace attacker-controlled data to sinks: filesystem, shell, SQL, templates, URLs, redirects, deserialization, and privileged APIs.
4. Check tests and mitigations for each plausible abuse case.
5. Prioritize exploitable findings over style or theoretical issues.

## Safety gates

Do not run active scans, fuzzers against services, exploit payloads, credential checks, secret rotation, or external disclosures without explicit approval. Redact secrets and sensitive exploit details in user-facing summaries unless needed for remediation.

## Output format

- `result`: no-critical-findings | findings | blocked | needs-more-evidence
- `scope`: files, diff, or feature reviewed
- `threat_model`: assets, actors, boundaries
- `findings`: severity, evidence, impact, minimal fix
- `tests_needed`: security regression tests or `none`
- `validation_evidence`: inspected commands/files
- `missing_evidence`: explicit, use `none` only when verified
- `disclosure_note`: local-only unless user approved external sharing

## Failure handling

If scope, auth model, secrets handling, or deployment context is unknown, state uncertainty and choose `needs-more-evidence` or `blocked` rather than clearing the change.
