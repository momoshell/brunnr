# justfile — brunnr terminal shortcuts (Pi runtime)
#
# Usage: just -f ~/.config/brunnr/justfile <command>
# Or: alias brunnr='just -f ~/.config/brunnr/justfile'

# Tool version — bump when changing justfile / install.sh in a way that catalog
# entries may depend on. `brunnr sync` compares this against library.yaml's
# `min_tool_version` and refuses if the local tool is older.
export TOOL_VERSION := "3.0.6"

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
    echo "brunnr is ready. Run 'brunnr eitri' to forge new components, or 'brunnr add <section> <name>' for catalog items."

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
        echo "  Install Pi: https://github.com/badlogic/pi-mono"
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
        echo "Error: 'pi' not found on PATH. Install Pi: https://github.com/badlogic/pi-mono"
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
        # Directory-style extensions install to multiple targets — check for the
        # canonical .ts file at the extensions target as the conflict marker.
        if [ -e "$EXTENSIONS_TARGET/$NAME.ts" ]; then
            echo "Error: extension '$NAME' already installed ($SCOPE_LABEL: $EXTENSIONS_TARGET/$NAME.ts)"
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
        mkdir -p "$EXTENSIONS_TARGET" "$AGENTS_TARGET" "$THEMES_TARGET"
        shopt -s nullglob
        for ts in "$RESOLVED_SRC"/*.ts; do
            [ -f "$ts" ] && cp "$ts" "$EXTENSIONS_TARGET/"
        done
        if [ -d "$RESOLVED_SRC/agents" ]; then
            cp -r "$RESOLVED_SRC/agents/." "$AGENTS_TARGET/"
        fi
        if [ -d "$RESOLVED_SRC/themes" ]; then
            cp -r "$RESOLVED_SRC/themes/." "$THEMES_TARGET/"
        fi
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
        # Directory-style extension: remove the .ts file plus the matching
        # agents/<name>/ and themes/<name>/ subdirs that were created on install.
        REMOVED_ANY=0
        if [ -e "$EXTENSIONS_TARGET/$NAME.ts" ]; then
            rm "$EXTENSIONS_TARGET/$NAME.ts"
            echo "Removed $EXTENSIONS_TARGET/$NAME.ts"
            REMOVED_ANY=1
        fi
        if [ -d "$AGENTS_TARGET/$NAME" ]; then
            rm -r "$AGENTS_TARGET/$NAME"
            echo "Removed $AGENTS_TARGET/$NAME/"
            REMOVED_ANY=1
        fi
        if [ -d "$THEMES_TARGET/$NAME" ]; then
            rm -r "$THEMES_TARGET/$NAME"
            echo "Removed $THEMES_TARGET/$NAME/"
            REMOVED_ANY=1
        fi
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
    # README.md, SKILL.md, CLAUDE.md) are updated via `brunnr upgrade`.
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
    TOOL_PATHS=(justfile install.sh README.md SKILL.md CLAUDE.md lore)

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

    ruby -ryaml <<'RUBY'
      errors   = []
      warnings = []

      catalog = YAML.safe_load(
        File.read("library.yaml"),
        permitted_classes: [], permitted_symbols: [], aliases: false
      )

      sections = %w[skills agents prompts extensions themes]
      required = %w[name description source]

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

          # External sources skip path/frontmatter checks
          if src.start_with?("file://") || src.start_with?("https://")
            next
          end

          if !File.exist?(src) && !Dir.exist?(src)
            errors << "#{label}: source path not found: #{src}"
            next
          end

          # Normalize for orphan tracking: directory sources end with /
          known_paths << (Dir.exist?(src) ? src.chomp("/") + "/" : src)

          # Frontmatter `name:` must match library.yaml name (for .md files only)
          if src.end_with?(".md") && File.file?(src)
            content = File.read(src)
            if content =~ /\A---\s*\n(.*?)\n---/m
              fm = YAML.safe_load($1, permitted_classes: [], permitted_symbols: [], aliases: false) rescue {}
              fm_name = fm.is_a?(Hash) ? fm["name"] : nil
              if fm_name && fm_name != name
                errors << "#{label}: frontmatter name `#{fm_name}` != library.yaml name `#{name}` (#{src})"
              elsif fm_name.nil?
                warnings << "#{label}: source has no `name:` frontmatter field (#{src})"
              end
            else
              warnings << "#{label}: source has no YAML frontmatter (#{src})"
            end
          end
        end
      end

      # Orphan check — files on disk not referenced by library.yaml.
      # Built-in capabilities (eitri) live under extensions/ but are intentionally
      # not catalog items, so they're whitelisted here.
      bundled_paths = ["extensions/eitri/", "extensions/brokkr/"]

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
