# justfile — brunnr terminal shortcuts (Pi runtime)
#
# Usage: just -f ~/.config/brunnr/justfile <command>
# Or: alias brunnr='just -f ~/.config/brunnr/justfile'

# Tool version — bump when changing justfile / install.sh in a way that catalog
# entries may depend on. `brunnr sync` compares this against library.yaml's
# `min_tool_version` and refuses if the local tool is older.
export TOOL_VERSION := "3.0.32"

# Default path to brunnr repository
export BRUNNR_HOME := env_var_or_default("BRUNNR_HOME", env_var('HOME') / ".config/brunnr")

# Target directories in the current project (Pi defaults — Pi reads these natively)
export SKILLS_DIR := env_var_or_default("BRUNNR_SKILLS_DIR", ".pi/skills")
export AGENTS_DIR := env_var_or_default("BRUNNR_AGENTS_DIR", ".pi/agents")
export PROMPTS_DIR := env_var_or_default("BRUNNR_PROMPTS_DIR", ".pi/prompts")
export EXTENSIONS_DIR := env_var_or_default("BRUNNR_EXTENSIONS_DIR", ".pi/extensions")
export THEMES_DIR := env_var_or_default("BRUNNR_THEMES_DIR", ".pi/themes")

# Global (user-level) target directories — Pi reads these for all projects
HOME_DIR := env_var('HOME')
export GLOBAL_SKILLS_DIR := env_var_or_default("BRUNNR_GLOBAL_SKILLS_DIR", HOME_DIR / ".pi/agent/skills")
export GLOBAL_AGENTS_DIR := env_var_or_default("BRUNNR_GLOBAL_AGENTS_DIR", HOME_DIR / ".pi/agent/agents")
export GLOBAL_PROMPTS_DIR := env_var_or_default("BRUNNR_GLOBAL_PROMPTS_DIR", HOME_DIR / ".pi/agent/prompts")
export GLOBAL_EXTENSIONS_DIR := env_var_or_default("BRUNNR_GLOBAL_EXTENSIONS_DIR", HOME_DIR / ".pi/agent/extensions")
export GLOBAL_THEMES_DIR := env_var_or_default("BRUNNR_GLOBAL_THEMES_DIR", HOME_DIR / ".pi/agent/themes")

# Source directories in brunnr
SKILLS_SRC := BRUNNR_HOME / "skills"
AGENTS_SRC := BRUNNR_HOME / "agents"
PROMPTS_SRC := BRUNNR_HOME / "prompts"
EXTENSIONS_SRC := BRUNNR_HOME / "extensions"
THEMES_SRC := BRUNNR_HOME / "themes"

# Default recipe — show help
@default:
    echo "brunnr — Pi catalog for skills, agents, prompts, extensions, themes"
    echo ""
    echo "Usage: just -f {{BRUNNR_HOME}}/justfile <command>"
    echo ""
    echo "Commands:"
    echo "  install              Initialize brunnr in current project (creates .pi/ subdirs)"
    echo "  eitri                Launch Pi with the eitri authoring extension (loaded on-demand from BRUNNR_HOME)"
    echo "  brokkr               Launch Pi with the Brokkr extension (skill picker + pipeline launcher)"
    echo "  hird                 Launch Pi with the Hird engineering-team extension"
    echo "  add [-g] <section> <name>    Install item to project (.pi/) or globally with -g (~/.pi/agent/)"
    echo "  remove [-g] <section> <name> Uninstall item from project or globally with -g"
    echo "  push <section> <name> Push a new item to brunnr (opens a PR)"
    echo "  scrap <section> <name> Open a PR removing an item from brunnr"
    echo "  list [-g] [section]   List catalog items + what's installed (project, or globally with -g)"
    echo "  sync                 Pull latest catalog content (does NOT change tool behavior)"
    echo "  upgrade              Update brunnr tool itself (justfile, install.sh, docs)"
    echo "  setup-optimizer      Install the full skill/agent optimization stack globally"
    echo "  remove-optimizer     Uninstall everything setup-optimizer installed"
    echo "  uninstall            Remove brunnr from this machine (alias + \$BRUNNR_HOME)"
    echo "  status               Show open PRs in brunnr (skills awaiting review)"
    echo "  search <query>       Search the catalog"
    echo "  check                Validate library.yaml integrity (run before commit)"
    echo "  examples-add <url> [cat]  Add a Pi reference repo to the examples-expert registry"
    echo "  examples-discover         List candidate Pi repos via gh search (curate manually)"
    echo "  examples-check            Validate the examples registry (link rot, archived, stale)"
    echo "  help                 Show this help message"
    echo ""
    echo "Environment variables (Pi defaults — Pi reads these natively):"
    echo "  BRUNNR_HOME             Path to brunnr repository (default: ~/.config/brunnr)"
    echo "  BRUNNR_SKILLS_DIR       Target directory for skills      (default: .pi/skills)"
    echo "  BRUNNR_AGENTS_DIR       Target directory for agents      (default: .pi/agents)"
    echo "  BRUNNR_PROMPTS_DIR      Target directory for prompts     (default: .pi/prompts)"
    echo "  BRUNNR_EXTENSIONS_DIR   Target directory for extensions  (default: .pi/extensions)"
    echo "  BRUNNR_THEMES_DIR       Target directory for themes      (default: .pi/themes)"

# Show help
@help: default

# Install brunnr into the current project
install:
    #!/usr/bin/env bash
    set -e
    cd "{{invocation_directory()}}"
    echo "Installing brunnr into current project..."
    mkdir -p "{{SKILLS_DIR}}" "{{AGENTS_DIR}}" "{{PROMPTS_DIR}}" "{{EXTENSIONS_DIR}}" "{{THEMES_DIR}}"
    echo "Created target directories:"
    echo "  - {{SKILLS_DIR}}"
    echo "  - {{AGENTS_DIR}}"
    echo "  - {{PROMPTS_DIR}}"
    echo "  - {{EXTENSIONS_DIR}}"
    echo "  - {{THEMES_DIR}}"
    echo ""
    echo "brunnr is ready. Run 'brunnr eitri' to forge components, 'brunnr hird' for the engineering team, or 'brunnr add <section> <name>' for catalog items."

# Launch Pi with the eitri extension loaded on-demand from BRUNNR_HOME.
# Eitri is bundled with brunnr — never installed into Pi's extension search
# paths — so plain `pi` sessions stay clean and `brunnr eitri` is the only
# entry point.
eitri *args:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{invocation_directory()}}"

    EITRI_PATH="{{BRUNNR_HOME}}/extensions/eitri/eitri.ts"
    if [ ! -f "$EITRI_PATH" ]; then
        echo "Error: eitri.ts not found at $EITRI_PATH"
        echo "  Check that BRUNNR_HOME points at your brunnr clone (currently: {{BRUNNR_HOME}})"
        exit 1
    fi

    if ! command -v pi >/dev/null 2>&1; then
        echo "Error: 'pi' not found on PATH."
        echo "  Install Pi: https://github.com/earendil-works/pi"
        exit 1
    fi

    # Isolate the eitri session from PROJECT-level (.pi/*) skills, prompts, and themes,
    # but keep globally-installed ones at $PI_CODING_AGENT_DIR (default ~/.pi/agent).
    # Pi's --no-* flags disable BOTH project and global discovery, so we then re-pass the
    # global dirs explicitly. Extensions stay fully isolated — only the bundled eitri
    # extension loads. Pi 0.74 has no flag for agents, so global (and any project)
    # agents continue to be discovered automatically.
    PI_GLOBAL="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
    PI_ARGS=(--no-extensions --no-skills --no-prompt-templates --no-themes)
    [ -d "$PI_GLOBAL/skills" ]  && PI_ARGS+=(--skill           "$PI_GLOBAL/skills")
    [ -d "$PI_GLOBAL/prompts" ] && PI_ARGS+=(--prompt-template "$PI_GLOBAL/prompts")
    [ -d "$PI_GLOBAL/themes" ]  && PI_ARGS+=(--theme           "$PI_GLOBAL/themes")
    # Bundled snow theme — discoverable inside eitri sessions. Pi only *activates* a
    # theme via settings.json's `theme:` key, so pick "snow" once via /settings to
    # apply it (it then persists across pi sessions).
    [ -f "{{BRUNNR_HOME}}/themes/snow.json" ] && PI_ARGS+=(--theme "{{BRUNNR_HOME}}/themes/snow.json")
    exec pi "${PI_ARGS[@]}" -e "$EITRI_PATH" {{args}}

# Launch Pi with Brokkr — Eitri's brother in Norse myth, here a TUI shell for /autoresearch-pipeline.
brokkr *args:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{invocation_directory()}}"

    BROKKR_PATH="{{BRUNNR_HOME}}/extensions/brokkr/brokkr.ts"
    if [ ! -f "$BROKKR_PATH" ]; then
        echo "Error: brokkr.ts not found at $BROKKR_PATH"
        echo "  Check that BRUNNR_HOME points at your brunnr clone (currently: {{BRUNNR_HOME}})"
        exit 1
    fi

    if ! command -v pi >/dev/null 2>&1; then
        echo "Error: 'pi' not found on PATH. Install Pi: https://github.com/earendil-works/pi"
        exit 1
    fi

    # Full isolation from the project's Pi state. Otherwise project-level kiosks /
    # gates / system-prompt overrides (e.g. an `AGENTS.md` or `.pi/prompts/*.md`
    # that declares "freeform chat disabled") will hijack the session before
    # Brokkr can render. This mirrors eitri's recipe — both extensions need to
    # stand on their own surface, not inherit project-specific behavior.
    #
    # Disabled at the project level:                         Re-passed from globals:
    #   --no-extensions   .pi/extensions/*.ts                  (extensions stay isolated;
    #   --no-skills       .pi/skills/                          only the bundled brokkr
    #   --no-prompt-templates .pi/prompts/                     extension loads via -e)
    #   --no-themes       .pi/themes/                          --skill / --prompt-template
    #   --no-context-files AGENTS.md / CLAUDE.md auto-load     / --theme on $PI_GLOBAL
    #
    # /autoresearch-pipeline and the autoresearch-* agents are installed globally
    # via `brunnr setup-optimizer` so they survive the --no-* flags.
    PI_GLOBAL="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
    PI_ARGS=(--no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files)
    [ -d "$PI_GLOBAL/skills"  ] && PI_ARGS+=(--skill           "$PI_GLOBAL/skills")
    [ -d "$PI_GLOBAL/prompts" ] && PI_ARGS+=(--prompt-template "$PI_GLOBAL/prompts")
    [ -d "$PI_GLOBAL/themes"  ] && PI_ARGS+=(--theme           "$PI_GLOBAL/themes")
    # Bundled forge theme — made discoverable here, activated by brokkr.ts at
    # session_start (it calls setTheme programmatically and restores the user's
    # previous theme on session_shutdown).
    [ -f "{{BRUNNR_HOME}}/themes/forge.json" ] && PI_ARGS+=(--theme "{{BRUNNR_HOME}}/themes/forge.json")
    exec pi "${PI_ARGS[@]}" -e "$BROKKR_PATH" {{args}}

# Launch Pi with Hird — a Norse engineering retinue implementing the
# dev-team lead → coder → QA protocol. Like eitri/brokkr, Hird is bundled with
# brunnr and loaded on demand; plain `pi` sessions stay clean. Project context
# files are intentionally left enabled so Hird sees the target repo's rules.
hird *args:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{invocation_directory()}}"

    HIRD_PATH="{{BRUNNR_HOME}}/extensions/hird/hird.ts"
    HIRD_THEME="{{BRUNNR_HOME}}/extensions/hird/themes/hird.json"
    if [ ! -f "$HIRD_PATH" ]; then
        echo "Error: hird.ts not found at $HIRD_PATH"
        echo "  Check that BRUNNR_HOME points at your brunnr clone (currently: {{BRUNNR_HOME}})"
        exit 1
    fi

    if ! command -v pi >/dev/null 2>&1; then
        echo "Error: 'pi' not found on PATH. Install Pi: https://github.com/earendil-works/pi"
        exit 1
    fi

    # Isolate extension/skill/prompt/theme discovery from the project, then
    # explicitly re-add globally installed resources plus Hird's bundled theme.
    # There is no Pi agent-path flag; Hird dispatches its bundled agents itself.
    PI_GLOBAL="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
    PI_ARGS=(--no-extensions --no-skills --no-prompt-templates --no-themes)
    [ -d "$PI_GLOBAL/skills"  ] && PI_ARGS+=(--skill           "$PI_GLOBAL/skills")
    [ -d "$PI_GLOBAL/prompts" ] && PI_ARGS+=(--prompt-template "$PI_GLOBAL/prompts")
    [ -d "$PI_GLOBAL/themes"  ] && PI_ARGS+=(--theme           "$PI_GLOBAL/themes")
    [ -f "$HIRD_THEME"        ] && PI_ARGS+=(--theme           "$HIRD_THEME")
    exec pi "${PI_ARGS[@]}" -e "$HIRD_PATH" {{args}}

# Run microsoft/SkillOpt as a sibling optimizer to autoresearch-skill against
# one of the current project's skills. Converts the skill's brunnr eval suite
# into SkillOpt's items.json format, drives SkillOpt's train.py, and writes
# the optimized SKILL.md back as a .skillopt-candidate alongside the live one
# (does not auto-overwrite). One-time setup: clone microsoft/SkillOpt at
# ~/Development/SkillOpt and pip install with Python 3.10+. See scripts/README.md.
skillopt *args:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{invocation_directory()}}"

    SCRIPT="{{BRUNNR_HOME}}/scripts/run-skillopt.sh"
    if [ ! -f "$SCRIPT" ]; then
        echo "Error: run-skillopt.sh not found at $SCRIPT"
        echo "  Check that BRUNNR_HOME points at your brunnr clone (currently: {{BRUNNR_HOME}})"
        exit 1
    fi

    # Run from the user's invocation directory so PROJECT_ROOT defaults to it.
    PROJECT_ROOT="{{invocation_directory()}}" exec "$SCRIPT" {{args}}

# Add an item from brunnr to the current project (default) or globally with -g
add *args:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{invocation_directory()}}"
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    LIBRARY="$BRUNNR_HOME/library.yaml"

    # Parse -g/--global flag and positional args
    GLOBAL=0
    POSITIONAL=()
    for arg in {{args}}; do
        case "$arg" in
            -g|--global) GLOBAL=1 ;;
            *) POSITIONAL+=("$arg") ;;
        esac
    done

    if [ "${#POSITIONAL[@]}" -ne 2 ]; then
        echo "Usage: brunnr add [-g|--global] <section> <name>"
        echo "  <section>: skill, agent, prompt, extension, theme"
        echo "  -g  install to ~/.pi/agent/ (Pi reads it for all projects)"
        exit 1
    fi
    SECTION="${POSITIONAL[0]}"
    NAME="${POSITIONAL[1]}"

    # Resolve target directories based on scope
    if [ "$GLOBAL" = "1" ]; then
        SKILLS_TARGET="{{GLOBAL_SKILLS_DIR}}"
        AGENTS_TARGET="{{GLOBAL_AGENTS_DIR}}"
        PROMPTS_TARGET="{{GLOBAL_PROMPTS_DIR}}"
        EXTENSIONS_TARGET="{{GLOBAL_EXTENSIONS_DIR}}"
        THEMES_TARGET="{{GLOBAL_THEMES_DIR}}"
        SCOPE_LABEL="global"
    else
        SKILLS_TARGET="{{SKILLS_DIR}}"
        AGENTS_TARGET="{{AGENTS_DIR}}"
        PROMPTS_TARGET="{{PROMPTS_DIR}}"
        EXTENSIONS_TARGET="{{EXTENSIONS_DIR}}"
        THEMES_TARGET="{{THEMES_DIR}}"
        SCOPE_LABEL="project"
    fi

    # Map section to target directory and YAML key
    case "$SECTION" in
        skill)     DST="$SKILLS_TARGET";     YAML_KEY="skills" ;;
        agent)     DST="$AGENTS_TARGET";     YAML_KEY="agents" ;;
        prompt)    DST="$PROMPTS_TARGET";    YAML_KEY="prompts" ;;
        extension) DST="$EXTENSIONS_TARGET"; YAML_KEY="extensions" ;;
        theme)     DST="$THEMES_TARGET";     YAML_KEY="themes" ;;
        *)
            echo "Error: Unknown section '$SECTION'"
            echo "Valid sections: skill, agent, prompt, extension, theme"
            exit 1
            ;;
    esac
    
    # Check library.yaml exists
    if [ ! -f "$LIBRARY" ]; then
        echo "Error: library.yaml not found at $LIBRARY"
        exit 1
    fi
    
    # Look up entry in library.yaml using Ruby (safe YAML parsing)
    ENTRY=$(ruby -ryaml -e "
        require 'yaml'
        catalog = YAML.safe_load(File.read('$LIBRARY'), permitted_classes: [], permitted_symbols: [], aliases: false)
        items = catalog['$YAML_KEY'] || []
        item = items.find { |i| i['name'] == ARGV[0] }
        if item
          puts item.to_yaml
        else
          exit 1
        end
    " "$NAME" 2>/dev/null) || {
        echo "Error: $SECTION '$NAME' not found in library.yaml"
        echo "Use 'list' to see available items, or 'search' to find items."
        exit 1
    }
    
    # Extract source from entry (safe YAML parsing)
    SOURCE=$(echo "$ENTRY" | ruby -ryaml -e "require 'yaml'; puts YAML.safe_load(STDIN.read, permitted_classes: [], permitted_symbols: [], aliases: false)['source']")
    
    # Resolve source based on type
    if [[ "$SOURCE" == file://* ]]; then
        # Local file reference - absolute path
        RESOLVED_SRC="${SOURCE#file://}"
    elif [[ "$SOURCE" == https://* ]]; then
        # Remote reference - not supported in this phase
        echo "Error: Remote sources (https://) are not supported for installation"
        echo "Source: $SOURCE"
        echo "Remote fetching is not implemented. Use 'push' to add local items."
        exit 1
    elif [[ "$SOURCE" == skills/* ]]; then
        # Repo-backed skill - extract skill name and copy parent directory
        SKILL_NAME="${SOURCE#skills/}"
        SKILL_NAME="${SKILL_NAME%/SKILL.md}"
        RESOLVED_SRC="$BRUNNR_HOME/skills/$SKILL_NAME"

        # Validate that resolved source is a directory for skills
        if [ ! -d "$RESOLVED_SRC" ]; then
            echo "Error: Skill source is not a directory: $RESOLVED_SRC"
            echo "Expected directory for skill: $SKILL_NAME"
            exit 1
        fi
    elif [[ "$SOURCE" == extensions/* ]]; then
        # Repo-backed extension — may be a single .ts file or a directory tree
        EXT_PATH="${SOURCE#extensions/}"
        EXT_PATH="${EXT_PATH%/}"
        RESOLVED_SRC="$BRUNNR_HOME/extensions/$EXT_PATH"
    elif [[ "$SOURCE" == themes/* ]]; then
        # Repo-backed theme — single .json file
        RESOLVED_SRC="$BRUNNR_HOME/$SOURCE"
    elif [[ "$SOURCE" == agents/* ]] || [[ "$SOURCE" == prompts/* ]]; then
        # Repo-backed agent/prompt - relative to BRUNNR_HOME
        RESOLVED_SRC="$BRUNNR_HOME/$SOURCE"
    else
        echo "Error: Unsupported source format: $SOURCE"
        exit 1
    fi
    
    # Check if resolved source exists
    if [ ! -e "$RESOLVED_SRC" ]; then
        echo "Error: Source file not found: $RESOLVED_SRC"
        echo "Source defined in library.yaml: $SOURCE"
        exit 1
    fi
    
    # Check if target already exists
    if [ "$SECTION" = "extension" ] && [ -d "$RESOLVED_SRC" ]; then
        # Directory-style extensions install to multiple targets. Check every
        # routed top-level destination up front so we never merge/overwrite an
        # existing extension, agent subtree, or theme subtree.
        shopt -s nullglob
        CONFLICTS=()
        for ts in "$RESOLVED_SRC"/*.ts; do
            base="$(basename "$ts")"
            [ -e "$EXTENSIONS_TARGET/$base" ] && CONFLICTS+=("$EXTENSIONS_TARGET/$base")
        done
        if [ -d "$RESOLVED_SRC/agents" ]; then
            for entry in "$RESOLVED_SRC/agents"/*; do
                base="$(basename "$entry")"
                [ -e "$AGENTS_TARGET/$base" ] && CONFLICTS+=("$AGENTS_TARGET/$base")
            done
        fi
        if [ -d "$RESOLVED_SRC/themes" ]; then
            for entry in "$RESOLVED_SRC/themes"/*; do
                base="$(basename "$entry")"
                [ -e "$THEMES_TARGET/$base" ] && CONFLICTS+=("$THEMES_TARGET/$base")
            done
        fi
        if [ "${#CONFLICTS[@]}" -gt 0 ]; then
            echo "Error: extension '$NAME' conflicts with existing $SCOPE_LABEL target(s):"
            printf '  - %s\n' "${CONFLICTS[@]}"
            echo "Use 'push' to update brunnr with local changes, or remove first."
            exit 1
        fi
    elif [ -e "$DST/$NAME" ] || [ -e "$DST/$NAME.md" ] || [ -e "$DST/$NAME.ts" ] || [ -e "$DST/$NAME.json" ]; then
        echo "Error: $SECTION '$NAME' already installed ($SCOPE_LABEL: $DST/)"
        echo "Use 'push' to update brunnr with local changes, or remove first."
        exit 1
    fi

    # Copy files
    echo "Adding $SECTION '$NAME' ($SCOPE_LABEL)..."

    if [ "$SECTION" = "extension" ] && [ -d "$RESOLVED_SRC" ]; then
        # Directory-style extension: route per the brunnr convention.
        #   <src>/*.ts            → $EXTENSIONS_TARGET/   (just the .ts file at top level)
        #   <src>/agents/<sub>/   → $AGENTS_TARGET/<sub>/ (preserves subdir structure)
        #   <src>/themes/<sub>/   → $THEMES_TARGET/<sub>/
        # Other top-level files (README.md etc.) are ignored.
        shopt -s nullglob
        for target_dir in "$EXTENSIONS_TARGET" "$AGENTS_TARGET" "$THEMES_TARGET"; do
            if [ -e "$target_dir" ] && [ ! -d "$target_dir" ]; then
                echo "Error: target path exists but is not a directory: $target_dir"
                exit 1
            fi
        done

        CREATED_PATHS=()
        rollback_extension_install() {
            local status=$?
            if [ "$status" -ne 0 ] && [ "${#CREATED_PATHS[@]}" -gt 0 ]; then
                echo "Install failed; rolling back partial extension install..." >&2
                local i
                for (( i=${#CREATED_PATHS[@]}-1; i>=0; i-- )); do
                    rm -rf "${CREATED_PATHS[$i]}"
                done
            fi
            exit "$status"
        }
        trap rollback_extension_install ERR

        mkdir -p "$EXTENSIONS_TARGET" "$AGENTS_TARGET" "$THEMES_TARGET"
        for ts in "$RESOLVED_SRC"/*.ts; do
            if [ -f "$ts" ]; then
                dst="$EXTENSIONS_TARGET/$(basename "$ts")"
                cp "$ts" "$dst"
                CREATED_PATHS+=("$dst")
            fi
        done
        if [ -d "$RESOLVED_SRC/agents" ]; then
            for entry in "$RESOLVED_SRC/agents"/*; do
                base="$(basename "$entry")"
                dst="$AGENTS_TARGET/$base"
                cp -R "$entry" "$dst"
                CREATED_PATHS+=("$dst")
            done
        fi
        if [ -d "$RESOLVED_SRC/themes" ]; then
            for entry in "$RESOLVED_SRC/themes"/*; do
                base="$(basename "$entry")"
                dst="$THEMES_TARGET/$base"
                cp -R "$entry" "$dst"
                CREATED_PATHS+=("$dst")
            done
        fi
        trap - ERR
        echo "Installed extension '$NAME' (routed to $EXTENSIONS_TARGET/, $AGENTS_TARGET/, $THEMES_TARGET/)"
    else
        # Ensure destination directory exists
        mkdir -p "$DST"
        if [ -d "$RESOLVED_SRC" ]; then
            # For directories (skills), copy the entire directory to target
            cp -r "$RESOLVED_SRC" "$DST/"
        else
            # For files (agents, prompts, themes, single-file extensions)
            cp "$RESOLVED_SRC" "$DST/"
        fi
        echo "Installed $SECTION '$NAME' to $DST/"
    fi
    echo "Dependencies (if any) are documented in library.yaml - install manually if needed."

# Remove an item from the current project
remove *args:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{invocation_directory()}}"
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    LIBRARY="$BRUNNR_HOME/library.yaml"

    GLOBAL=0
    POSITIONAL=()
    for arg in {{args}}; do
        case "$arg" in
            -g|--global) GLOBAL=1 ;;
            *) POSITIONAL+=("$arg") ;;
        esac
    done

    if [ "${#POSITIONAL[@]}" -ne 2 ]; then
        echo "Usage: brunnr remove [-g|--global] <section> <name>"
        exit 1
    fi
    SECTION="${POSITIONAL[0]}"
    NAME="${POSITIONAL[1]}"

    if [ "$GLOBAL" = "1" ]; then
        SKILLS_TARGET="{{GLOBAL_SKILLS_DIR}}"
        AGENTS_TARGET="{{GLOBAL_AGENTS_DIR}}"
        PROMPTS_TARGET="{{GLOBAL_PROMPTS_DIR}}"
        EXTENSIONS_TARGET="{{GLOBAL_EXTENSIONS_DIR}}"
        THEMES_TARGET="{{GLOBAL_THEMES_DIR}}"
        SCOPE_LABEL="global"
    else
        SKILLS_TARGET="{{SKILLS_DIR}}"
        AGENTS_TARGET="{{AGENTS_DIR}}"
        PROMPTS_TARGET="{{PROMPTS_DIR}}"
        EXTENSIONS_TARGET="{{EXTENSIONS_DIR}}"
        THEMES_TARGET="{{THEMES_DIR}}"
        SCOPE_LABEL="project"
    fi

    case "$SECTION" in
        skill)     DST="$SKILLS_TARGET" ;;
        agent)     DST="$AGENTS_TARGET" ;;
        prompt)    DST="$PROMPTS_TARGET" ;;
        extension) DST="$EXTENSIONS_TARGET" ;;
        theme)     DST="$THEMES_TARGET" ;;
        *)
            echo "Error: Unknown section '$SECTION'"
            echo "Valid sections: skill, agent, prompt, extension, theme"
            exit 1
            ;;
    esac

    if [ "$SECTION" = "extension" ]; then
        # Directory-style extension: remove the same routed artifacts that add
        # installed. Fall back to the legacy name-based targets if the catalog
        # entry/source is unavailable.
        REMOVED_ANY=0
        TARGETS=()

        add_extension_remove_target() {
            local target="$1"
            local existing
            if [ "${#TARGETS[@]}" -gt 0 ]; then
                for existing in "${TARGETS[@]}"; do
                    [ "$existing" = "$target" ] && return
                done
            fi
            TARGETS+=("$target")
        }

        SOURCE=""
        if [ -f "$LIBRARY" ]; then
            SOURCE=$(ruby -ryaml -e '
                catalog = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], permitted_symbols: [], aliases: false)
                item = (catalog["extensions"] || []).find { |i| i["name"] == ARGV[1] }
                puts(item ? item["source"].to_s : "")
            ' "$LIBRARY" "$NAME")
        fi

        RESOLVED_SRC=""
        if [[ "$SOURCE" == file://* ]]; then
            RESOLVED_SRC="${SOURCE#file://}"
        elif [[ "$SOURCE" == extensions/* ]]; then
            RESOLVED_SRC="$BRUNNR_HOME/${SOURCE%/}"
        fi

        if [ -n "$RESOLVED_SRC" ] && [ -d "$RESOLVED_SRC" ]; then
            shopt -s nullglob
            for ts in "$RESOLVED_SRC"/*.ts; do
                add_extension_remove_target "$EXTENSIONS_TARGET/$(basename "$ts")"
            done
            if [ -d "$RESOLVED_SRC/agents" ]; then
                for entry in "$RESOLVED_SRC/agents"/*; do
                    add_extension_remove_target "$AGENTS_TARGET/$(basename "$entry")"
                done
            fi
            if [ -d "$RESOLVED_SRC/themes" ]; then
                for entry in "$RESOLVED_SRC/themes"/*; do
                    add_extension_remove_target "$THEMES_TARGET/$(basename "$entry")"
                done
            fi
        elif [ -n "$RESOLVED_SRC" ] && [ -f "$RESOLVED_SRC" ]; then
            add_extension_remove_target "$EXTENSIONS_TARGET/$(basename "$RESOLVED_SRC")"
        fi

        if [ "${#TARGETS[@]}" -eq 0 ]; then
            add_extension_remove_target "$EXTENSIONS_TARGET/$NAME.ts"
            add_extension_remove_target "$AGENTS_TARGET/$NAME"
            add_extension_remove_target "$THEMES_TARGET/$NAME"
        fi

        for target in "${TARGETS[@]}"; do
            if [ -e "$target" ]; then
                if [ -d "$target" ]; then
                    rm -r "$target"
                    echo "Removed $target/"
                else
                    rm "$target"
                    echo "Removed $target"
                fi
                REMOVED_ANY=1
            fi
        done

        if [ "$REMOVED_ANY" = "0" ]; then
            echo "Error: extension '$NAME' is not installed ($SCOPE_LABEL)"
            exit 1
        fi
        echo "Removed extension '$NAME' ($SCOPE_LABEL)"
    else
        # File or directory removal (skill/agent/prompt/theme)
        if [ ! -e "$DST/$NAME" ] && [ ! -e "$DST/$NAME.md" ] && [ ! -e "$DST/$NAME.json" ]; then
            echo "Error: $SECTION '$NAME' is not installed ($SCOPE_LABEL: $DST/)"
            exit 1
        fi
        echo "Removing $SECTION '$NAME' ($SCOPE_LABEL)..."
        if [ -d "$DST/$NAME" ]; then
            rm -r "$DST/$NAME"
        elif [ -e "$DST/$NAME.json" ]; then
            rm "$DST/$NAME.json"
        else
            rm "$DST/$NAME.md"
        fi
        echo "Removed $SECTION '$NAME' from $DST/"
    fi
    echo "Note: Dependencies are not automatically removed."

# Push a new item to brunnr — copies file, upserts library.yaml from frontmatter,
# runs `brunnr check`, branches, commits, pushes, and opens a GitHub PR.
# For new skills/agents/prompts. Extensions/themes need manual edits in $BRUNNR_HOME.
push section name:
    #!/usr/bin/env bash
    set -euo pipefail
    SECTION="{{section}}"
    NAME="{{name}}"
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    LIBRARY="$BRUNNR_HOME/library.yaml"

    # ---- 1. Validate section + map paths -----------------------------------
    case "$SECTION" in
        skill)  SRC="{{SKILLS_SRC}}";  DST="{{SKILLS_DIR}}";  YAML_KEY="skills";  SRC_PATH="skills/$NAME/SKILL.md" ;;
        agent)  SRC="{{AGENTS_SRC}}";  DST="{{AGENTS_DIR}}";  YAML_KEY="agents";  SRC_PATH="agents/$NAME.md" ;;
        prompt) SRC="{{PROMPTS_SRC}}"; DST="{{PROMPTS_DIR}}"; YAML_KEY="prompts"; SRC_PATH="prompts/$NAME.md" ;;
        extension|theme)
            echo "Error: auto-push only supports skill, agent, prompt."
            echo "  For $SECTION, edit files under $BRUNNR_HOME/${SECTION}s/ directly,"
            echo "  register in library.yaml, then commit + open a PR with git/gh."
            exit 1
            ;;
        *)
            echo "Error: Unknown section '$SECTION' (valid: skill, agent, prompt)"
            exit 1
            ;;
    esac

    # ---- 2. Locate item in user's project ----------------------------------
    if [ "$SECTION" = "skill" ]; then
        if [ ! -f "$DST/$NAME/SKILL.md" ]; then
            echo "Error: skill '$NAME' not found at $DST/$NAME/SKILL.md"
            exit 1
        fi
        PROJECT_FILE="$DST/$NAME/SKILL.md"
    else
        if [ ! -f "$DST/$NAME.md" ]; then
            echo "Error: $SECTION '$NAME' not found at $DST/$NAME.md"
            exit 1
        fi
        PROJECT_FILE="$DST/$NAME.md"
    fi

    # ---- 3. Validate library.yaml + reject existing entry -------------------
    if [ ! -f "$LIBRARY" ]; then
        echo "Error: library.yaml not found at $LIBRARY"
        exit 1
    fi

    EXISTING=$(ruby -ryaml -e '
        catalog = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], permitted_symbols: [], aliases: false)
        items = catalog[ARGV[1]] || []
        item = items.find { |i| i["name"] == ARGV[2] }
        puts(item ? item["source"].to_s : "")
    ' "$LIBRARY" "$YAML_KEY" "$NAME")

    if [ -n "$EXISTING" ]; then
        if [[ "$EXISTING" == file://* ]] || [[ "$EXISTING" == https://* ]]; then
            echo "Error: '$NAME' has external source — cannot push to external reference"
            echo "  source: $EXISTING"
            if [ "$SECTION" = "skill" ]; then
                echo "  Run /fork-skill $NAME first to bring it into brunnr."
            elif [ "$SECTION" = "agent" ]; then
                echo "  Run /fork-agent $NAME first to bring it into brunnr."
            fi
            exit 1
        fi
        echo "Error: $SECTION '$NAME' already exists in brunnr (source: $EXISTING)"
        echo "  Push is for new items only. Edit the entry under $BRUNNR_HOME/ directly."
        exit 1
    fi

    # ---- 4. Validate frontmatter on project file ---------------------------
    ruby -ryaml -e '
        path = ARGV[0]
        expected_name = ARGV[1]
        section = ARGV[2]
        content = File.read(path)
        unless content =~ /\A---\s*\n(.*?)\n---/m
            STDERR.puts "Error: source file has no YAML frontmatter: #{path}"
            exit 1
        end
        fm = YAML.safe_load($1, permitted_classes: [], permitted_symbols: [], aliases: false) rescue {}
        fm = {} unless fm.is_a?(Hash)
        missing = []
        ["name", "description", "tags"].each do |f|
            v = fm[f]
            missing << f if v.nil? || (v.respond_to?(:empty?) && v.empty?)
        end
        unless missing.empty?
            STDERR.puts "Error: frontmatter missing required field(s): #{missing.join(", ")}"
            STDERR.puts "  file: #{path}"
            STDERR.puts "  Required for push: name, description, tags"
            exit 1
        end
        if fm["name"] != expected_name
            STDERR.puts "Error: frontmatter name #{fm["name"].inspect} does not match push target #{expected_name.inspect}"
            STDERR.puts "  file: #{path}"
            exit 1
        end
        if section == "prompt" && fm["type"] && !["single", "multi-agent"].include?(fm["type"])
            STDERR.puts "Error: prompt type #{fm["type"].inspect} must be \"single\" or \"multi-agent\""
            exit 1
        end
    ' "$PROJECT_FILE" "$NAME" "$SECTION"

    # ---- 5. Pre-flight git/gh checks ---------------------------------------
    if [ ! -d "$BRUNNR_HOME/.git" ]; then
        echo "Error: $BRUNNR_HOME is not a git repository"
        exit 1
    fi

    cd "$BRUNNR_HOME"

    if [ -n "$(git status --porcelain)" ]; then
        echo "Error: brunnr has uncommitted changes — clean working tree required"
        echo "  $BRUNNR_HOME"
        git status --porcelain
        exit 1
    fi

    if ! git remote get-url origin >/dev/null 2>&1; then
        echo "Error: brunnr has no 'origin' remote"
        echo "  Add one: cd $BRUNNR_HOME && git remote add origin <url>"
        exit 1
    fi

    BRANCH="add-$NAME"
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
        echo "Error: branch '$BRANCH' already exists in brunnr"
        echo "  Delete it: git -C $BRUNNR_HOME branch -D $BRANCH"
        exit 1
    fi

    # ---- 6. Branch from origin/main (or master) ----------------------------
    git fetch origin --quiet 2>/dev/null || true
    if git show-ref --verify --quiet refs/remotes/origin/main; then
        git checkout -b "$BRANCH" origin/main >/dev/null 2>&1
    elif git show-ref --verify --quiet refs/remotes/origin/master; then
        git checkout -b "$BRANCH" origin/master >/dev/null 2>&1
    else
        git checkout -b "$BRANCH" >/dev/null 2>&1
    fi

    # Cleanup if anything fails before commit lands
    SUCCESS=0
    DEFAULT_BRANCH="main"
    git show-ref --verify --quiet refs/heads/main || DEFAULT_BRANCH="master"
    cleanup_local() {
        if [ "$SUCCESS" = "0" ]; then
            cd "$BRUNNR_HOME"
            git checkout "$DEFAULT_BRANCH" >/dev/null 2>&1 || true
            git restore . >/dev/null 2>&1 || true
            git clean -fd >/dev/null 2>&1 || true
            git branch -D "$BRANCH" >/dev/null 2>&1 || true
        fi
    }
    trap cleanup_local EXIT

    # ---- 7. Copy file(s) into brunnr ---------------------------------------
    if [ "$SECTION" = "skill" ]; then
        cp -r "$DST/$NAME" "$SRC/"
    else
        mkdir -p "$SRC"
        cp "$PROJECT_FILE" "$SRC/"
    fi

    # ---- 8. Upsert library.yaml entry --------------------------------------
    ruby -ryaml -e '
        section = ARGV[0]; name = ARGV[1]; library = ARGV[2]; src_file = ARGV[3]; src_path = ARGV[4]
        section_pl = { "skill" => "skills", "agent" => "agents", "prompt" => "prompts" }[section]

        content = File.read(src_file)
        fm = {}
        fm = (YAML.safe_load($1, permitted_classes: [], permitted_symbols: [], aliases: false) || {}) if content =~ /\A---\s*\n(.*?)\n---/m

        emit = ->(v) {
            s = v.to_s
            if s =~ /[:#\[\]{}|>&*!?%@`]/ || s.start_with?(" ") || s.end_with?(" ") || s.empty?
                YAML.dump(s).sub(/\A---\s*\n?/, "").chomp
            else
                s
            end
        }

        e = []
        e << "  - name: #{name}"
        e << "    description: #{emit.call(fm["description"])}"
        e << "    source: #{src_path}"
        e << "    type: #{fm["type"] || "single"}" if section == "prompt"
        e << "    tags: [#{(fm["tags"] || []).map(&:to_s).join(", ")}]"
        e << "    origin: #{fm["origin"]}" if fm["origin"]
        deps = fm["dependencies"] || {}
        e << "    dependencies:"
        e << "      skills: [#{(deps["skills"] || []).join(", ")}]"
        e << "      agents: [#{(deps["agents"] || []).join(", ")}]"
        e << "      prompts: [#{deps["prompts"].join(", ")}]" if section == "prompt" && deps["prompts"] && !deps["prompts"].empty?
        e << "    sync: auto"
        entry_text = e.join("\n") + "\n"

        lines = File.readlines(library)
        section_keys = ["skills", "agents", "prompts", "extensions", "themes"]
        section_lines = {}
        lines.each_with_index do |l, i|
            section_keys.each { |s| section_lines[s] = i if l =~ /\A#{Regexp.escape(s)}:/ && !section_lines.key?(s) }
        end

        start_idx = section_lines[section_pl] or raise "section #{section_pl} not found in library.yaml"

        # Convert empty-array form to multi-line and drop placeholder comment
        if lines[start_idx] =~ /\A#{Regexp.escape(section_pl)}:\s*\[\]\s*$/
            lines[start_idx] = "#{section_pl}:\n"
            lines.delete_at(start_idx + 1) if lines[start_idx + 1] && lines[start_idx + 1] =~ /\A# \(/
        end

        # Find next "# ====" header block boundary
        next_block = nil
        ((start_idx + 1)...lines.length).each do |i|
            (next_block = i; break) if lines[i] =~ /\A# ==========/
        end

        end_idx = next_block ? next_block - 1 : lines.length - 1
        end_idx -= 1 while end_idx > start_idx && lines[end_idx].strip.empty?

        section_had_content = end_idx > start_idx
        insert_text = (section_had_content ? "\n" : "") + entry_text + (next_block ? "\n" : "")
        lines.insert(end_idx + 1, insert_text)

        File.write(library, lines.join)
    ' "$SECTION" "$NAME" "$LIBRARY" "$PROJECT_FILE" "$SRC_PATH"

    # ---- 9. Validate with brunnr check -------------------------------------
    echo "Validating with brunnr check..."
    if ! just -f "$BRUNNR_HOME/justfile" check; then
        echo ""
        echo "Error: brunnr check failed — reverting all changes"
        exit 1
    fi
    echo ""

    # ---- 10. Commit ---------------------------------------------------------
    git add -A
    git commit -m "Add $NAME $SECTION" >/dev/null

    # Past this point we keep the local branch even if push/PR fail
    SUCCESS=1
    trap - EXIT

    # ---- 11. Push branch ----------------------------------------------------
    if ! git push -u origin "$BRANCH" >/dev/null 2>&1; then
        echo "Branch '$BRANCH' committed locally, but 'git push' failed."
        echo "  Push manually: cd $BRUNNR_HOME && git push -u origin $BRANCH"
        exit 1
    fi

    # ---- 12. Open PR via gh -------------------------------------------------
    PR_TITLE="Add $NAME $SECTION"
    PR_BODY=$(printf 'Adds the **`%s`** %s to the brunnr catalog.\n\n- File: `%s`\n- library.yaml: registered under `%s:`\n- Validated with `brunnr check`\n\nForged via `brunnr push %s %s`.' "$NAME" "$SECTION" "$SRC_PATH" "$YAML_KEY" "$SECTION" "$NAME")

    if ! command -v gh >/dev/null 2>&1; then
        echo "Branch pushed; 'gh' CLI not installed (brew install gh)."
        echo "  Open the PR manually, or install gh and run:"
        echo "  cd $BRUNNR_HOME && gh pr create"
        exit 0
    fi

    if ! gh auth status >/dev/null 2>&1; then
        echo "Branch pushed; 'gh' is not authenticated."
        echo "  Run 'gh auth login', then: cd $BRUNNR_HOME && gh pr create"
        exit 0
    fi

    PR_URL=$(gh pr create --title "$PR_TITLE" --body "$PR_BODY" 2>&1) || {
        echo "Branch pushed but 'gh pr create' failed:"
        echo "$PR_URL"
        echo "Try manually: cd $BRUNNR_HOME && gh pr create --title \"$PR_TITLE\""
        exit 1
    }

    echo "Forged: $NAME ($SECTION)"
    echo "  $PR_URL"

# Scrap an item from brunnr — opens a PR that removes the file + library.yaml
# entry. Refuses if other catalog items depend on it.
scrap section name:
    #!/usr/bin/env bash
    set -euo pipefail
    SECTION="{{section}}"
    NAME="{{name}}"
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    LIBRARY="$BRUNNR_HOME/library.yaml"

    # ---- 1. Validate section + map paths -----------------------------------
    case "$SECTION" in
        skill)  YAML_KEY="skills";  REPO_PATH="skills/$NAME";          IS_DIR=1 ;;
        agent)  YAML_KEY="agents";  REPO_PATH="agents/$NAME.md";       IS_DIR=0 ;;
        prompt) YAML_KEY="prompts"; REPO_PATH="prompts/$NAME.md";      IS_DIR=0 ;;
        extension|theme)
            echo "Error: auto-scrap only supports skill, agent, prompt."
            echo "  For $SECTION, edit files under $BRUNNR_HOME/${SECTION}s/ directly,"
            echo "  remove the library.yaml entry, then commit + open a PR with git/gh."
            exit 1
            ;;
        *)
            echo "Error: Unknown section '$SECTION' (valid: skill, agent, prompt)"
            exit 1
            ;;
    esac

    # ---- 2. Validate library.yaml + entry exists ---------------------------
    if [ ! -f "$LIBRARY" ]; then
        echo "Error: library.yaml not found at $LIBRARY"
        exit 1
    fi

    EXISTING=$(ruby -ryaml -e '
        catalog = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], permitted_symbols: [], aliases: false)
        items = catalog[ARGV[1]] || []
        item = items.find { |i| i["name"] == ARGV[2] }
        puts(item ? item["source"].to_s : "")
    ' "$LIBRARY" "$YAML_KEY" "$NAME")

    if [ -z "$EXISTING" ]; then
        echo "Error: $SECTION '$NAME' not found in library.yaml"
        exit 1
    fi

    if [[ "$EXISTING" == file://* ]] || [[ "$EXISTING" == https://* ]]; then
        echo "Error: '$NAME' has external source — cannot auto-scrap"
        echo "  source: $EXISTING"
        echo "  Remove the library.yaml entry manually."
        exit 1
    fi

    # ---- 3. Dependency check -----------------------------------------------
    DEPENDENTS=$(ruby -ryaml -e '
        library = ARGV[0]; section_pl = ARGV[1]; name = ARGV[2]
        catalog = YAML.safe_load(File.read(library), permitted_classes: [], permitted_symbols: [], aliases: false)
        found = []
        %w[skills agents prompts].each do |s|
            (catalog[s] || []).each do |item|
                deps = item["dependencies"] || {}
                if (deps[section_pl] || []).include?(name)
                    found << "#{s}/#{item["name"]}"
                end
            end
        end
        puts found.join("\n")
    ' "$LIBRARY" "$YAML_KEY" "$NAME")

    if [ -n "$DEPENDENTS" ]; then
        echo "Error: $SECTION '$NAME' is a dependency of:"
        echo "$DEPENDENTS" | sed 's/^/  - /'
        echo ""
        echo "Scrap those items first, or remove the dependency from their library.yaml entry."
        exit 1
    fi

    # ---- 4. Pre-flight git/gh checks ---------------------------------------
    if [ ! -d "$BRUNNR_HOME/.git" ]; then
        echo "Error: $BRUNNR_HOME is not a git repository"
        exit 1
    fi

    cd "$BRUNNR_HOME"

    if [ -n "$(git status --porcelain)" ]; then
        echo "Error: brunnr has uncommitted changes — clean working tree required"
        echo "  $BRUNNR_HOME"
        git status --porcelain
        exit 1
    fi

    if ! git remote get-url origin >/dev/null 2>&1; then
        echo "Error: brunnr has no 'origin' remote"
        echo "  Add one: cd $BRUNNR_HOME && git remote add origin <url>"
        exit 1
    fi

    BRANCH="scrap-$NAME"
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
        echo "Error: branch '$BRANCH' already exists in brunnr"
        echo "  Delete it: git -C $BRUNNR_HOME branch -D $BRANCH"
        exit 1
    fi

    # Verify the file we'll delete actually exists
    if [ "$IS_DIR" = "1" ]; then
        if [ ! -d "$BRUNNR_HOME/$REPO_PATH" ]; then
            echo "Error: source directory missing: $BRUNNR_HOME/$REPO_PATH"
            echo "  library.yaml has the entry but the file is gone — delete the entry manually."
            exit 1
        fi
    else
        if [ ! -f "$BRUNNR_HOME/$REPO_PATH" ]; then
            echo "Error: source file missing: $BRUNNR_HOME/$REPO_PATH"
            echo "  library.yaml has the entry but the file is gone — delete the entry manually."
            exit 1
        fi
    fi

    # ---- 5. Branch from origin/main (or master) ----------------------------
    git fetch origin --quiet 2>/dev/null || true
    if git show-ref --verify --quiet refs/remotes/origin/main; then
        git checkout -b "$BRANCH" origin/main >/dev/null 2>&1
    elif git show-ref --verify --quiet refs/remotes/origin/master; then
        git checkout -b "$BRANCH" origin/master >/dev/null 2>&1
    else
        git checkout -b "$BRANCH" >/dev/null 2>&1
    fi

    SUCCESS=0
    DEFAULT_BRANCH="main"
    git show-ref --verify --quiet refs/heads/main || DEFAULT_BRANCH="master"
    cleanup_local() {
        if [ "$SUCCESS" = "0" ]; then
            cd "$BRUNNR_HOME"
            git checkout "$DEFAULT_BRANCH" >/dev/null 2>&1 || true
            git restore . >/dev/null 2>&1 || true
            git clean -fd >/dev/null 2>&1 || true
            git branch -D "$BRANCH" >/dev/null 2>&1 || true
        fi
    }
    trap cleanup_local EXIT

    # ---- 6. Delete file(s) -------------------------------------------------
    if [ "$IS_DIR" = "1" ]; then
        rm -rf "$BRUNNR_HOME/$REPO_PATH"
    else
        rm "$BRUNNR_HOME/$REPO_PATH"
    fi

    # ---- 7. Remove library.yaml entry --------------------------------------
    ruby -e '
        section = ARGV[0]; name = ARGV[1]; library = ARGV[2]
        section_pl = { "skill" => "skills", "agent" => "agents", "prompt" => "prompts" }[section]

        lines = File.readlines(library)
        section_keys = ["skills", "agents", "prompts", "extensions", "themes"]
        section_lines = {}
        lines.each_with_index do |l, i|
            section_keys.each { |s| section_lines[s] = i if l =~ /\A#{Regexp.escape(s)}:/ && !section_lines.key?(s) }
        end
        section_start = section_lines[section_pl] or raise "section #{section_pl} not found"

        next_block = nil
        ((section_start + 1)...lines.length).each do |i|
            (next_block = i; break) if lines[i] =~ /\A# ==========/
        end
        section_end = next_block ? next_block - 1 : lines.length - 1

        target_start = nil
        ((section_start + 1)..section_end).each do |i|
            if lines[i] =~ /\A  - name:\s*#{Regexp.escape(name)}\s*$/
                target_start = i; break
            end
        end
        raise "entry #{name.inspect} not found in section #{section_pl}" unless target_start

        # Find target end: next "  - name:" within the section, or section_end + 1
        target_end = section_end + 1
        ((target_start + 1)..section_end).each do |i|
            if lines[i] =~ /\A  - name:/
                target_end = i; break
            end
        end

        lines.slice!(target_start, target_end - target_start)

        # Recompute section state — was that the last entry?
        new_section_lines = {}
        lines.each_with_index do |l, i|
            section_keys.each { |s| new_section_lines[s] = i if l =~ /\A#{Regexp.escape(s)}:/ && !new_section_lines.key?(s) }
        end
        new_section_start = new_section_lines[section_pl]
        new_next_block = nil
        ((new_section_start + 1)...lines.length).each do |i|
            (new_next_block = i; break) if lines[i] =~ /\A# ==========/
        end
        new_section_end = new_next_block ? new_next_block - 1 : lines.length - 1

        has_entries = false
        ((new_section_start + 1)..new_section_end).each do |i|
            if lines[i] =~ /\A  - name:/
                has_entries = true; break
            end
        end

        if !has_entries
            # Convert to inline empty array, drop trailing blanks within the section
            lines[new_section_start] = "#{section_pl}: []\n"
            walker = new_section_start + 1
            while walker < lines.length && lines[walker].strip.empty?
                lines.delete_at(walker)
            end
            # Re-add a single blank line before the next block if applicable
            if new_next_block && lines[new_section_start + 1] && lines[new_section_start + 1] !~ /\A\s*$/
                lines.insert(new_section_start + 1, "\n")
            end
        end

        File.write(library, lines.join)
    ' "$SECTION" "$NAME" "$LIBRARY"

    # ---- 8. Validate with brunnr check -------------------------------------
    echo "Validating with brunnr check..."
    if ! just -f "$BRUNNR_HOME/justfile" check; then
        echo ""
        echo "Error: brunnr check failed — reverting all changes"
        exit 1
    fi
    echo ""

    # ---- 9. Commit ---------------------------------------------------------
    git add -A
    git commit -m "Scrap $NAME $SECTION" >/dev/null

    SUCCESS=1
    trap - EXIT

    # ---- 10. Push branch ---------------------------------------------------
    if ! git push -u origin "$BRANCH" >/dev/null 2>&1; then
        echo "Branch '$BRANCH' committed locally, but 'git push' failed."
        echo "  Push manually: cd $BRUNNR_HOME && git push -u origin $BRANCH"
        exit 1
    fi

    # ---- 11. Open PR via gh ------------------------------------------------
    PR_TITLE="Scrap $NAME $SECTION"
    PR_BODY=$(printf 'Scraps the **`%s`** %s from the brunnr catalog.\n\n- Removed: `%s`\n- library.yaml: entry under `%s:` deleted\n- Validated with `brunnr check` (no remaining items depend on this one)\n\nScrapped via `brunnr scrap %s %s`.' "$NAME" "$SECTION" "$REPO_PATH" "$YAML_KEY" "$SECTION" "$NAME")

    if ! command -v gh >/dev/null 2>&1; then
        echo "Branch pushed; 'gh' CLI not installed (brew install gh)."
        echo "  Open the PR manually, or install gh and run:"
        echo "  cd $BRUNNR_HOME && gh pr create"
        exit 0
    fi

    if ! gh auth status >/dev/null 2>&1; then
        echo "Branch pushed; 'gh' is not authenticated."
        echo "  Run 'gh auth login', then: cd $BRUNNR_HOME && gh pr create"
        exit 0
    fi

    PR_URL=$(gh pr create --title "$PR_TITLE" --body "$PR_BODY" 2>&1) || {
        echo "Branch pushed but 'gh pr create' failed:"
        echo "$PR_URL"
        echo "Try manually: cd $BRUNNR_HOME && gh pr create --title \"$PR_TITLE\""
        exit 1
    }

    echo "Scrapped: $NAME ($SECTION)"
    echo "  $PR_URL"

# List available or installed items — pass -g to show what's installed globally
list *args:
    #!/usr/bin/env bash
    cd "{{invocation_directory()}}"
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    LIBRARY="$BRUNNR_HOME/library.yaml"

    GLOBAL=0
    SECTION=""
    for arg in {{args}}; do
        case "$arg" in
            -g|--global) GLOBAL=1 ;;
            *) SECTION="$arg" ;;
        esac
    done

    if [ "$GLOBAL" = "1" ]; then
        SKILLS_TARGET="{{GLOBAL_SKILLS_DIR}}"
        AGENTS_TARGET="{{GLOBAL_AGENTS_DIR}}"
        PROMPTS_TARGET="{{GLOBAL_PROMPTS_DIR}}"
        EXTENSIONS_TARGET="{{GLOBAL_EXTENSIONS_DIR}}"
        THEMES_TARGET="{{GLOBAL_THEMES_DIR}}"
        SCOPE_LABEL="Globally installed"
    else
        SKILLS_TARGET="{{SKILLS_DIR}}"
        AGENTS_TARGET="{{AGENTS_DIR}}"
        PROMPTS_TARGET="{{PROMPTS_DIR}}"
        EXTENSIONS_TARGET="{{EXTENSIONS_DIR}}"
        THEMES_TARGET="{{THEMES_DIR}}"
        SCOPE_LABEL="Installed"
    fi

    list_installed() {
        local dir="$1"
        local suffix="$2"
        if [ -d "$dir" ]; then
            for item in "$dir"/*; do
                if [ -e "$item" ]; then
                    basename "$item" | sed "s/$suffix$//"
                fi
            done | sort
        fi
    }

    if [ -z "$SECTION" ]; then
        echo "brunnr catalog sections:"
        echo ""

        if [ -f "$LIBRARY" ]; then
            for sec in skills agents prompts extensions themes; do
                echo "$sec:"
                ruby -ryaml -e "
                    require 'yaml'
                    catalog = YAML.safe_load(File.read('$LIBRARY'), permitted_classes: [], permitted_symbols: [], aliases: false)
                    items = catalog['$sec'] || []
                    if items.empty?
                        puts '  (none)'
                    else
                        items.each { |i| puts \"  #{i['name']} - #{i['description']}\" }
                    end
                " 2>/dev/null || echo "  (none)"
                echo ""
            done
        else
            echo "  Error: library.yaml not found"
        fi
    else
        case "$SECTION" in
            skill)     LIB_KEY="skills";     INST_DIR="$SKILLS_TARGET";     INST_SUFFIX="" ;;
            agent)     LIB_KEY="agents";     INST_DIR="$AGENTS_TARGET";     INST_SUFFIX=".md" ;;
            prompt)    LIB_KEY="prompts";    INST_DIR="$PROMPTS_TARGET";    INST_SUFFIX=".md" ;;
            extension) LIB_KEY="extensions"; INST_DIR="$EXTENSIONS_TARGET"; INST_SUFFIX=".ts" ;;
            theme)     LIB_KEY="themes";     INST_DIR="$THEMES_TARGET";     INST_SUFFIX=".json" ;;
            *)
                echo "Error: Unknown section '$SECTION'"
                echo "Valid sections: skill, agent, prompt, extension, theme"
                exit 1
                ;;
        esac

        echo "Available ${LIB_KEY}:"
        if [ -f "$LIBRARY" ]; then
            ruby -ryaml -e "
                require 'yaml'
                catalog = YAML.safe_load(File.read('$LIBRARY'), permitted_classes: [], permitted_symbols: [], aliases: false)
                items = catalog['$LIB_KEY'] || []
                items.each { |i| puts \"  #{i['name']} - #{i['description']}\" }
            " 2>/dev/null || echo "  (none)"
        else
            echo "  (none)"
        fi
        echo ""
        echo "$SCOPE_LABEL $LIB_KEY ($INST_DIR):"
        installed=$(list_installed "$INST_DIR" "$INST_SUFFIX" | sed 's/^/  /')
        if [ -z "$installed" ]; then
            echo "  (none)"
        else
            echo "$installed"
        fi
    fi

# Pull the latest catalog content from origin — does NOT change tool behavior (run `upgrade` for that).
sync:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    TOOL_VERSION="{{TOOL_VERSION}}"

    [ -t 1 ] && C=$'\033[1;36m' G=$'\033[1;32m' R=$'\033[1;31m' X=$'\033[0m' || C= G= R= X=
    say()  { printf "%s==>%s %s\n" "$C" "$X" "$*"; }
    ok()   { printf "%s  ✓%s %s\n" "$G" "$X" "$*"; }
    die()  { printf "%s  ✗%s %s\n" "$R" "$X" "$*" >&2; exit 1; }
    spin() {
        local pid=$1 msg="${2:-}"
        local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏') i=0
        if [ ! -t 1 ]; then wait "$pid" 2>/dev/null; return $?; fi
        while kill -0 "$pid" 2>/dev/null; do
            printf "\r%s%s%s %s" "$C" "${frames[$((i%10))]}" "$X" "$msg"
            i=$((i+1)); sleep 0.08
        done
        wait "$pid" 2>/dev/null; local rc=$?
        printf "\r\033[K"; return "$rc"
    }

    # Catalog paths — sync ONLY these. Tool files (justfile, install.sh, lore/,
    # README.md, SKILL.md, AGENTS.md, CLAUDE.md) are updated via `brunnr upgrade`.
    CATALOG_PATHS=(library.yaml skills agents prompts extensions themes)

    [ -d "$BRUNNR_HOME/.git" ] || die "$BRUNNR_HOME is not a git repository"
    cd "$BRUNNR_HOME"
    git remote get-url origin >/dev/null 2>&1 || die "no remote configured for brunnr"

    DIRTY_CATALOG=$(git status --porcelain -- "${CATALOG_PATHS[@]}" 2>/dev/null || true)
    if [ -n "$DIRTY_CATALOG" ]; then
        printf "%s  ✗%s uncommitted changes in catalog paths — commit or stash first:\n" "$R" "$X" >&2
        printf '%s\n' "$DIRTY_CATALOG" >&2
        exit 1
    fi

    git fetch origin >/dev/null 2>&1 &
    spin $! "Fetching origin"

    REMOTE_BRANCH=main
    git show-ref --verify --quiet refs/remotes/origin/main || REMOTE_BRANCH=master

    MIN_TOOL_VERSION=$(git show "origin/$REMOTE_BRANCH:library.yaml" 2>/dev/null \
        | awk -F'"' '/^min_tool_version:/ {print $2; exit}')
    if [ -n "$MIN_TOOL_VERSION" ]; then
        LOWER=$(printf '%s\n%s\n' "$TOOL_VERSION" "$MIN_TOOL_VERSION" | sort -V | head -1)
        if [ "$LOWER" != "$MIN_TOOL_VERSION" ]; then
            die "catalog requires brunnr tool >= $MIN_TOOL_VERSION (you have $TOOL_VERSION). Run 'brunnr upgrade' first."
        fi
    fi

    REMOTE_SHA=$(git rev-parse --short "origin/$REMOTE_BRANCH")

    # Filter to paths that actually exist on origin — catalog dirs that haven't
    # been created yet (e.g. `skills/` before the first skill is added) would
    # otherwise make `git checkout` fail with "pathspec did not match".
    EXISTING=()
    for p in "${CATALOG_PATHS[@]}"; do
        if git ls-tree --name-only "origin/$REMOTE_BRANCH" -- "$p" >/dev/null 2>&1 \
            && [ -n "$(git ls-tree --name-only "origin/$REMOTE_BRANCH" -- "$p" 2>/dev/null)" ]; then
            EXISTING+=("$p")
        fi
    done

    if [ "${#EXISTING[@]}" -eq 0 ]; then
        ok "catalog is empty on origin @ $REMOTE_SHA"
    else
        git checkout "origin/$REMOTE_BRANCH" -- "${EXISTING[@]}"

        if git diff --cached --quiet -- "${EXISTING[@]}" 2>/dev/null; then
            ok "catalog already up to date (origin @ $REMOTE_SHA)"
        else
            git -c user.name='brunnr-sync' -c user.email='brunnr-sync@local' \
                commit -m "brunnr: sync catalog @ $REMOTE_SHA" \
                -- "${EXISTING[@]}" >/dev/null
            ok "catalog synced to origin @ $REMOTE_SHA"
            printf "%s%s%s update brunnr only with 'brunnr sync' / 'brunnr upgrade' — 'git pull' in this dir will show divergent history.\n" "$C" "  i" "$X"
        fi
    fi

# Update brunnr itself (justfile, install.sh, lore, docs) — does NOT touch the catalog.
upgrade:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"

    [ -t 1 ] && C=$'\033[1;36m' G=$'\033[1;32m' Y=$'\033[1;33m' R=$'\033[1;31m' X=$'\033[0m' || C= G= Y= R= X=
    say()  { printf "%s==>%s %s\n" "$C" "$X" "$*"; }
    ok()   { printf "%s  ✓%s %s\n" "$G" "$X" "$*"; }
    die()  { printf "%s  ✗%s %s\n" "$R" "$X" "$*" >&2; exit 1; }
    spin() {
        local pid=$1 msg="${2:-}"
        local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏') i=0
        if [ ! -t 1 ]; then wait "$pid" 2>/dev/null; return $?; fi
        while kill -0 "$pid" 2>/dev/null; do
            printf "\r%s%s%s %s" "$C" "${frames[$((i%10))]}" "$X" "$msg"
            i=$((i+1)); sleep 0.08
        done
        wait "$pid" 2>/dev/null; local rc=$?
        printf "\r\033[K"; return "$rc"
    }

    # Tool paths — upgrade ONLY these. Catalog (library.yaml, skills/, agents/,
    # prompts/, extensions/, themes/) is updated via `brunnr sync`.
    TOOL_PATHS=(justfile install.sh README.md SKILL.md AGENTS.md CLAUDE.md lore)

    [ -d "$BRUNNR_HOME/.git" ] || die "$BRUNNR_HOME is not a git repository"
    cd "$BRUNNR_HOME"
    git remote get-url origin >/dev/null 2>&1 || die "no remote configured for brunnr"

    DIRTY_TOOL=$(git status --porcelain -- "${TOOL_PATHS[@]}" 2>/dev/null || true)
    if [ -n "$DIRTY_TOOL" ]; then
        printf "%s  ✗%s uncommitted changes in tool paths — commit or stash first:\n" "$R" "$X" >&2
        printf '%s\n' "$DIRTY_TOOL" >&2
        exit 1
    fi

    git fetch origin >/dev/null 2>&1 &
    spin $! "Fetching origin"

    REMOTE_BRANCH=main
    git show-ref --verify --quiet refs/remotes/origin/main || REMOTE_BRANCH=master
    REMOTE_SHA=$(git rev-parse --short "origin/$REMOTE_BRANCH")

    # Filter to paths that actually exist on origin — guards against tool paths
    # that aren't on this branch yet (e.g. a newly-added lore subdir).
    EXISTING=()
    for p in "${TOOL_PATHS[@]}"; do
        if [ -n "$(git ls-tree --name-only "origin/$REMOTE_BRANCH" -- "$p" 2>/dev/null)" ]; then
            EXISTING+=("$p")
        fi
    done

    if [ "${#EXISTING[@]}" -eq 0 ]; then
        ok "no tool paths to update on origin @ $REMOTE_SHA"
    else
        git checkout "origin/$REMOTE_BRANCH" -- "${EXISTING[@]}"

        if git diff --cached --quiet -- "${EXISTING[@]}" 2>/dev/null; then
            ok "tool already up to date (origin @ $REMOTE_SHA)"
        else
            git -c user.name='brunnr-upgrade' -c user.email='brunnr-upgrade@local' \
                commit -m "brunnr: upgrade tool @ $REMOTE_SHA" \
                -- "${EXISTING[@]}" >/dev/null
            ok "tool upgraded to origin @ $REMOTE_SHA"
            printf "%s%s%s update brunnr only with 'brunnr sync' / 'brunnr upgrade' — 'git pull' in this dir will show divergent history.\n" "$C" "  i" "$X"
            if git diff HEAD~1 HEAD --name-only -- install.sh 2>/dev/null | grep -q install.sh; then
                say "install.sh changed — re-run it to pick up shell-alias changes"
            fi
        fi
    fi

# Remove brunnr from this machine (alias + $BRUNNR_HOME) — leaves installed catalog items alone.
uninstall:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"

    echo "This will:"
    echo "  - delete $BRUNNR_HOME"
    echo "  - remove the 'brunnr' alias from your shell rc"
    echo ""
    echo "Catalog items already installed into projects (.pi/) and globally (~/.pi/agent/)"
    echo "will NOT be removed — use 'brunnr remove' for those before uninstalling."
    echo ""
    if [ -t 0 ]; then
        read -r -p "Continue? [y/N] " ans
        [[ "$ans" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
    else
        echo "Non-interactive — set BRUNNR_UNINSTALL_CONFIRM=1 to skip prompt."
        [ "${BRUNNR_UNINSTALL_CONFIRM:-}" = "1" ] || { echo "Aborted."; exit 1; }
    fi

    case "$(basename "${SHELL:-bash}")" in
        zsh)  RC="$HOME/.zshrc" ;;
        bash) RC="$HOME/.bashrc" ;;
        fish) RC="$HOME/.config/fish/config.fish" ;;
        *)    RC="" ;;
    esac

    if [ -n "$RC" ] && [ -f "$RC" ] && grep -q "alias brunnr" "$RC" 2>/dev/null; then
        tmp=$(mktemp)
        # Drop the '# brunnr' marker and the alias line that follows it,
        # plus any standalone alias brunnr lines.
        awk '
            /^# brunnr$/ { skip = 1; next }
            skip && /^alias brunnr/ { skip = 0; next }
            /^alias brunnr[ =]/ { next }
            { skip = 0; print }
        ' "$RC" > "$tmp"
        mv "$tmp" "$RC"
        echo "Removed alias from $RC"
    fi

    rm -rf "$BRUNNR_HOME"
    echo "Removed $BRUNNR_HOME"
    echo ""
    echo "The 'brunnr' alias is still loaded in this shell session."
    echo "Open a new terminal (or run 'unalias brunnr') to clear it."

# Install the full optimization stack globally — agents + slash commands. Re-runnable.
setup-optimizer:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    JUST=(just -f "$BRUNNR_HOME/justfile")

    [ -t 1 ] && C=$'\033[1;36m' G=$'\033[1;32m' Y=$'\033[1;33m' R=$'\033[1;31m' X=$'\033[0m' || C= G= Y= R= X=
    say()  { printf "%s==>%s %s\n" "$C" "$X" "$*"; }
    ok()   { printf "%s  ✓%s %s\n" "$G" "$X" "$*"; }
    warn() { printf "%s  !%s %s\n" "$Y" "$X" "$*" >&2; }
    spin() {
        local pid=$1 msg="${2:-}"
        local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏') i=0
        if [ ! -t 1 ]; then wait "$pid" 2>/dev/null; return $?; fi
        while kill -0 "$pid" 2>/dev/null; do
            printf "\r%s%s%s %s" "$C" "${frames[$((i%10))]}" "$X" "$msg"
            i=$((i+1)); sleep 0.08
        done
        wait "$pid" 2>/dev/null; local rc=$?
        printf "\r\033[K"; return "$rc"
    }

    install_item() {
        local kind=$1 name=$2 log
        log=$(mktemp)
        "${JUST[@]}" add -g "$kind" "$name" >"$log" 2>&1 &
        if spin $! "$kind: $name"; then
            ok "$kind: $name"
        elif grep -q "already installed" "$log"; then
            ok "$kind: $name (already installed)"
        else
            warn "$kind: $name failed:"
            sed 's/^/    /' "$log" >&2
        fi
        rm -f "$log"
    }

    # Keep these two lists in sync with remove-optimizer.
    AGENTS=(
        autoresearch autoresearch-skill autoresearch-skill-gepa
        autoresearch-agent eval-designer eval-designer-agent
    )
    PROMPTS=(
        autoresearch autoresearch-skill autoresearch-skill-gepa
        autoresearch-pipeline autoresearch-agent gen-evals gen-evals-agent
        skill-status agent-status fork-skill fork-agent
    )

    say "Installing optimizer stack globally (${#AGENTS[@]} agents, ${#PROMPTS[@]} prompts)"
    for name in "${AGENTS[@]}";  do install_item agent  "$name"; done
    for name in "${PROMPTS[@]}"; do install_item prompt "$name"; done
    say "Done — agents at ~/.pi/agent/agents/, prompts at ~/.pi/agent/prompts/"
    say "Run /gen-evals (or /gen-evals-agent) in any pi session to get started"

# Refresh already-installed optimizer agents+prompts from the catalog. Use
# this after `brunnr sync` if the catalog has newer versions of agent or
# prompt files than the ones Pi is loading. Unlike setup-optimizer (which
# refuses to overwrite via `add`), update-optimizer copies the catalog
# version directly when the installed file differs.
update-optimizer:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    AGENTS_TARGET="{{GLOBAL_AGENTS_DIR}}"
    PROMPTS_TARGET="{{GLOBAL_PROMPTS_DIR}}"

    [ -t 1 ] && C=$'\033[1;36m' G=$'\033[1;32m' Y=$'\033[1;33m' X=$'\033[0m' || C= G= Y= X=
    say()  { printf "%s==>%s %s\n" "$C" "$X" "$*"; }
    ok()   { printf "%s  ✓%s %s\n" "$G" "$X" "$*"; }
    same() { printf "%s  =%s %s\n" "$Y" "$X" "$*"; }
    miss() { printf "%s  -%s %s\n" "$Y" "$X" "$*"; }

    # Keep these two lists in sync with setup-optimizer and remove-optimizer.
    AGENTS=(
        autoresearch autoresearch-skill autoresearch-skill-gepa
        autoresearch-agent eval-designer eval-designer-agent
    )
    PROMPTS=(
        autoresearch autoresearch-skill autoresearch-skill-gepa
        autoresearch-pipeline autoresearch-agent gen-evals gen-evals-agent
        skill-status agent-status fork-skill fork-agent
    )

    refresh() {
        local kind=$1 name=$2 src_dir=$3 dst_dir=$4
        local src="$src_dir/$name.md"
        local dst="$dst_dir/$name.md"
        if [ ! -f "$src" ]; then
            miss "$kind: $name (not in catalog)"
            return
        fi
        if [ ! -f "$dst" ]; then
            miss "$kind: $name (not installed — run 'brunnr setup-optimizer')"
            return
        fi
        if diff -q "$src" "$dst" >/dev/null 2>&1; then
            same "$kind: $name"
            return
        fi
        cp "$src" "$dst"
        ok "$kind: $name (refreshed)"
    }

    say "Refreshing optimizer stack from catalog @ $BRUNNR_HOME"
    for name in "${AGENTS[@]}";  do refresh agent  "$name" "$BRUNNR_HOME/agents"  "$AGENTS_TARGET";  done
    for name in "${PROMPTS[@]}"; do refresh prompt "$name" "$BRUNNR_HOME/prompts" "$PROMPTS_TARGET"; done
    say "Done"

# Remove the full optimization stack from the global install. Items not present are skipped.
remove-optimizer:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    JUST=(just -f "$BRUNNR_HOME/justfile")

    [ -t 1 ] && C=$'\033[1;36m' G=$'\033[1;32m' Y=$'\033[1;33m' X=$'\033[0m' || C= G= Y= X=
    say() { printf "%s==>%s %s\n" "$C" "$X" "$*"; }
    ok()  { printf "%s  ✓%s %s\n" "$G" "$X" "$*"; }
    dim() { printf "%s  -%s %s\n" "$Y" "$X" "$*"; }
    spin() {
        local pid=$1 msg="${2:-}"
        local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏') i=0
        if [ ! -t 1 ]; then wait "$pid" 2>/dev/null; return $?; fi
        while kill -0 "$pid" 2>/dev/null; do
            printf "\r%s%s%s %s" "$C" "${frames[$((i%10))]}" "$X" "$msg"
            i=$((i+1)); sleep 0.08
        done
        wait "$pid" 2>/dev/null; local rc=$?
        printf "\r\033[K"; return "$rc"
    }

    remove_item() {
        local kind=$1 name=$2
        "${JUST[@]}" remove -g "$kind" "$name" >/dev/null 2>&1 &
        if spin $! "$kind: $name"; then
            ok "$kind: $name"
        else
            dim "$kind: $name (not installed)"
        fi
    }

    # Keep in sync with setup-optimizer.
    AGENTS=(
        autoresearch autoresearch-skill autoresearch-skill-gepa
        autoresearch-agent eval-designer eval-designer-agent
    )
    PROMPTS=(
        autoresearch autoresearch-skill autoresearch-skill-gepa
        autoresearch-pipeline autoresearch-agent gen-evals gen-evals-agent
        skill-status agent-status fork-skill fork-agent
    )

    say "Removing optimizer stack (${#AGENTS[@]} agents, ${#PROMPTS[@]} prompts)"
    for name in "${AGENTS[@]}";  do remove_item agent  "$name"; done
    for name in "${PROMPTS[@]}"; do remove_item prompt "$name"; done
    say "Done"

# Show open PRs in brunnr — items waiting to be reviewed/merged into the catalog
status:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"

    if [ ! -d "$BRUNNR_HOME/.git" ]; then
        echo "Error: $BRUNNR_HOME is not a git repository"
        exit 1
    fi

    if ! command -v gh >/dev/null 2>&1; then
        echo "Error: 'gh' CLI not found. Install: brew install gh"
        exit 1
    fi

    cd "$BRUNNR_HOME"

    if ! git remote get-url origin >/dev/null 2>&1; then
        echo "Error: brunnr has no 'origin' remote configured"
        echo "Add one with: cd $BRUNNR_HOME && git remote add origin <url>"
        exit 1
    fi

    PRS=$(gh pr list --state open --json number,title,headRefName,createdAt,author --limit 50 2>/dev/null) || {
        echo "Error: 'gh pr list' failed. Run 'gh auth status' to check authentication."
        exit 1
    }

    if [ "$PRS" = "[]" ]; then
        echo "No open PRs — the forge is quiet."
        exit 0
    fi

    echo "Open PRs in brunnr (waiting to be forged):"
    echo ""
    echo "$PRS" | ruby -rjson -e '
        prs = JSON.parse(STDIN.read)
        prs.each do |pr|
            age_days = ((Time.now - Time.parse(pr["createdAt"])) / 86400).to_i
            age_str = age_days == 0 ? "today" : "#{age_days}d ago"
            puts "  ##{pr["number"]} #{pr["title"]}"
            puts "      #{pr["headRefName"]} | @#{pr["author"]["login"]} | #{age_str}"
        end
    '
    echo ""
    echo "Review: gh pr view <num> --web   (run from $BRUNNR_HOME)"

# Search the catalog
search query:
    #!/usr/bin/env bash
    QUERY="{{query}}"
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    LIBRARY="$BRUNNR_HOME/library.yaml"
    
    echo "Searching brunnr catalog for '$QUERY'..."
    echo ""
    
    if [ ! -f "$LIBRARY" ]; then
        echo "Error: library.yaml not found at $LIBRARY"
        exit 1
    fi
    
    # Search catalog fields (name, description, tags) from library.yaml
    ruby -ryaml -e "
        require 'yaml'
        catalog = YAML.safe_load(File.read('$LIBRARY'), permitted_classes: [], permitted_symbols: [], aliases: false)
        query = ARGV[0].downcase

        found = false

        ['skills', 'agents', 'prompts', 'extensions', 'themes'].each do |section|
          items = catalog[section] || []
          items.each do |item|
            name = item['name'].to_s.downcase
            desc = item['description'].to_s.downcase
            tags = item['tags'].to_a.map(&:to_s).map(&:downcase)

            if name.include?(query) || desc.include?(query) || tags.any? { |t| t.include?(query) }
              found = true
              section_name = section.sub(/s$/, '')  # Remove final 's' for singular
              puts \"#{section_name}: #{item['name']} - #{item['description']}\"
              puts \"  tags: #{item['tags'].join(', ')}\" if item['tags'] && !item['tags'].empty?
              puts
            end
          end
        end

        exit(found ? 0 : 1)
    " "$QUERY" || echo "No matches found in catalog"

# Bump the brunnr tool version. Edits TOOL_VERSION (justfile) AND `version` (library.yaml)
# in lockstep. Does NOT change min_tool_version — use `require-tool` for that.
bump version:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    NEW="{{version}}"
    CUR="{{TOOL_VERSION}}"

    if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "Error: version must be MAJOR.MINOR.PATCH (got: $NEW)" >&2
        exit 1
    fi

    LOWER=$(printf '%s\n%s\n' "$CUR" "$NEW" | sort -V | head -1)
    if [ "$LOWER" != "$CUR" ] || [ "$CUR" = "$NEW" ]; then
        echo "Error: new ($NEW) must be strictly greater than current ($CUR)" >&2
        exit 1
    fi

    sed -i.bak -E "s/(^export TOOL_VERSION := \")[^\"]+(\")/\1$NEW\2/" "$BRUNNR_HOME/justfile"
    rm "$BRUNNR_HOME/justfile.bak"

    sed -i.bak -E "s/(^version: \")[^\"]+(\")/\1$NEW\2/" "$BRUNNR_HOME/library.yaml"
    rm "$BRUNNR_HOME/library.yaml.bak"

    echo "Bumped tool version: $CUR -> $NEW"
    echo "  justfile:     TOOL_VERSION = \"$NEW\""
    echo "  library.yaml: version      = \"$NEW\""
    echo ""
    echo "If this release adds tool features the catalog now depends on, also run:"
    echo "  brunnr require-tool $NEW"

# Tighten the catalog's tool-version requirement. Edits min_tool_version in library.yaml.
# Rare — only when a new catalog entry depends on a feature older tool versions lack.
require-tool version:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    NEW="{{version}}"
    TOOL_V="{{TOOL_VERSION}}"
    LIBRARY="$BRUNNR_HOME/library.yaml"

    if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "Error: version must be MAJOR.MINOR.PATCH (got: $NEW)" >&2
        exit 1
    fi

    LOWER=$(printf '%s\n%s\n' "$NEW" "$TOOL_V" | sort -V | head -1)
    if [ "$LOWER" != "$NEW" ] && [ "$NEW" != "$TOOL_V" ]; then
        echo "Error: requested min_tool_version ($NEW) > local TOOL_VERSION ($TOOL_V)" >&2
        echo "Run 'brunnr bump $NEW' first to ship the tool, then require it." >&2
        exit 1
    fi

    CUR=$(awk -F'"' '/^min_tool_version:/ {print $2; exit}' "$LIBRARY")
    if [ -z "$CUR" ]; then
        echo "Error: min_tool_version line not found in library.yaml" >&2
        exit 1
    fi

    LOWER2=$(printf '%s\n%s\n' "$CUR" "$NEW" | sort -V | head -1)
    if [ "$LOWER2" != "$CUR" ] || [ "$CUR" = "$NEW" ]; then
        echo "Error: new ($NEW) must be strictly greater than current ($CUR)" >&2
        exit 1
    fi

    sed -i.bak -E "s/(^min_tool_version: \")[^\"]+(\")/\1$NEW\2/" "$LIBRARY"
    rm "$LIBRARY.bak"

    echo "Catalog now requires brunnr tool >= $NEW (was: $CUR)"

# Validate library.yaml integrity (every source resolves, deps reference real entries,
# frontmatter names match, no orphan files in the catalog directories)
check:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"

    if [ ! -f "$BRUNNR_HOME/library.yaml" ]; then
        echo "Error: library.yaml not found at $BRUNNR_HOME/library.yaml"
        exit 1
    fi

    cd "$BRUNNR_HOME"

    # Drift check: library.yaml must not require a tool version newer than the
    # justfile we're running. Catches "bumped min_tool_version but forgot to bump TOOL_VERSION".
    TOOL_V="{{TOOL_VERSION}}"
    MIN_V=$(awk -F'"' '/^min_tool_version:/ {print $2; exit}' library.yaml)
    if [ -n "$MIN_V" ]; then
        LOWER=$(printf '%s\n%s\n' "$TOOL_V" "$MIN_V" | sort -V | head -1)
        if [ "$LOWER" != "$MIN_V" ] && [ "$LOWER" != "$TOOL_V" ]; then
            : # impossible — sort -V always returns one of the two
        fi
        if [ "$LOWER" = "$TOOL_V" ] && [ "$TOOL_V" != "$MIN_V" ]; then
            echo "Drift: TOOL_VERSION=$TOOL_V < min_tool_version=$MIN_V" >&2
            echo "Run 'brunnr bump $MIN_V' to ship the tool version the catalog requires." >&2
            exit 1
        fi
    fi

    ruby -ryaml -rjson <<'RUBY'
      errors   = []
      warnings = []

      catalog = YAML.safe_load(
        File.read("library.yaml"),
        permitted_classes: [], permitted_symbols: [], aliases: false
      )

      sections = %w[skills agents prompts extensions themes]
      required = %w[name description source]
      skill_name_pattern = /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/
      prompt_frontmatter_fields = %w[name description argument-hint type tags dependencies origin]
      theme_color_tokens = %w[
        accent border borderAccent borderMuted success error warning muted dim text thinkingText
        selectedBg userMessageBg userMessageText customMessageBg customMessageText customMessageLabel
        toolPendingBg toolSuccessBg toolErrorBg toolTitle toolOutput
        mdHeading mdLink mdLinkUrl mdCode mdCodeBlock mdCodeBlockBorder mdQuote mdQuoteBorder mdHr mdListBullet
        toolDiffAdded toolDiffRemoved toolDiffContext
        syntaxComment syntaxKeyword syntaxFunction syntaxVariable syntaxString syntaxNumber syntaxType syntaxOperator syntaxPunctuation
        thinkingOff thinkingMinimal thinkingLow thinkingMedium thinkingHigh thinkingXhigh
        bashMode
      ]

      # Index all entry names per section for dep validation
      entries_by_section = {}
      sections.each { |s| entries_by_section[s] = (catalog[s] || []).map { |e| e["name"] }.compact }

      # Track repo-backed source paths so we can detect orphans later
      known_paths = []

      sections.each do |section|
        items = catalog[section] || []
        seen  = {}

        items.each_with_index do |item, idx|
          label = "#{section}[#{idx}] '#{item["name"] || "<unnamed>"}'"

          required.each do |f|
            errors << "#{label}: missing required field `#{f}`" if item[f].nil? || item[f].to_s.empty?
          end

          name = item["name"]
          next unless name

          if seen[name]
            errors << "#{section}: duplicate name `#{name}`"
          end
          seen[name] = true

          # Dependency targets must exist in the catalog (independent of source check)
          deps = item["dependencies"] || {}
          %w[skills agents prompts].each do |dep_section|
            (deps[dep_section] || []).each do |dep_name|
              unless entries_by_section[dep_section].include?(dep_name)
                errors << "#{label}: dependency `#{dep_section}/#{dep_name}` not found in catalog"
              end
            end
          end

          # Prompt `type` must be single or multi-agent if present
          if section == "prompts" && item["type"] && !%w[single multi-agent].include?(item["type"])
            errors << "#{label}: prompt type `#{item["type"]}` must be `single` or `multi-agent`"
          end

          src = item["source"]
          next unless src

          # External sources are catalog references today. Validate their
          # shape, then skip repo-local path/frontmatter checks.
          if src.include?("://")
            if src.start_with?("file://")
              path = src.delete_prefix("file://")
              if path.empty?
                errors << "#{label}: file:// source must include an absolute path"
              elsif !path.start_with?("/")
                errors << "#{label}: file:// source must use an absolute path: #{src}"
              elsif !File.exist?(path) && !Dir.exist?(path)
                warnings << "#{label}: file:// source does not exist on this machine: #{path}"
              end
            elsif src.start_with?("https://")
              unless src.start_with?("https://raw.githubusercontent.com/")
                errors << "#{label}: remote source must use a raw GitHub content URL (https://raw.githubusercontent.com/...): #{src}"
              end
            elsif src.start_with?("http://")
              errors << "#{label}: source uses unsupported insecure scheme `http://`; use https://raw.githubusercontent.com/... for remote references"
            else
              scheme = src.split("://", 2).first
              errors << "#{label}: source uses unsupported scheme `#{scheme}://`; supported external schemes are file:// and https://"
            end
            next
          end

          if !File.exist?(src) && !Dir.exist?(src)
            errors << "#{label}: source path not found: #{src}"
            next
          end

          # Normalize for orphan tracking: directory sources end with /
          known_paths << (Dir.exist?(src) ? src.chomp("/") + "/" : src)

          # Frontmatter checks for markdown-backed items.
          if src.end_with?(".md") && File.file?(src)
            content = File.read(src)
            if content =~ /\A---\s*\n(.*?)\n---/m
              fm = YAML.safe_load($1, permitted_classes: [], permitted_symbols: [], aliases: false) rescue {}
              fm = {} unless fm.is_a?(Hash)
              fm_name = fm["name"]

              if section == "skills"
                skill_desc = fm["description"]

                if fm_name.nil? || fm_name.to_s.empty?
                  errors << "#{label}: skill frontmatter missing required `name` (#{src})"
                elsif !fm_name.is_a?(String)
                  errors << "#{label}: skill frontmatter `name` must be a string (#{src})"
                elsif fm_name.length > 64
                  errors << "#{label}: skill frontmatter `name` exceeds 64 characters (#{src})"
                elsif !fm_name.match?(skill_name_pattern)
                  errors << "#{label}: skill frontmatter `name` must use lowercase letters, numbers, and single hyphens with no leading/trailing hyphen (#{src})"
                end

                if skill_desc.nil? || skill_desc.to_s.empty?
                  errors << "#{label}: skill frontmatter missing required `description`; Pi will not load this skill (#{src})"
                elsif !skill_desc.is_a?(String)
                  errors << "#{label}: skill frontmatter `description` must be a string (#{src})"
                elsif skill_desc.length > 1024
                  errors << "#{label}: skill frontmatter `description` exceeds 1024 characters (#{src})"
                end
              end

              if section == "prompts"
                prompt_desc = fm["description"]
                argument_hint = fm["argument-hint"]
                prompt_type = fm["type"]
                unknown_prompt_fields = fm.keys - prompt_frontmatter_fields

                if prompt_desc.nil? || prompt_desc.to_s.empty?
                  errors << "#{label}: prompt frontmatter missing `description`; Pi will fall back to body text and autocomplete will be weaker (#{src})"
                elsif !prompt_desc.is_a?(String)
                  errors << "#{label}: prompt frontmatter `description` must be a string (#{src})"
                end

                if argument_hint && !argument_hint.is_a?(String)
                  errors << "#{label}: prompt frontmatter `argument-hint` must be a string (#{src})"
                elsif argument_hint.is_a?(String) && argument_hint.include?("\n")
                  errors << "#{label}: prompt frontmatter `argument-hint` must be a single line (#{src})"
                elsif argument_hint.is_a?(String) && !(argument_hint.include?("<") || argument_hint.include?("["))
                  warnings << "#{label}: prompt `argument-hint` should show required args with <...> or optional args with [...] (#{src})"
                end

                if prompt_type && !%w[single multi-agent].include?(prompt_type)
                  errors << "#{label}: prompt frontmatter `type` must be `single` or `multi-agent` (#{src})"
                elsif prompt_type && item["type"] && prompt_type != item["type"]
                  errors << "#{label}: prompt frontmatter type `#{prompt_type}` != library.yaml type `#{item["type"]}` (#{src})"
                end

                unless unknown_prompt_fields.empty?
                  warnings << "#{label}: prompt frontmatter has unknown field(s): #{unknown_prompt_fields.join(", ")} (#{src})"
                end
              end

              if fm_name && fm_name != name
                errors << "#{label}: frontmatter name `#{fm_name}` != library.yaml name `#{name}` (#{src})"
              elsif fm_name.nil? && section != "skills"
                warnings << "#{label}: source has no `name:` frontmatter field (#{src})"
              end
            elsif section == "skills"
              errors << "#{label}: skill source has no YAML frontmatter; Pi requires `name` and `description` (#{src})"
            elsif section == "prompts"
              errors << "#{label}: prompt source has no YAML frontmatter; brunnr requires prompt metadata and Pi autocomplete benefits from `description` (#{src})"
            else
              warnings << "#{label}: source has no YAML frontmatter (#{src})"
            end
          end

          if section == "themes"
            unless src.end_with?(".json") && File.file?(src)
              errors << "#{label}: theme source must be a .json file (#{src})"
              next
            end

            begin
              theme = JSON.parse(File.read(src))
            rescue JSON::ParserError => e
              errors << "#{label}: invalid theme JSON (#{src}): #{e.message}"
              next
            end

            unless theme.is_a?(Hash)
              errors << "#{label}: theme root must be a JSON object (#{src})"
              next
            end

            if theme["name"] != name
              errors << "#{label}: theme name `#{theme["name"] || "<missing>"}` != library.yaml name `#{name}` (#{src})"
            end

            colors = theme["colors"]
            unless colors.is_a?(Hash)
              errors << "#{label}: theme must define a `colors` object (#{src})"
              next
            end

            missing_tokens = theme_color_tokens.reject { |token| colors.key?(token) }
            extra_tokens = colors.keys - theme_color_tokens

            unless missing_tokens.empty?
              errors << "#{label}: theme missing required color token(s): #{missing_tokens.join(", ")} (#{src})"
            end

            unless extra_tokens.empty?
              warnings << "#{label}: theme has unknown color token(s) ignored by Pi: #{extra_tokens.join(", ")} (#{src})"
            end

            vars = theme["vars"]
            var_names = vars.is_a?(Hash) ? vars.keys : []
            colors.each do |token, value|
              valid_value =
                value == "" ||
                (value.is_a?(Integer) && value.between?(0, 255)) ||
                (value.is_a?(String) && value.match?(/\A#[0-9a-fA-F]{6}\z/)) ||
                (value.is_a?(String) && var_names.include?(value))

              unless valid_value
                errors << "#{label}: theme color `#{token}` has invalid value `#{value.inspect}`; expected empty string, #rrggbb, 0-255, or a vars reference (#{src})"
              end
            end
          end
        end
      end

      # Orphan check — files on disk not referenced by library.yaml.
      # Built-in capabilities (eitri, brokkr, hird) live under extensions/ but are
      # intentionally not catalog items, so they're whitelisted here.
      bundled_paths = ["extensions/eitri/", "extensions/brokkr/", "extensions/hird/"]

      on_disk = {
        "skills"     => Dir.glob("skills/*/SKILL.md"),
        "agents"     => Dir.glob("agents/*.md"),
        "prompts"    => Dir.glob("prompts/*.md"),
        "extensions" => Dir.glob("extensions/*.ts") + Dir.glob("extensions/*/").map { |d| d },
        "themes"     => Dir.glob("themes/*.json"),
      }

      on_disk.each do |section, paths|
        paths.each do |p|
          p_norm = File.directory?(p) ? p.chomp("/") + "/" : p
          next if bundled_paths.include?(p_norm)
          unless known_paths.include?(p_norm)
            warnings << "orphan: `#{p_norm}` exists on disk but is not registered in library.yaml under `#{section}`"
          end
        end
      end

      # Compatibility drift checks against current Pi docs. These stay warnings
      # because older Pi releases may still accept legacy URLs/import namespaces.
      text_files = Dir.glob("{README.md,SKILL.md,library.yaml,install.sh,justfile,agents/**/*.md,prompts/**/*.md,extensions/**/*.{md,ts},scripts/**/*,lore/**/*.md}")
        .select { |p| File.file?(p) }

      stale_pi_repo = "badlogic/" + "pi-mono"
      legacy_pi_namespace = "@mariozechner" + "/"

      text_files.each do |path|
        File.readlines(path, chomp: true).each_with_index do |line, i|
          if line.include?(stale_pi_repo)
            warnings << "#{path}:#{i + 1}: stale Pi docs/repo reference `#{stale_pi_repo}`; prefer `earendil-works/pi`"
          end

          if line.include?(legacy_pi_namespace)
            warnings << "#{path}:#{i + 1}: legacy Pi import namespace `#{legacy_pi_namespace}*`; verify against installed Pi docs, which now document `@earendil-works/*` peer dependencies"
          end
        end
      end

      # Summary
      puts "library.yaml: parsed OK"
      sections.each do |s|
        puts "  #{s.ljust(11)} #{(catalog[s] || []).length}"
      end
      puts ""

      unless warnings.empty?
        puts "WARNINGS (#{warnings.length}):"
        warnings.each { |w| puts "  - #{w}" }
        puts ""
      end

      if errors.empty?
        puts warnings.empty? ? "All checks passed." : "All hard checks passed (warnings above)."
        exit 0
      else
        puts "ERRORS (#{errors.length}):"
        errors.each { |e| puts "  - #{e}" }
        exit 1
      end
    RUBY

    # Examples registry: structural validation only (no network). Run
    # `brunnr examples-check` separately for link-rot detection.
    EXAMPLES_DATA="extensions/eitri/agents/eitri/examples-data.yaml"
    if [ -f "$EXAMPLES_DATA" ]; then
        ruby -ryaml -e '
            f = ARGV[0]
            data = YAML.safe_load(File.read(f), permitted_classes: [], permitted_symbols: [], aliases: false) || {}
            entries = data["examples"] || []
            required = %w[name repo url category description]
            errors = []
            seen = {}
            entries.each_with_index do |e, i|
                label = "examples[#{i}] '\''#{e["name"] || "<unnamed>"}'\''"
                required.each { |k| errors << "#{label}: missing `#{k}`" if e[k].nil? || e[k].to_s.empty? }
                if e["name"] && seen[e["name"]]
                    errors << "examples: duplicate name `#{e["name"]}`"
                end
                seen[e["name"]] = true if e["name"]
            end
            if errors.any?
                puts ""
                puts "EXAMPLES REGISTRY ERRORS (#{errors.length}):"
                errors.each { |e| puts "  - #{e}" }
                exit 1
            else
                puts ""
                puts "examples registry: #{entries.length} entries OK"
            end
        ' "$EXAMPLES_DATA"
    fi

# Add a Pi reference repo to the examples-expert registry. Validates the URL
# via `gh api`, captures repo description, refuses duplicates.
# Usage: brunnr examples-add <github-url> [category]
examples-add *args:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    DATA="$BRUNNR_HOME/extensions/eitri/agents/eitri/examples-data.yaml"

    POSITIONAL=()
    for arg in {{args}}; do POSITIONAL+=("$arg"); done
    if [ "${#POSITIONAL[@]}" -lt 1 ] || [ "${#POSITIONAL[@]}" -gt 2 ]; then
        echo "Usage: brunnr examples-add <github-url> [category]"
        echo "  <github-url>  https://github.com/<owner>/<repo>[/tree/<branch>/<path>]"
        echo "  [category]    extension | skill | agent | prompt | theme | mixed (default: mixed)"
        exit 1
    fi
    URL="${POSITIONAL[0]}"
    CATEGORY="${POSITIONAL[1]:-mixed}"

    command -v gh >/dev/null 2>&1 || { echo "Error: 'gh' CLI not found. brew install gh"; exit 1; }
    gh auth status >/dev/null 2>&1 || { echo "Error: 'gh' not authenticated — run 'gh auth login'"; exit 1; }

    # Parse owner/repo/path via Ruby URI — more reliable than bash regex on edge cases.
    PARSED=$(ruby -ruri -e '
        u = URI.parse(ARGV[0])
        if u.host != "github.com"
            STDERR.puts "Error: not a github.com URL: #{ARGV[0]}"; exit 1
        end
        parts = u.path.sub(%r{\A/}, "").chomp("/").split("/")
        if parts.length < 2
            STDERR.puts "Error: URL must include /<owner>/<repo>"; exit 1
        end
        owner = parts[0]
        repo  = parts[1].sub(/\.git\z/, "")
        path  = ""
        if parts.length > 2 && parts[2] == "tree" && parts.length > 4
            path = parts[4..].join("/")
        end
        puts "#{owner}\t#{repo}\t#{path}"
    ' "$URL")
    IFS=$'\t' read -r OWNER REPO SUBPATH <<<"$PARSED"

    # Validate the repo is reachable
    META=$(gh api "repos/$OWNER/$REPO" 2>&1) || {
        echo "Error: gh api repos/$OWNER/$REPO failed:"
        printf '%s\n' "$META" | sed 's/^/  /'
        exit 1
    }
    DESC=$(printf '%s' "$META" | ruby -rjson -e 'puts (JSON.parse(STDIN.read)["description"] || "").strip')
    ARCH=$(printf '%s' "$META" | ruby -rjson -e 'puts JSON.parse(STDIN.read)["archived"]')
    if [ "$ARCH" = "true" ]; then
        echo "Warning: $OWNER/$REPO is archived."
        if [ -t 0 ]; then
            read -r -p "Add anyway? [y/N] " ans
            [[ "$ans" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
        else
            echo "Refusing to add archived repo in non-interactive mode."
            exit 1
        fi
    fi

    # Slug = owner-repo, lowercased + sanitized
    SLUG=$(printf '%s-%s' "$OWNER" "$REPO" | tr '[:upper:]' '[:lower:]' \
        | tr -c 'a-z0-9-' '-' | sed 's/-\+/-/g;s/^-//;s/-$//')
    TODAY=$(date +%Y-%m-%d)

    ruby -ryaml -e '
        data_path = ARGV[0]
        entry = {
            "name"           => ARGV[1],
            "repo"           => "#{ARGV[2]}/#{ARGV[3]}",
            "url"            => ARGV[4],
            "category"       => ARGV[5],
            "description"    => ARGV[6],
            "added"          => ARGV[7],
            "last_validated" => ARGV[7],
        }
        entry["path"] = ARGV[8] unless ARGV[8].empty?

        data = if File.exist?(data_path)
            YAML.safe_load(File.read(data_path), permitted_classes: [], permitted_symbols: [], aliases: false) || {}
        else
            {}
        end
        data["examples"] ||= []
        if data["examples"].any? { |e| e["name"] == entry["name"] || e["url"] == entry["url"] || e["repo"] == entry["repo"] }
            STDERR.puts "Error: example already in registry (slug=#{entry["name"]}, repo=#{entry["repo"]})"
            exit 1
        end
        data["examples"] << entry

        # Preserve the header comment block if present
        existing = File.exist?(data_path) ? File.read(data_path) : ""
        header = ""
        if existing =~ /\A(---\s*\n(?:#[^\n]*\n)+\n?)/
            header = $1
        end
        body = data.to_yaml(line_width: 120).sub(/\A---\s*\n/, "")
        File.write(data_path, header.empty? ? "---\n" + body : header + body)
    ' "$DATA" "$SLUG" "$OWNER" "$REPO" "$URL" "$CATEGORY" "$DESC" "$TODAY" "$SUBPATH"

    echo "Added: $SLUG"
    echo "  repo:        $OWNER/$REPO"
    echo "  url:         $URL"
    echo "  category:    $CATEGORY"
    echo "  description: $DESC"

# Surface candidate Pi example repos via GitHub code search. Prints repos that
# match common Pi patterns and are NOT already in the registry. You decide
# which to keep — use `brunnr examples-add <url>` per candidate.
examples-discover:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    DATA="$BRUNNR_HOME/extensions/eitri/agents/eitri/examples-data.yaml"

    command -v gh >/dev/null 2>&1 || { echo "Error: 'gh' CLI not found"; exit 1; }
    gh auth status >/dev/null 2>&1 || { echo "Error: 'gh' not authenticated — run 'gh auth login'"; exit 1; }

    # Known repos in the registry — skip these in discovery output
    KNOWN_TMP=$(mktemp)
    if [ -f "$DATA" ]; then
        ruby -ryaml -e '
            data = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], permitted_symbols: [], aliases: false) || {}
            (data["examples"] || []).each { |e| puts e["repo"] if e["repo"] }
        ' "$DATA" > "$KNOWN_TMP"
    fi

    declare -A SEEN
    while IFS= read -r r; do [ -n "$r" ] && SEEN["$r"]=1; done < "$KNOWN_TMP"
    rm -f "$KNOWN_TMP"

    QUERIES=(
        "pi.registerCommand path:.pi extension:ts|Pi extensions (registerCommand)"
        "pi.registerTool path:.pi extension:ts|Pi extensions (registerTool)"
        "path:.pi/skills/SKILL.md|Pi skills (SKILL.md)"
        "path:.pi/agents extension:md|Pi agents (.pi/agents)"
        "pi-package filename:package.json|Pi packages (package.json keyword)"
    )

    echo "Scanning GitHub for Pi-related repos not in the registry..."
    echo ""
    FOUND_ANY=0
    for entry in "${QUERIES[@]}"; do
        Q="${entry%%|*}"
        LABEL="${entry##*|}"
        # Branch on search endpoint: topic:* uses search/repositories, the rest use search/code
        if [[ "$Q" == topic:* ]]; then
            RESULT=$(gh api -X GET search/repositories -f q="$Q" \
                --jq '.items[] | "\(.full_name)\t\(.stargazers_count)\t\(.description // "")\t\(.archived)"' 2>/dev/null || true)
        else
            RESULT=$(gh api -X GET search/code -f q="$Q" \
                --jq '.items[] | "\(.repository.full_name)\t\(.path)"' 2>/dev/null || true)
        fi
        [ -z "$RESULT" ] && continue

        PRINTED_HEADER=0
        while IFS=$'\t' read -r f1 f2 f3 f4; do
            [ -z "$f1" ] && continue
            REPO="$f1"
            [ -n "${SEEN[$REPO]:-}" ] && continue
            SEEN["$REPO"]=1

            # If from search/code, fetch repo meta to get stars / archived / description
            if [[ "$Q" != topic:* ]]; then
                META=$(gh api "repos/$REPO" 2>/dev/null) || continue
                STARS=$(printf '%s' "$META" | ruby -rjson -e 'puts JSON.parse(STDIN.read)["stargazers_count"]' 2>/dev/null || echo "?")
                DESC=$(printf '%s' "$META" | ruby -rjson -e 'puts (JSON.parse(STDIN.read)["description"] || "").strip[0,100]' 2>/dev/null || echo "")
                ARCH=$(printf '%s' "$META" | ruby -rjson -e 'puts JSON.parse(STDIN.read)["archived"]' 2>/dev/null || echo "")
                EXAMPLE_PATH="$f2"
            else
                STARS="$f2"
                DESC="$f3"
                ARCH="$f4"
                EXAMPLE_PATH=""
            fi
            [ "$ARCH" = "true" ] && continue

            if [ "$PRINTED_HEADER" = "0" ]; then
                echo "  --- $LABEL ---"
                PRINTED_HEADER=1
            fi
            echo "  https://github.com/$REPO"
            echo "      ${STARS}★ — ${DESC:-(no description)}"
            [ -n "$EXAMPLE_PATH" ] && echo "      e.g. $EXAMPLE_PATH"
            echo ""
            FOUND_ANY=1
        done <<<"$RESULT"
    done

    if [ "$FOUND_ANY" = "0" ]; then
        echo "No new candidates found (registry covers all current results, or you're rate-limited)."
    else
        echo "To add: brunnr examples-add <url> [category]"
    fi

# Validate the examples registry — `gh api` ping each entry. Flags 404, archived,
# stale (>6 months since last commit). Updates `last_validated` on success.
examples-check:
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    DATA="$BRUNNR_HOME/extensions/eitri/agents/eitri/examples-data.yaml"

    if [ ! -f "$DATA" ]; then
        echo "examples registry not found: $DATA"
        exit 0
    fi
    command -v gh >/dev/null 2>&1 || { echo "Error: 'gh' CLI not found"; exit 1; }
    gh auth status >/dev/null 2>&1 || { echo "Error: 'gh' not authenticated — run 'gh auth login'"; exit 1; }

    [ -t 1 ] && C=$'\033[1;36m' G=$'\033[1;32m' Y=$'\033[1;33m' R=$'\033[1;31m' X=$'\033[0m' || C= G= Y= R= X=

    TODAY=$(date +%Y-%m-%d)
    # Stale cutoff: 6 months ago in YYYY-MM-DD. macOS and Linux date diverge; do it in Ruby.
    CUTOFF=$(ruby -rdate -e 'puts (Date.today << 6).to_s')

    # Per-entry validation; emit a status line for each.
    OUT=$(ruby -ryaml -rjson -e '
        require "yaml"
        require "json"
        data_path = ARGV[0]
        today = ARGV[1]
        cutoff = ARGV[2]
        data = YAML.safe_load(File.read(data_path), permitted_classes: [], permitted_symbols: [], aliases: false) || {}
        entries = data["examples"] || []

        results = []
        entries.each do |e|
            name = e["name"]
            repo = e["repo"]
            status = { ok: false, msg: "", warn: nil }
            if !repo
                status[:msg] = "no repo field"
                results << [name, status]
                next
            end
            meta_json = `gh api repos/#{repo} 2>/dev/null`
            if !$?.success? || meta_json.strip.empty?
                status[:msg] = "unreachable (gh api repos/#{repo} failed)"
                results << [name, status]
                next
            end
            begin
                meta = JSON.parse(meta_json)
            rescue
                status[:msg] = "invalid JSON from gh api"
                results << [name, status]
                next
            end
            if meta["archived"]
                status[:msg] = "archived"
                results << [name, status]
                next
            end
            pushed = meta["pushed_at"]
            if pushed && pushed[0,10] < cutoff
                status[:warn] = "stale — last push #{pushed[0,10]}"
            end
            status[:ok] = true
            status[:msg] = "ok"
            results << [name, status]
            e["last_validated"] = today
        end

        # Preserve header comments on rewrite
        existing = File.read(data_path)
        header = ""
        if existing =~ /\A(---\s*\n(?:#[^\n]*\n)+\n?)/
            header = $1
        end
        body = data.to_yaml(line_width: 120).sub(/\A---\s*\n/, "")
        File.write(data_path, header.empty? ? "---\n" + body : header + body)

        results.each do |name, s|
            STDOUT.puts "#{s[:ok] ? "OK" : "FAIL"}\t#{name}\t#{s[:msg]}\t#{s[:warn] || ""}"
        end
    ' "$DATA" "$TODAY" "$CUTOFF")

    OK_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
    while IFS=$'\t' read -r status name msg warn; do
        [ -z "$status" ] && continue
        if [ "$status" = "OK" ]; then
            OK_COUNT=$((OK_COUNT+1))
            if [ -n "$warn" ]; then
                printf "%s  ⚠%s %s — %s\n" "$Y" "$X" "$name" "$warn"
                WARN_COUNT=$((WARN_COUNT+1))
            else
                printf "%s  ✓%s %s\n" "$G" "$X" "$name"
            fi
        else
            printf "%s  ✗%s %s — %s\n" "$R" "$X" "$name" "$msg"
            FAIL_COUNT=$((FAIL_COUNT+1))
        fi
    done <<<"$OUT"

    echo ""
    echo "$OK_COUNT ok, $WARN_COUNT stale, $FAIL_COUNT failed"
    [ "$FAIL_COUNT" = "0" ] || exit 1
