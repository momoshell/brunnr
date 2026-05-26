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
#   - uv installed (macOS: brew install uv;
#                   or: curl -LsSf https://astral.sh/uv/install.sh | sh)
#   - .env with OPENAI / AZURE / ANTHROPIC creds — created automatically
#     at $SKILLOPT_DIR/.env on first run if missing (with placeholder values)
#
# The script clones microsoft/SkillOpt to $SKILLOPT_DIR on first run, pulls
# the latest commit on subsequent runs, and provisions a uv-managed venv
# at $SKILLOPT_DIR/.venv with `uv pip install -e .`. uv fetches the right
# Python version on its own — no system python required.
#
# Env overrides:
#   PROJECT_ROOT      project root (default: $PWD — the user's project)
#   SKILLOPT_DIR      path to cloned SkillOpt repo (default: ~/Development/SkillOpt)
#   UV_PYTHON         python version uv installs into the venv (default: 3.12)
#   SKILLOPT_PY       python interpreter SkillOpt runs under
#                     (default: $SKILLOPT_DIR/.venv/bin/python)
#   SKIP_UPDATE       set to skip the `git pull` step on existing checkout
#   RESET_VENV=1      wipe $SKILLOPT_DIR/.venv before installing
#                     (use when an older or broken venv needs replacing)
#   REGRADE=0         skip the post-hoc brunnr re-grading step; promote
#                     SkillOpt's best_skill.md verbatim
#   REGRADE_TOP_N     how many of SkillOpt's most-recent snapshots to
#                     re-grade (default: 5; plus best_skill.md is always
#                     included)
#   REGRADE_RUNS      how many times to repeat each eval case during
#                     re-grading (default: 1; bump to 2 to catch flaky
#                     semantic/visual judges on the final pick)
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
UV_PYTHON="${UV_PYTHON:-3.12}"
OPTIMIZER_MODEL="${OPTIMIZER_MODEL:-gpt-5.5}"
TARGET_MODEL="${TARGET_MODEL:-gpt-5.5}"
SKILLOPT_CONFIG="${SKILLOPT_CONFIG:-configs/searchqa/default.yaml}"
BRIDGE_SCRIPT="${BRIDGE_SCRIPT:-$(cd "$(dirname "$0")" && pwd)/skillopt-bridge.py}"
SKILLOPT_REPO_URL="https://github.com/microsoft/SkillOpt.git"

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

# ── step 0: clone / update SkillOpt, bootstrap venv via uv ─────────────
if ! command -v uv >/dev/null 2>&1; then
    echo "error: uv not installed" >&2
    echo "       brew install uv                                          # macOS" >&2
    echo "       curl -LsSf https://astral.sh/uv/install.sh | sh          # any unix" >&2
    exit 70
fi

if [ ! -d "$SKILLOPT_DIR" ]; then
    echo "→ cloning microsoft/SkillOpt → $SKILLOPT_DIR"
    mkdir -p "$(dirname "$SKILLOPT_DIR")"
    git clone --quiet "$SKILLOPT_REPO_URL" "$SKILLOPT_DIR"
elif [ -z "${SKIP_UPDATE:-}" ]; then
    echo "→ updating SkillOpt ($SKILLOPT_DIR)"
    if ! git -C "$SKILLOPT_DIR" pull --ff-only --quiet 2>/dev/null; then
        echo "  warning: git pull failed (dirty checkout or no network?); continuing with current commit" >&2
    fi
fi

# Bail early if creds aren't configured — saves the ~30s install cost on
# first run when the user still has to fill in .env anyway.
if [ ! -f "$SKILLOPT_DIR/.env" ]; then
    cat > "$SKILLOPT_DIR/.env" <<'ENV'
# SkillOpt provider credentials. Fill in whichever provider you use.
# OPENAI_API_KEY=
# AZURE_OPENAI_API_KEY=
# AZURE_OPENAI_ENDPOINT=
# ANTHROPIC_API_KEY=
ENV
    echo "→ wrote placeholder $SKILLOPT_DIR/.env — fill in provider creds before re-running" >&2
    exit 78  # EX_CONFIG
fi

venv="$SKILLOPT_DIR/.venv"
if [ "${RESET_VENV:-}" = "1" ] && [ -d "$venv" ]; then
    echo "→ RESET_VENV=1 → removing $venv"
    rm -rf "$venv"
fi
if [ ! -x "$venv/bin/python" ]; then
    echo "→ creating venv (Python $UV_PYTHON) + installing SkillOpt via uv (one-time)"
    uv venv --python "$UV_PYTHON" "$venv"
    VIRTUAL_ENV="$venv" uv pip install --quiet -e "$SKILLOPT_DIR"
fi

SKILLOPT_PY="${SKILLOPT_PY:-$venv/bin/python}"

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

# ── step 3: re-grade snapshots against the full brunnr eval schema ──────
# SkillOpt's internal evaluator only sees the deterministic-substring slice
# of our evals (the bridge had to drop semantic + visual). Post-train, we
# re-grade SkillOpt's accepted snapshots using the full schema so the
# winning candidate is chosen by *our* metric, not SkillOpt's.
#
# Set REGRADE=0 to skip and just take SkillOpt's best_skill.md as-is.
echo ""
candidate="$skill_md.skillopt-candidate"

if [ ! -f "$out_root/best_skill.md" ]; then
    echo "error: SkillOpt did not produce best_skill.md at $out_root" >&2
    exit 1
fi

if [ "${REGRADE:-1}" = "0" ]; then
    cp "$out_root/best_skill.md" "$candidate"
    echo "→ REGRADE=0 — using SkillOpt's best_skill.md without brunnr re-grading"
else
    echo "→ re-grading snapshots with brunnr's full eval schema"
    echo "  (deterministic + semantic + visual; SkillOpt only saw substring signal)"

    REGRADE_TOP_N="${REGRADE_TOP_N:-5}"
    REGRADE_RUNS="${REGRADE_RUNS:-1}"
    GRADER="$(cd "$(dirname "$0")" && pwd)/grade-skill.py"

    if [ ! -f "$GRADER" ]; then
        echo "  warning: $GRADER missing — falling back to SkillOpt's best_skill.md" >&2
        cp "$out_root/best_skill.md" "$candidate"
    else
        regrade_dir="$out_root/regrade"
        mkdir -p "$regrade_dir"

        # Collect candidates: best_skill.md + the most recent N versioned snapshots.
        # The most recent snapshots are SkillOpt's strongest by *its* metric;
        # we only need to re-rank within that top-N, not the entire history.
        snapshots=("$out_root/best_skill.md")
        if [ -d "$out_root/skills" ]; then
            while IFS= read -r snap; do
                [ -f "$snap" ] && snapshots+=("$snap")
            done < <(ls -1 "$out_root"/skills/skill_v*.md 2>/dev/null | sort -V | tail -n "$REGRADE_TOP_N")
        fi

        best_train="-1"
        best_snap=""
        leaderboard="$regrade_dir/leaderboard.tsv"
        : > "$leaderboard"

        for snap in "${snapshots[@]}"; do
            label="$(basename "$snap")"
            report="$regrade_dir/${label%.md}.brunnr.json"
            echo "  · grading $label"
            if "$venv/bin/python" "$GRADER" \
                --skill "$snap" \
                --evals "$eval_file" \
                --repo-root "$PROJECT_ROOT" \
                --runs "$REGRADE_RUNS" \
                --out "$report"; then
                train=$(python3 -c "import json,sys; d=json.load(open('$report')); print(d['train_pass_rate'])" 2>/dev/null || echo "0")
                holdout=$(python3 -c "import json,sys; d=json.load(open('$report')); print(d['holdout_pass_rate'])" 2>/dev/null || echo "0")
                printf "%s\t%s\t%s\n" "$label" "$train" "$holdout" >> "$leaderboard"
                echo "      train=$train  holdout=$holdout"
                # Pick by train rate; tie-broken by holdout via float comparison.
                if python3 -c "import sys; sys.exit(0 if float('$train') > float('$best_train') else 1)" 2>/dev/null; then
                    best_train="$train"
                    best_snap="$snap"
                fi
            else
                echo "      warning: grader failed on $label" >&2
            fi
        done

        if [ -n "$best_snap" ]; then
            cp "$best_snap" "$candidate"
            echo ""
            echo "  brunnr-best snapshot: $(basename "$best_snap")  (train=$best_train)"
            echo "  leaderboard: $leaderboard"
        else
            echo "  warning: re-grading produced no valid scores; using SkillOpt's best_skill.md" >&2
            cp "$out_root/best_skill.md" "$candidate"
        fi
    fi
fi

echo ""
echo "✓ candidate ready: $candidate"
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
