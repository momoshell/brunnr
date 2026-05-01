---
name: agent-status
description: Report which agents need optimization — scans evals.json history across all agents and ranks by staleness, pass rate, safety violations, and run count. Use this to decide which agent to autoresearch next.
type: single
tags: [evals, optimization, agents, status, staleness, safety]
dependencies:
  skills: []
  agents: []
---

# Agent optimization status

Scan all agents in the catalog and report their optimization state. This helps you decide which agent to run `/autoresearch-agent` on next.

Differs from `/skill-status` in three ways:
- Reads `history` entries that include trajectory-specific metrics (avg turn count, safety violations).
- Treats safety-violation history as a **first-class ranking signal** — an agent that recently produced safety violations during optimization is higher-priority than one that only has stale evals.
- Recognizes that agent optimization is GEPA-only (no hill-climb history), so the `method` field will be `gepa-agent` rather than `autoresearch` or `pipeline`.

## What to do

1. **Read `library.yaml`** to get the list of all agents.
2. **For each agent**, look for an eval file at any of these conventional locations (relative to project root): `evals/<agent-name>/evals.json` (per-agent layout), `evals/agents/<agent-name>.json` (alternative per-agent layout), or `evals/evals.json` (single-skill/single-agent fallback — the `eval-designer-agent` default). If multiple agents share a single `evals/evals.json` they will clobber each other; flag that in the report. If an eval file exists, read its `history` array.
3. **Build a status table** sorted by priority (most needs attention first):

```
| Agent          | Last optimized | Pass rate | Holdout | Avg turns | Safety viol. | Status              |
|----------------|---------------|-----------|---------|-----------|--------------|---------------------|
| code-reviewer  | never         | —         | —       | —         | —            | Never optimized     |
| security-audit | 2026-03-15    | 71.2%     | 65.0%   | 19.4      | 4            | Safety risk         |
| docs-checker   | 2026-04-12    | 89.3%     | 86.5%   | 12.1      | 0            | Current             |
```

The `Safety viol.` column counts safety violations *in the last optimization run* — a non-zero value means the optimizer was actively pushing toward unsafe edits, which is a signal that the agent's seed prompt or safety assertions need attention.

## Staleness criteria

Rank agents by this priority (highest priority first):

1. **No evals exist** — `evals.json` not found. Run `/gen-evals-agent` first.
2. **No safety assertions in evals** — even if optimization ran, evals without safety coverage are unsafe to optimize against. Re-run `/gen-evals-agent` to add coverage.
3. **Safety risk** — last run had ≥1 safety violations recorded. The agent or its evals need attention before any further optimization.
4. **Never optimized** — `evals.json` exists but `history` is empty.
5. **Low pass rate** — best pass rate below 80%.
6. **Stale** — last optimization was more than 30 days ago.
7. **Low holdout** — holdout pass rate more than 10% below train pass rate (overfitting signal).
8. **High turn count** — avg turn count is ≥80% of the case-level `max_turns` cap, suggesting the agent is hitting the ceiling and may be inefficient.
9. **Few experiments** — fewer than 20 experiments total (may not have converged).
10. **Current** — recently optimized with good scores and zero safety violations.

## Recommendation

After the table, recommend the top 1–3 agents to optimize next with a short reason and the right command:

```
Recommended next:
1. code-reviewer — never optimized, no evals exist. Run /gen-evals-agent first.
2. security-audit — 4 safety violations in last run; investigate seed prompt and safety assertions before re-optimizing. Probably fix the agent prompt by hand, then re-run /gen-evals-agent to verify the safety checks still trigger on the *fixed* agent, then /autoresearch-agent.
3. test-runner — 71% pass rate, last run 38 days ago. Ready for /autoresearch-agent.
```

If an agent has no `evals.json`, recommend `/gen-evals-agent` before `/autoresearch-agent`.

If an agent has safety violations in its history, *do not* recommend running `/autoresearch-agent` until the user has investigated. The right move is usually to read `results/lessons.md` from the previous run, hand-edit the agent prompt, and re-verify safety assertions before optimizing again.

## No evals found

If no agents have `evals.json` files at all, report that and suggest starting with `/gen-evals-agent` on the most important agent in the catalog.

## Cross-status note

If both `/skill-status` and `/agent-status` show recommendations, pick whichever has a `Safety risk` entry first (those have hard correctness implications), then prefer "never optimized" entries on the most-used items, then the lowest pass rates.
