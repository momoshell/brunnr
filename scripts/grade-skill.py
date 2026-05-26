#!/usr/bin/env python3
"""
Grade a SKILL.md against a brunnr eval suite. Outputs a JSON report
with per-split pass rates that honor the full brunnr eval schema
(deterministic + semantic + visual assertions) — unlike SkillOpt's
internal evaluator, which is substring-positive-only.

Used by run-skillopt.sh as a post-hoc re-rank step: after SkillOpt's
training loop finishes, we grade every accepted snapshot with this
script and pick the winner by *brunnr's* metric, not SkillOpt's.
That recovers semantic and visual signal that the bridge had to drop
when translating evals to items.json.

Reuses the same protocol the autoresearch-skill agent runs inline:
  - Spawn pi per eval case with the candidate SKILL.md loaded
  - Check each assertion (deterministic in-process; semantic via a
    judging pi subprocess; visual via rsvg-convert + a vision pi)
  - Average pass rates per case across `--runs` repetitions
  - Average across cases per split

The script is intentionally a faithful Python port of the bash blocks
documented in agents/autoresearch-skill.md "Running an eval" — keep
the two in sync. If the agent's eval protocol changes there, mirror
it here.

Usage:
    python3 grade-skill.py \\
        --skill /path/to/SKILL.md \\
        --evals /path/to/project/evals/<short>.json \\
        --repo-root /path/to/project \\
        --runs 1 \\
        --out report.json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

PI_BASE_FLAGS = [
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-session",
]

# Models match agents/autoresearch-skill.md "Running an eval" defaults.
SEMANTIC_JUDGE_MODEL = "anthropic/claude-haiku-4-5"
VISUAL_JUDGE_MODEL = "anthropic/claude-sonnet-4-6"


def extract_assistant_text(stdout: str) -> str:
    """Pull the last assistant message's text from pi's `--mode json` output.

    pi emits one JSON event per line. The final `agent_end` event carries
    the complete message list; the last assistant message's `content` is a
    list of parts with `type: text`. Concatenate those text parts."""
    last_assistant = None
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        # Prefer agent_end — it has the canonical final messages array.
        if ev.get("type") == "agent_end":
            for msg in reversed(ev.get("messages", [])):
                if msg.get("role") == "assistant":
                    last_assistant = msg
                    break
        elif ev.get("type") == "message_end":
            msg = ev.get("message", {})
            if msg.get("role") == "assistant":
                last_assistant = msg
    if not last_assistant:
        return ""
    parts = last_assistant.get("content", [])
    return "".join(p.get("text", "") for p in parts if p.get("type") == "text")


def run_skill(skill_path: Path, prompt: str, files: list[str], timeout: int = 600) -> tuple[str, bool]:
    """Run the candidate skill on one eval prompt. Returns (output_text, crashed)."""
    attachments = " ".join(f"@{Path(f).resolve()}" for f in files) if files else ""
    full_prompt = f"{prompt} {attachments}".strip() if attachments else prompt
    cmd = ["pi", "-p", full_prompt,
           "--skill", str(skill_path),
           *PI_BASE_FLAGS,
           "--mode", "json", "--print"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return ("", True)
    if result.returncode != 0:
        return ("", True)
    return (extract_assistant_text(result.stdout), False)


def _quoted_substrings(check_text: str) -> list[str]:
    return re.findall(r"'([^']*)'", check_text)


def check_deterministic(check: str, output: str) -> bool:
    """Evaluate a deterministic assertion. Covers the common patterns autoresearch-skill mentions."""
    c = check.strip()
    # Regex
    m = re.search(r"matches\s+/(.+?)/", c)
    if m:
        try:
            return bool(re.search(m.group(1), output))
        except re.error:
            return False
    # Negated contains
    if "does not contain" in c:
        return all(s not in output for s in _quoted_substrings(c))
    # Starts/ends with
    m = re.search(r"starts with\s+'([^']*)'", c)
    if m:
        return output.startswith(m.group(1))
    m = re.search(r"ends with\s+'([^']*)'", c)
    if m:
        return output.endswith(m.group(1))
    # Default positive substring(s) — "contains 'A' [and 'B'...]"
    if "contains" in c:
        subs = _quoted_substrings(c)
        return bool(subs) and all(s in output for s in subs)
    # Unknown deterministic shape — punt to "no" rather than fabricate a result.
    return False


def judge_semantic(check: str, output: str, model: str = SEMANTIC_JUDGE_MODEL, timeout: int = 120) -> bool:
    prompt = (
        f"Given this output:\n{output}\n\n"
        f"Does it satisfy this assertion: {check}\n"
        "Answer with exactly one word: YES or NO."
    )
    cmd = ["pi", "-p", prompt,
           "--model", model,
           "--thinking", "off",
           *PI_BASE_FLAGS,
           "--print"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return False
    if result.returncode != 0:
        return False
    return bool(re.match(r"^\s*YES\b", result.stdout, re.I))


def judge_visual(check: str, output: str, model: str = VISUAL_JUDGE_MODEL, timeout: int = 120) -> bool:
    """Extract first SVG, render to PNG with rsvg-convert, judge via vision model."""
    m = re.search(r"<svg[\s>].*?</svg>", output, re.DOTALL)
    if not m:
        return False  # No artifact emitted — counts as fail, not crash.
    svg = m.group(0)

    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
        f.write(svg.encode())
        svg_path = Path(f.name)
    png_path = svg_path.with_suffix(".png")

    try:
        try:
            rsvg = subprocess.run(
                ["rsvg-convert", str(svg_path), "-o", str(png_path)],
                capture_output=True, timeout=30,
            )
        except FileNotFoundError:
            sys.stderr.write("  warning: rsvg-convert not on PATH — visual assertions will fail.\n")
            return False
        if rsvg.returncode != 0 or not png_path.exists() or png_path.stat().st_size == 0:
            return False

        prompt = (
            f"@{png_path}\n"
            f"Does the image satisfy this assertion: {check}\n"
            "Answer with exactly one word: YES or NO."
        )
        cmd = ["pi", "-p", prompt,
               "--model", model,
               "--thinking", "off",
               *PI_BASE_FLAGS,
               "--print"]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return False
        if result.returncode != 0:
            return False
        return bool(re.match(r"^\s*YES\b", result.stdout, re.I))
    finally:
        svg_path.unlink(missing_ok=True)
        png_path.unlink(missing_ok=True)


def check_assertion(a: dict, output: str) -> bool:
    t = a.get("type")
    check = a.get("check", "")
    if t == "deterministic":
        return check_deterministic(check, output)
    if t == "semantic":
        return judge_semantic(check, output)
    if t == "visual":
        return judge_visual(check, output)
    return False


def resolve_fixtures(repo_root: Path, rels: list[str]) -> list[str]:
    out = []
    for rel in rels or []:
        for cand in (repo_root / "evals" / rel, repo_root / rel):
            if cand.exists():
                out.append(str(cand))
                break
    return out


def grade_skill(skill_path: Path, evals_path: Path, repo_root: Path, runs: int = 1) -> dict:
    suite = json.loads(evals_path.read_text())
    train_cases: list[dict] = []
    holdout_cases: list[dict] = []

    for ev in suite.get("evals", []):
        eval_id = str(ev.get("id", ""))
        files = resolve_fixtures(repo_root, ev.get("files", []))
        prompt = ev.get("prompt", "")
        assertions = ev.get("assertions", [])
        split = ev.get("split", "train")

        per_run = []
        crashes = 0
        for _ in range(max(1, runs)):
            output, crashed = run_skill(skill_path, prompt, files)
            if crashed:
                crashes += 1
                per_run.append(0.0)
                continue
            if not assertions:
                continue
            passes = sum(1 for a in assertions if check_assertion(a, output))
            per_run.append(passes / len(assertions))

        case_rate = sum(per_run) / len(per_run) if per_run else 0.0
        case_result = {
            "id": eval_id,
            "pass_rate": round(case_rate, 4),
            "runs": len(per_run),
            "crashes": crashes,
        }
        (holdout_cases if split == "holdout" else train_cases).append(case_result)

    def avg(cs: list[dict]) -> float:
        return round(sum(c["pass_rate"] for c in cs) / len(cs), 4) if cs else 0.0

    return {
        "skill": str(skill_path),
        "evals": str(evals_path),
        "runs_per_case": max(1, runs),
        "train_pass_rate": avg(train_cases),
        "holdout_pass_rate": avg(holdout_cases),
        "train_cases": train_cases,
        "holdout_cases": holdout_cases,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--skill", required=True, type=Path)
    p.add_argument("--evals", required=True, type=Path)
    p.add_argument("--repo-root", required=True, type=Path)
    p.add_argument("--runs", type=int, default=1)
    p.add_argument("--out", type=Path, help="JSON output file (default: stdout)")
    args = p.parse_args()

    for path in (args.skill, args.evals, args.repo_root):
        if not path.exists():
            sys.stderr.write(f"error: {path} does not exist\n")
            return 1

    report = grade_skill(args.skill, args.evals, args.repo_root, args.runs)
    payload = json.dumps(report, indent=2)
    if args.out:
        args.out.write_text(payload)
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
