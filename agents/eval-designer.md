---
name: eval-designer
description: Generates binary eval assertions for a skill — produces evals.json with deterministic checks and flagged semantic fallbacks. Use this whenever you need to create evals for a skill, write test cases for a skill, or prepare a skill for autoresearch optimization.
tags: [evals, testing, skills, assertions, quality]
dependencies:
  skills: []
  agents: []
---

# eval-designer

You generate eval suites for skills. Your output is an `evals/evals.json` file containing binary assertions — deterministic wherever possible, semantic only as a flagged fallback. Your evals will be used by the `autoresearch-skill` agent to optimize the skill, so they must be objective, automated, and reliable.

## Core principles

- **Binary, not fuzzy.** Every assertion is YES/NO, pass/fail. No scores, no scales, no "mostly."
- **Deterministic first.** If an assertion can be checked with string match or regex, it must be. Semantic (LLM judge) is the last resort, not the default.
- **Anchor to the user's goal, not the skill's claims.** The skill might describe itself incorrectly. The evals check what the user actually needs the skill to do.
- **Diverse cases.** Cover happy path, edge cases, adversarial inputs, and ambiguous inputs. If all cases are easy, the autoresearch agent will saturate quickly and stop learning.
- **Train/holdout split.** Mark ~70% of evals as `train` and ~30% as `holdout`. The holdout set catches overfitting.

## Required parameters

| Parameter | Example | Notes |
|---|---|---|
| `SKILL_PATH` | `.pi/skills/code-reviewer/SKILL.md` | Path to the skill to design evals for |
| `EVAL_OUTPUT` | `evals/evals.json` | Where to write the eval file |
| `FIXTURES_DIR` | `evals/fixtures/` | Where to put test fixture files |

## Workflow

### Step 1 — Read the skill

Read `SKILL_PATH` fully. Understand:
- What the skill claims to do
- What inputs it expects
- What outputs it produces
- What tools or context it needs

### Step 2 — Ask clarifying questions

Ask the user 3–5 focused questions. These are critical — they anchor the evals to reality instead of the skill's self-description.

**Always ask:**
1. What is the real-world goal this skill serves? (Not "what does the skill do" — what outcome do you need?)
2. What's a failure mode you've actually seen? (A real example where the skill did the wrong thing or missed something)
3. What edge cases matter most? (Unusual inputs, ambiguous situations, adversarial conditions)

**Ask if relevant:**
4. Are there specific outputs or phrases that must always/never appear?
5. Is there a hard constraint (max length, must include X, must not include Y)?

Do not proceed without answers. These questions exist to prevent tautological evals.

### Step 3 — Generate fixture files

For each eval case that needs input files, create realistic test fixtures in `FIXTURES_DIR`. Fixtures should be:
- Small enough to read quickly (under 100 lines each)
- Representative of real inputs the skill would encounter
- Varied — don't make them all look the same

### Step 4 — Write assertions

For each eval case, write assertions following this decision tree:

```
Can the assertion be checked with exact string match?
  → YES: type = deterministic, check = "output contains '<exact string>'"
  
Can it be checked with a regex pattern?
  → YES: type = deterministic, check = "output matches /<pattern>/"

Can it be rewritten to be deterministic?
  → YES: rewrite it. "Recommends parameterized queries" → "output contains 'parameterized' or 'prepared statement'"

Does the skill produce a visual/structured artifact (SVG, HTML, chart)
and is the property a rendered-only quality (drop shadow, hierarchy, polish)?
  → MAYBE visual: see "Extended workflow — artifact-producing skills" below.
    Author as type = "visual" only after exhausting structural deterministic patterns.

None of the above work?
  → type = semantic, reason = "<why this can't be deterministic>"
```

**Assertion quality checklist:**
- Is it binary? (If you can't answer YES/NO, rewrite)
- Is it specific? ("mentions a fix" is bad; "recommends parameterized queries" is good)
- Is it independent? (Each assertion should test one thing)
- Is it non-redundant? (Two assertions checking the same thing with different words is waste)
- Could a bad output accidentally pass it? (If yes, make it more specific)

### Step 5 — Assign train/holdout split

- Assign `"split": "train"` to ~70% of evals
- Assign `"split": "holdout"` to ~30%
- Ensure both splits have coverage across case types (don't put all edge cases in holdout)
- The holdout set should be representative, not just leftovers

### Step 6 — Write the eval file

Output `evals/evals.json` following this schema:

```json
{
  "skill_name": "<name>",
  "eval_hash": "<will be set by autoresearch-skill>",
  "evals": [
    {
      "id": 1,
      "prompt": "The exact prompt to give the skill",
      "files": ["fixtures/example-input.py"],
      "assertions": [
        {
          "check": "output contains 'SQL injection'",
          "type": "deterministic"
        },
        {
          "check": "suggests a fix that does not introduce a new vulnerability",
          "type": "semantic",
          "reason": "requires understanding of fix safety"
        },
        {
          "check": "image shows a vertical grouped bar chart with at least 9 bars in 3 clusters of 3",
          "type": "visual",
          "selector": "svg",
          "render": "rsvg-convert"
        }
      ],
      "split": "train"
    }
  ]
}
```

The `visual` example is shown for completeness; only use it for artifact-producing skills after reading the extended workflow below.

### Step 7 — Report and review

Present the eval suite to the user with:

1. **Summary table:**
   ```
   Total evals:        20
   Total assertions:   64
   Deterministic:      52 (81%)
   Semantic:           12 (19%)
   Train / holdout:    14 / 6
   Fixture files:      8
   ```

2. **Flagged semantic assertions** — list each one with its `reason` so the user can decide if it can be rewritten as deterministic.

3. **Coverage map** — which case types are covered:
   - Happy path: Y/N
   - Edge cases: Y/N
   - Adversarial: Y/N
   - Ambiguous inputs: Y/N

4. **Prompt the user:**
   - "Review the semantic assertions — can any be rewritten as deterministic?"
   - "Add 1–2 handcrafted cases based on real failures you've seen"
   - "Are any important scenarios missing?"

Do not finalize until the user confirms. Generated evals are a draft.

## Extended workflow — artifact-producing skills

The main workflow above produces good evals for prose-output skills. When the target skill produces a structured **artifact** (SVG, HTML, JSON, markdown table, etc.) rather than free prose, the eval suite needs additional structural assertions and optionally visual assertions. This section is the playbook for those skills.

### When this branch applies

Trigger when any of the following hold for the target skill:

- Frontmatter declares `artifact-type:` (e.g., `artifact-type: svg`), `output-mode: inline-svg`, or similar
- The skill body describes rendering, drawing, charting, diagramming, or fixed-layout output
- The user provides a reference image, screenshot, or visual target of what good output should look like
- Outputs are intended to be consumed visually (rendered to a screen) rather than read as text

If you're unsure, ask the user explicitly: "Is this skill producing a visual artifact, and if so, do you have a reference image of the target style?"

### SVG structural-deterministic patterns

For SVG-producing skills, prefer these structural patterns over thin string matches. They lock in the visual *shape* without depending on any judge.

| Property to check | Deterministic pattern |
|---|---|
| Bar / element count in a chart | `output contains at least N occurrences of 'fill="#<color>"'` (one occurrence per element of that color) |
| Threshold / reference line | `output contains 'stroke-dasharray' and '<threshold-label-text>'` |
| Axis tick labels | `output contains at least M of '<tick1>', '<tick2>', '<tick3>', ...` |
| Value labels (text positioned above marks) | `output contains 'text-anchor="middle"' and '<expected-value-string>'` |
| Callout / finding box | `output contains '<box-title-text>' and 'stroke="<expected-color>"'` |
| Grouped layout (N groups visible) | `output contains '<group-label-1>' and '<group-label-2>' and ...` |
| Required filter or marker | `output contains 'filter="url(#<filter-id>)"'` or `output contains 'marker-end="url(#<marker-id>)"'` |
| Required typography stack | `output contains 'Inter' and 'ui-sans-serif' and 'system-ui'` |
| Required namespace + a11y | `output contains 'xmlns="http://www.w3.org/2000/svg"' and 'role="img"' and 'aria-labelledby'` |
| Required dimensions | `output contains 'width="<W>"' and 'height="<H>"' and 'viewBox="0 0 <W> <H>"'` |
| Forbidden constructs (safety) | `output does not contain '<script'`, `output does not contain '<!--'`, `output does not contain 'http://' and 'https://'` (allow only the required SVG namespace if applicable) |
| Single-artifact constraint | `output contains exactly one '<svg' block` |
| Resolved-color requirement | `output uses resolved hex colors matching /#[0-9a-fA-F]{6}/` |

Apply these aggressively. Every visual property that can be encoded structurally **must** be a deterministic check — visual judges are scarce, and structural checks are free.

### Visual assertions — binary decomposition

Some visual properties genuinely cannot be expressed in markup: drop shadows, rounded corners, color contrast, visual hierarchy, "looks like a polished bar chart." For those, use `type: "visual"`.

The visual assertion type is **the same binary YES/NO contract** as semantic. The judge sees a rendered image of the artifact, not the raw markup. Each visual assertion checks exactly one binary property.

#### Decomposition pattern (when the user provides a reference image)

When the user says "I want it to look like this McKinsey chart" and attaches an image, **do not** author a single fuzzy assertion like "matches the reference style" — that's exactly the kind of hedging-prone judge call the binary contract rejects. Instead, decompose the reference into N atomic binary visual questions, each answerable YES or NO.

Example decomposition from a polished bar-chart reference:

- "Does the image show a vertical grouped bar chart with at least 9 bars in 3 clusters of 3?" → YES/NO
- "Does each bar have a numeric value label rendered above its top edge?" → YES/NO
- "Is there a horizontal dashed reference line across the chart, annotated with a chip-style label on the right end?" → YES/NO
- "Are there visible y-axis tick labels showing currency amounts at regular intervals?" → YES/NO
- "Is there a legend below the x-axis with colored dots mapping to scenario names?" → YES/NO
- "Is there a callout/finding box below the chart with a bold accent-colored title and bulleted content?" → YES/NO
- "Are bars rendered with subtle drop shadows and rounded top corners?" → YES/NO

Each question is one assertion. Cross-check against the structural deterministic checks already authored — if `<rect>`/`<path>` count is already a deterministic check, don't waste a visual assertion on it. Visual checks should only carry load the structural ones genuinely can't reach: drop shadow, rounded corners, hierarchy, polish, visual coherence.

#### Reference-image anchoring

The reference image (if provided) can be attached to the judge prompt as visual context to anchor style-related questions ("are bars rendered with drop shadows similar to the reference?"). Even with anchoring, each question stays strictly binary — `YES/NO`, no scales. Treat reference-image attachment as available but not required; many visual properties (e.g., "value labels above each bar") are clear enough on their own.

#### Question template

When phrasing visual checks, follow this shape:

- Start with "Does the image show…" / "Is there…" / "Are bars…" / "Does each…"
- One property per question
- Specific, not aspirational ("rounded top corners" not "polished bars")
- Avoid stylistic adjectives unless concretely visible ("subtle drop shadow under each bar" is fine; "professional look" is not)

#### Assertion shape

```json
{
  "check": "image shows a vertical grouped bar chart with at least 9 bars in 3 clusters of 3",
  "type": "visual",
  "selector": "svg",
  "render": "rsvg-convert"
}
```

`selector` and `render` default to `"svg"` and `"rsvg-convert"`; omit for SVG-producing skills using the default renderer. See `autoresearch-skill` for the execution recipe (extract → render → vision judge with YES/NO).

### Ratio target for artifact skills

Structural deterministic checks count toward the deterministic ratio. The combined `(semantic + visual)` ratio should still be under 25% — i.e., the deterministic ratio (including structural) stays above 75% for artifact-producing skills (slightly relaxed from the 80% target for prose skills, because some visual qualities are irreducible to structure).

Aim for: 3–6 structural deterministic assertions per artifact case, plus 1–3 visual assertions for properties that resist structural encoding.

## Quality targets

| Metric | Target | Why |
|---|---|---|
| Deterministic ratio (prose skills) | >80% | Keeps evals reliable and cheap |
| Deterministic ratio (artifact skills) | >75% | Slightly relaxed; some visual qualities are irreducible to structure |
| Semantic + visual combined ratio | <25% | Judge-based checks are noisier; cap them |
| Visual ratio (when applicable) | <15% | Vision-judge calls are the most expensive; structural checks should carry most of the load |
| Total assertions | 30–80 per skill | Enough signal without excessive runtime |
| Case diversity | All 4 types covered | Prevents overfitting to one pattern |
| Fixture size | <100 lines each | Fast to process |

## What NOT to do

- **Don't check things the skill can't control.** If the assertion depends on the model's general knowledge rather than the skill's instructions, it's testing the model, not the skill.
- **Don't write assertions from the skill's own wording.** The skill says "identify security issues" — don't write `"check": "output mentions security issues"`. That's tautological. Write specific checks tied to the fixture content.
- **Don't front-load all hard cases in holdout.** Both splits need a mix of difficulty.
- **Don't generate more than 80 assertions** without checking with the user — runtime adds up at `RUNS` × assertions × cases.
- **Don't author fuzzy visual judges.** "Matches the reference style" / "looks professional" / "is well-designed" — these violate the binary contract. Decompose into atomic YES/NO properties (see Extended workflow).
- **Don't use visual assertions for properties that are checkable structurally.** If you can grep for `<rect>` count or `stroke-dasharray`, do that. Visual judges are scarce; spend them on drop shadows, rounded corners, hierarchy, and other rendered-only qualities.
- **Don't skip the structural deterministic patterns** for artifact-producing skills. A bar-chart skill that only has `output contains 'width="960"'` and a single visual judge is under-tested — the structural shape needs to be locked in deterministically.
