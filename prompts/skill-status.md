---
name: skill-status
description: Report which skills need optimization — scans evals.json history across all skills and ranks by staleness, pass rate, and run count. Use this to decide which skill to autoresearch next.
type: single
tags: [evals, optimization, skills, status, staleness]
dependencies:
  skills: []
  agents: []
---

# Skill optimization status

Scan all skills in the catalog and report their optimization state. This helps you decide which skill to run `/autoresearch-skill` on next.

## What to do

1. **Read `library.yaml`** to get the list of all skills.
2. **For each skill**, check if an `evals/evals.json` exists (relative to the skill's location or the project root). If it exists, read the `history` array.
3. **Build a status table** sorted by priority (most needs attention first):

```
| Skill           | Last optimized | Pass rate | Holdout | Experiments | Status          |
|-----------------|---------------|-----------|---------|-------------|-----------------|
| api-docs        | never         | —         | —       | 0           | Never optimized |
| test-writer     | 2026-03-01    | 68.1%     | 62.0%   | 12          | Stale (44 days) |
| code-reviewer   | 2026-04-14    | 92.3%     | 88.5%   | 47          | Current         |
```

## Staleness criteria

Rank skills by this priority (highest priority first):

1. **Never optimized** — no `history` entry exists
2. **Low pass rate** — best pass rate below 80%
3. **Stale** — last optimization was more than 30 days ago
4. **Low holdout** — holdout pass rate more than 10% below train pass rate (overfitting signal)
5. **Few experiments** — fewer than 20 experiments total (may not have converged)
6. **Current** — recently optimized with good scores

## Recommendation

After the table, recommend the top 1–3 skills to optimize next with a short reason:

```
Recommended next:
1. api-docs — never optimized, no evals exist yet. Run /gen-evals first.
2. test-writer — pass rate 68%, last run 44 days ago. Ready for /autoresearch-skill.
```

If a skill has no `evals.json` at all, recommend running `/gen-evals` before `/autoresearch-skill`.

## No evals found

If no skills have `evals.json` files, report that and suggest starting with `/gen-evals` on the most important skill.
