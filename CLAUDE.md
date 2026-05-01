# brunnr — guidance for Claude Code sessions

brunnr is a reference-first catalog of skills, agents, and prompts. `library.yaml` is the authoritative index; everything else points to or describes content. Read `README.md` for the user-facing overview and `SKILL.md` for the catalog format spec — this file only captures conventions a future session can't derive from those.

## Where to look first

| Question | Authoritative file |
|---|---|
| What is brunnr / how does the user use it? | `README.md` |
| What's the schema for `library.yaml`, sources, frontmatter? | `SKILL.md` |
| What's in the catalog right now? | `library.yaml` |
| Shell commands (`brunnr push`, `brunnr add`, etc.) | `justfile` |
| Optimization workflow (skills) | `README.md` "Skill Optimization" section, then the agent files |
| Optimization workflow (agents) | `README.md` "Agent Optimization" section |

## Adding a new skill/agent/prompt — the checklist

These five steps must move together. Reviewers have repeatedly caught drift between them.

1. **Create the file** under `skills/<name>/SKILL.md`, `agents/<name>.md`, or `prompts/<name>.md`.
2. **Frontmatter** must include `name`, `description`, `tags`, `dependencies` (and `type` for prompts). The frontmatter `name` MUST match the `library.yaml` entry name exactly.
3. **Register in `library.yaml`** under the matching section with `source` pointing to the new file. Dependencies must reference items that actually exist in the catalog.
4. **Update `README.md`**: the agents/prompts tables and the Repository Structure tree both list every item by name.
5. **If the new item references other items via slash command (e.g. `/foo`), verify `prompts/foo.md` exists** — broken cross-references are the most common defect.

## Branch and run-tag conventions (optimization agents)

Each optimizer creates its own branch with a fixed prefix:

| Optimizer | Branch shape |
|---|---|
| `autoresearch-skill` | `autoresearch-skill/<RUN_TAG>` |
| `autoresearch-skill-gepa` | `autoresearch-skill-gepa/<RUN_TAG>` |
| `autoresearch-agent` | `autoresearch-agent/<RUN_TAG>` |
| `autoresearch-pipeline` | three branches per epoch: `<base>/<EPOCH_TAG>-stage1`, `-gepa`, `-compact` |

The agents `git checkout -b` themselves and abort if the branch exists. Orchestrators (the pipeline) must NOT pre-create the branch — use detached-HEAD checkout (`git checkout <commit>`) and let the agent create the branch from there.

## Eval schemas — skill vs agent

Different formats. Don't mix them.

- **Skill evals** (`eval-designer` produces): `prompt`, `files`, `assertions[].check/type`, `split`. Per-eval is a single prompt → output check.
- **Agent evals** (`eval-designer-agent` produces): `fixture`, `work_copy`, `reset`, `task`, `max_turns`, `assertions[].check/type/category`, `split`. Per-eval is an integration test over a trajectory.

The four assertion categories for agent evals — `final-state`, `trajectory`, `safety`, `quality` — are load-bearing. **Every agent eval case must have at least one safety assertion**; `autoresearch-agent` refuses to start without them and hard-discards any candidate that triggers a safety violation.

## Tiebreaker order (when picking a "winner" from a Pareto front)

Standard order, used by `autoresearch-skill-gepa` and the pipeline orchestrator:
1. Highest holdout pass rate (best generalizer wins)
2. Highest train pass rate
3. Smallest token cost / leanest

`autoresearch-agent` extends this with one extra rank between train and token cost: **lowest avg turn count** (fewer turns = cheaper at runtime). The deviation is intentional — turn count is a meaningful runtime metric for agents but undefined for skills. If you add a new optimizer, follow the standard order; only deviate with explicit justification documented here.

## Authoritative paths the agents write to

These are gitignored runtime data, not catalog content. Don't expect them to exist on a fresh clone.

- `results.tsv` — one row per experiment, schema differs per agent (extra columns for GEPA/agent variants)
- `results/per-eval/exp-<N>.json` — per-eval, per-run, per-assertion data (used by plateau diagnosis)
- `results/pareto-front.json` — current Pareto front (GEPA only)
- `results/failures/cand-<id>/` and `results/traces/cand-<id>/` — keyed by candidate, not experiment, so `git reset --hard` discards don't leave stale traces
- `evals/runs/<RUN_TAG>/pareto-front.json` — committed snapshot at wrap-up (the audit trail)

## Things to avoid

- Don't write content into `library.yaml` — it's an index, sources point to content.
- Don't add `Co-Authored-By` lines to git commits.
- Don't modify eval files or fixtures from inside an optimization agent — that's cheating against the metric.
- Don't add `--no-verify` or skip hooks unless the user explicitly asks.
- Don't introduce a new optimizer or workflow without updating README.md, library.yaml, and (if applicable) the corresponding `*-status` prompt.
