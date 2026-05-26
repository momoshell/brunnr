#!/usr/bin/env python3
"""
SkillOpt eval-format bridge.

Converts a brunnr-canonical eval suite (skill_name + evals[] + assertions[])
into SkillOpt's items.json format (split into train/val/test dirs).

Why this isn't lossless:
  - SkillOpt expects (question, context, answers[]) per item where 'answers'
    is a list of expected substrings. Our 'deterministic' assertions map
    cleanly; 'semantic' and 'visual' assertions can't. The conversion drops
    them with a counted warning so we know how much signal we're losing.
  - SkillOpt's evaluation is substring-match on the model output. Our
    'output contains X' style fits this directly.
  - For files[] in our evals, we inline the file contents as 'context'.

Usage:
    python3 skillopt-bridge.py \\
        --input  /path/to/project/evals/stance-chart.json \\
        --skill  /path/to/project/.pi/skills/argon-stance-chart/SKILL.md \\
        --out    /path/to/project/outputs/skillopt-stance-chart/data

Writes:
    <out>/train/items.json
    <out>/val/items.json     (empty if no holdout in input)
    <out>/test/items.json    (mirror of val for SkillOpt's evaluator)
    <out>/skill.md            (copy of the input SKILL.md; SkillOpt's
                               --skill argument points here)
"""

import argparse
import json
import re
import sys
from pathlib import Path


def extract_expected_substrings(check_text: str) -> list[str]:
    """Pull the literal quoted strings out of a brunnr deterministic check.

    Brunnr deterministic checks look like:
      "output contains 'foo'"
      "output contains 'a' and 'b'"
      "output matches /pattern/"

    Return all single-quoted substrings. Regex patterns are not supported
    by SkillOpt's evaluator and are skipped (caller warns)."""
    if "matches /" in check_text:
        return []
    return re.findall(r"'([^']*)'", check_text)


def assertion_to_answers(assertion: dict) -> list[str]:
    """Map one brunnr assertion to SkillOpt 'answers' substrings.

    Returns an empty list when the assertion can't be expressed as a
    substring-match (semantic, visual, regex, not-contains, etc.)."""
    if assertion.get("type") != "deterministic":
        return []  # semantic/visual: no substring map
    check = assertion.get("check", "")
    if "does not contain" in check or "matches /" in check:
        # SkillOpt's evaluator is substring positive-match only.
        return []
    return extract_expected_substrings(check)


def inline_files(repo_root: Path, files: list[str]) -> str:
    """Concatenate the contents of files[] into a single 'context' string."""
    parts = []
    for rel in files:
        # Brunnr eval files reference paths relative to the evals/ dir.
        for candidate in (repo_root / "evals" / rel, repo_root / rel):
            if candidate.exists():
                parts.append(f"# {rel}\n\n{candidate.read_text()}\n")
                break
        else:
            sys.stderr.write(f"  warning: fixture not found: {rel}\n")
    return "\n---\n\n".join(parts)


def convert(input_path: Path, skill_path: Path, out_root: Path) -> None:
    repo_root = input_path.parent.parent  # evals/<file>.json -> project root
    suite = json.loads(input_path.read_text())

    train_items = []
    val_items = []
    skipped_semantic = 0
    skipped_visual = 0
    skipped_other = 0
    dropped_evals = 0

    for ev in suite.get("evals", []):
        answers: list[str] = []
        for a in ev.get("assertions", []):
            t = a.get("type")
            if t == "semantic":
                skipped_semantic += 1
                continue
            if t == "visual":
                skipped_visual += 1
                continue
            mapped = assertion_to_answers(a)
            if not mapped:
                skipped_other += 1
                continue
            answers.extend(mapped)

        if not answers:
            # No deterministic substring signal we can express in SkillOpt.
            # Drop the eval entirely rather than ship a no-op test.
            dropped_evals += 1
            continue

        item = {
            "id": str(ev.get("id", "")),
            "question": ev.get("prompt", ""),
            "context": inline_files(repo_root, ev.get("files", [])),
            "answers": answers,
        }
        if ev.get("split") == "holdout":
            val_items.append(item)
        else:
            train_items.append(item)

    for sub, items in (("train", train_items), ("val", val_items), ("test", val_items)):
        d = out_root / sub
        d.mkdir(parents=True, exist_ok=True)
        (d / "items.json").write_text(json.dumps(items, indent=2))

    out_root.mkdir(parents=True, exist_ok=True)
    (out_root / "skill.md").write_text(skill_path.read_text())

    print(f"Converted {input_path.name} → {out_root}")
    print(f"  Train items: {len(train_items)}")
    print(f"  Val/test items: {len(val_items)}")
    print(f"  Dropped evals (no deterministic signal): {dropped_evals}")
    print(f"  Skipped assertions: semantic={skipped_semantic} visual={skipped_visual} other={skipped_other}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--input", required=True, type=Path, help="brunnr eval file (evals/<skill>.json)")
    p.add_argument("--skill", required=True, type=Path, help="SKILL.md to start from")
    p.add_argument("--out",   required=True, type=Path, help="output split_dir for SkillOpt")
    args = p.parse_args()
    for path in (args.input, args.skill):
        if not path.exists():
            sys.stderr.write(f"error: {path} does not exist\n")
            return 1
    convert(args.input, args.skill, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
