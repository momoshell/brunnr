#!/usr/bin/env bash
# Run microsoft/SkillOpt against one of a project's skills, side-by-side
# with brunnr's autoresearch flow. Writes the optimized skill back as a
# .skillopt-candidate file so the user can diff before promoting.
#
# Normally invoked via the `brunnr skillopt <skill>` justfile recipe,
# which sets cwd to the user's project. Can also be invoked directly:
#
#   PROJECT_ROOT=/path/to/project run-skillopt.sh <skill-name>
#
# Prereqs (one-time):
#   - Python 3.10+ available (macOS: brew install python@3.12)
#   - git clone https://github.com/microsoft/SkillOpt.git ~/Development/SkillOpt
#   - (cd ~/Development/SkillOpt && pip install -e .)
#   - .env with OPENAI / AZURE / ANTHROPIC creds in ~/Development/SkillOpt/
#
# Env overrides:
#   PROJECT_ROOT      project root (default: $PWD — the user's project)
#   SKILLOPT_DIR      path to cloned SkillOpt repo (default: ~/Development/SkillOpt)
#   SKILLOPT_PY       python interpreter (default: python3)
#   OPTIMIZER_MODEL   SkillOpt --optimizer_model (default: gpt-5.5)
#   TARGET_MODEL      SkillOpt --target_model   (default: gpt-5.5)
#   SKILLOPT_CONFIG   SkillOpt config path relative to its repo
#                     (default: configs/searchqa/default.yaml — closest match
#                     to our text-input/text-output skill shape)
#   BRIDGE_SCRIPT     path to skillopt-bridge.py (default: alongside this script)

set -euo pipefail

# ── args ───────────────────────────────────────────────────────────────
skill="${1:-}"
if [ -z "$skill" ]; then
    echo "usage: $0 <skill-name>" >&2
    echo "       e.g. $0 argon-stance-chart" >&2
    exit 64
fi

PROJECT_ROOT="${PROJECT_ROOT:-$PWD}"
short="${skill#argon-}"
eval_file="$PROJECT_ROOT/evals/$short.json"
skill_md="$PROJECT_ROOT/.pi/skills/$skill/SKILL.md"
out_root="$PROJECT_ROOT/outputs/skillopt-$short"

# ── prechecks ──────────────────────────────────────────────────────────
SKILLOPT_DIR="${SKILLOPT_DIR:-$HOME/Development/SkillOpt}"
SKILLOPT_PY="${SKILLOPT_PY:-python3}"
OPTIMIZER_MODEL="${OPTIMIZER_MODEL:-gpt-5.5}"
TARGET_MODEL="${TARGET_MODEL:-gpt-5.5}"
SKILLOPT_CONFIG="${SKILLOPT_CONFIG:-configs/searchqa/default.yaml}"
BRIDGE_SCRIPT="${BRIDGE_SCRIPT:-$(cd "$(dirname "$0")" && pwd)/skillopt-bridge.py}"

if [ ! -d "$SKILLOPT_DIR" ]; then
    echo "error: SkillOpt not cloned at $SKILLOPT_DIR" >&2
    echo "       git clone https://github.com/microsoft/SkillOpt.git $SKILLOPT_DIR" >&2
    exit 70
fi
if [ ! -f "$BRIDGE_SCRIPT" ]; then
    echo "error: bridge script not found: $BRIDGE_SCRIPT" >&2
    exit 70
fi
if [ ! -f "$eval_file" ]; then
    echo "error: eval file not found: $eval_file" >&2
    echo "       (looked for evals/$short.json in $PROJECT_ROOT)" >&2
    echo "       run /gen-evals first to author one" >&2
    exit 66
fi
if [ ! -f "$skill_md" ]; then
    echo "error: skill not found: $skill_md" >&2
    exit 66
fi

# Python 3.10+ check — SkillOpt requires it.
pyver=$("$SKILLOPT_PY" --version 2>&1 | awk '{print $2}' | cut -d. -f1,2)
pymajor=$(echo "$pyver" | cut -d. -f1)
pyminor=$(echo "$pyver" | cut -d. -f2)
if [ "$pymajor" -lt 3 ] || { [ "$pymajor" -eq 3 ] && [ "$pyminor" -lt 10 ]; }; then
    echo "error: SkillOpt needs Python 3.10+; $SKILLOPT_PY is $pyver" >&2
    echo "       try SKILLOPT_PY=python3.12 $0 $skill" >&2
    exit 70
fi

# ── step 1: convert evals to SkillOpt items.json ────────────────────────
echo "→ converting evals → SkillOpt items.json"
"$SKILLOPT_PY" "$BRIDGE_SCRIPT" \
    --input "$eval_file" \
    --skill "$skill_md" \
    --out   "$out_root/data"

# ── step 2: run SkillOpt train ──────────────────────────────────────────
echo ""
echo "→ running SkillOpt: optimizer=$OPTIMIZER_MODEL target=$TARGET_MODEL"
echo "  out: $out_root"
echo ""

cd "$SKILLOPT_DIR"
"$SKILLOPT_PY" scripts/train.py \
    --config "$SKILLOPT_CONFIG" \
    --split_dir "$out_root/data" \
    --skill "$out_root/data/skill.md" \
    --optimizer_model "$OPTIMIZER_MODEL" \
    --target_model "$TARGET_MODEL" \
    --out_root "$out_root"

# ── step 3: capture result as a .candidate file ────────────────────────
echo ""
candidate="$skill_md.skillopt-candidate"
if [ -f "$out_root/best_skill.md" ]; then
    cp "$out_root/best_skill.md" "$candidate"
    echo "✓ SkillOpt finished — candidate at:"
    echo "  $candidate"
    echo ""
    echo "Diff against current skill:"
    echo "  diff -u $skill_md $candidate"
    echo ""
    echo "Promote if you like it:"
    echo "  cp $candidate $skill_md && git add $skill_md && git commit -m \"adopt SkillOpt-optimized SKILL.md\""
    echo ""
    echo "Compare side-by-side with autoresearch:"
    echo "  SkillOpt run output: $out_root"
    echo "  autoresearch output: $PROJECT_ROOT/results/<run-tag>/results.tsv"
else
    echo "error: SkillOpt did not produce best_skill.md at $out_root" >&2
    exit 1
fi
