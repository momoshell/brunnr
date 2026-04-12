# justfile — brunnr terminal shortcuts
#
# Usage: just -f ~/.config/brunnr/justfile <command>
# Or: alias brunnr='just -f ~/.config/brunnr/justfile'

# Default path to brunnr repository
export BRUNNR_HOME := env_var_or_default("BRUNNR_HOME", "~/.config/brunnr")

# Target directories in the current project
export SKILLS_DIR := env_var_or_default("BRUNNR_SKILLS_DIR", ".claude/skills")
export AGENTS_DIR := env_var_or_default("BRUNNR_AGENTS_DIR", ".claude/agents")
export PROMPTS_DIR := env_var_or_default("BRUNNR_PROMPTS_DIR", ".claude/commands")

# Source directories in brunnr
SKILLS_SRC := BRUNNR_HOME / "skills"
AGENTS_SRC := BRUNNR_HOME / "agents"
PROMPTS_SRC := BRUNNR_HOME / "prompts"

# Default recipe — show help
@default:
    echo "brunnr — Private catalog for skills, agents, and prompts"
    echo ""
    echo "Usage: just -f {{BRUNNR_HOME}}/justfile <command>"
    echo ""
    echo "Commands:"
    echo "  install              Initialize brunnr in current project"
    echo "  add <section> <name> Add item to current project (section: skill, agent, prompt)"
    echo "  remove <section> <name> Remove item from current project"
    echo "  push <section> <name> Push local changes back to brunnr"
    echo "  list [section]       List available/installed items"
    echo "  sync                 Sync brunnr repository with remote"
    echo "  search <query>       Search the catalog"
    echo "  help                 Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  BRUNNR_HOME          Path to brunnr repository (default: ~/.config/brunnr)"
    echo "  BRUNNR_SKILLS_DIR    Target directory for skills (default: .claude/skills)"
    echo "  BRUNNR_AGENTS_DIR    Target directory for agents (default: .claude/agents)"
    echo "  BRUNNR_PROMPTS_DIR   Target directory for prompts (default: .claude/commands)"

# Show help
@help: default

# Install brunnr into the current project
@install:
    echo "Installing brunnr into current project..."
    mkdir -p {{SKILLS_DIR}} {{AGENTS_DIR}} {{PROMPTS_DIR}}
    echo "Created target directories:"
    echo "  - {{SKILLS_DIR}}"
    echo "  - {{AGENTS_DIR}}"
    echo "  - {{PROMPTS_DIR}}"
    echo ""
    echo "brunnr is ready. Use 'just -f {{BRUNNR_HOME}}/justfile add <section> <name>' to install items."

# Add an item from brunnr to the current project
add section name:
    #!/usr/bin/env bash
    set -euo pipefail
    SECTION="{{section}}"
    NAME="{{name}}"
    
    # Map section to source and target directories
    case "$SECTION" in
        skill)
            SRC="{{SKILLS_SRC}}"
            DST="{{SKILLS_DIR}}"
            ;;
        agent)
            SRC="{{AGENTS_SRC}}"
            DST="{{AGENTS_DIR}}"
            ;;
        prompt)
            SRC="{{PROMPTS_SRC}}"
            DST="{{PROMPTS_DIR}}"
            ;;
        *)
            echo "Error: Unknown section '$SECTION'"
            echo "Valid sections: skill, agent, prompt"
            exit 1
            ;;
    esac
    
    # Check if source exists
    if [ ! -e "$SRC/$NAME" ] && [ ! -e "$SRC/$NAME.md" ]; then
        echo "Error: $SECTION '$NAME' not found in brunnr"
        exit 1
    fi
    
    # Check if target already exists
    if [ -e "$DST/$NAME" ] || [ -e "$DST/$NAME.md" ]; then
        echo "Error: $SECTION '$NAME' already installed"
        echo "Use 'push' to update brunnr with local changes, or remove first."
        exit 1
    fi
    
    # Copy files
    echo "Adding $SECTION '$NAME'..."
    if [ -d "$SRC/$NAME" ]; then
        cp -r "$SRC/$NAME" "$DST/"
    else
        cp "$SRC/$NAME.md" "$DST/"
    fi
    
    echo "Installed $SECTION '$NAME' to $DST/"
    echo "Dependencies (if any) should be listed in library.yaml"

# Remove an item from the current project
remove section name:
    #!/usr/bin/env bash
    set -euo pipefail
    SECTION="{{section}}"
    NAME="{{name}}"
    
    # Map section to target directory
    case "$SECTION" in
        skill)
            DST="{{SKILLS_DIR}}"
            ;;
        agent)
            DST="{{AGENTS_DIR}}"
            ;;
        prompt)
            DST="{{PROMPTS_DIR}}"
            ;;
        *)
            echo "Error: Unknown section '$SECTION'"
            echo "Valid sections: skill, agent, prompt"
            exit 1
            ;;
    esac
    
    # Check if target exists
    if [ ! -e "$DST/$NAME" ] && [ ! -e "$DST/$NAME.md" ]; then
        echo "Error: $SECTION '$NAME' is not installed"
        exit 1
    fi
    
    # Remove files (safely)
    echo "Removing $SECTION '$NAME'..."
    if [ -d "$DST/$NAME" ]; then
        rm -r "$DST/$NAME"
    else
        rm "$DST/$NAME.md"
    fi
    
    echo "Removed $SECTION '$NAME' from $DST/"
    echo "Note: Dependencies are not automatically removed."

# Push local changes back to brunnr
push section name:
    #!/usr/bin/env bash
    set -euo pipefail
    SECTION="{{section}}"
    NAME="{{name}}"
    
    # Map section to source and target directories
    case "$SECTION" in
        skill)
            SRC="{{SKILLS_SRC}}"
            DST="{{SKILLS_DIR}}"
            ;;
        agent)
            SRC="{{AGENTS_SRC}}"
            DST="{{AGENTS_DIR}}"
            ;;
        prompt)
            SRC="{{PROMPTS_SRC}}"
            DST="{{PROMPTS_DIR}}"
            ;;
        *)
            echo "Error: Unknown section '$SECTION'"
            echo "Valid sections: skill, agent, prompt"
            exit 1
            ;;
    esac
    
    # Check if local version exists
    if [ ! -e "$DST/$NAME" ] && [ ! -e "$DST/$NAME.md" ]; then
        echo "Error: $SECTION '$NAME' not found in current project"
        exit 1
    fi
    
    # Check if brunnr version exists and differs
    if [ -e "$SRC/$NAME" ] || [ -e "$SRC/$NAME.md" ]; then
        echo "Warning: $SECTION '$NAME' already exists in brunnr"
        echo "Review differences manually before overwriting."
        echo "Source: $SRC/$NAME"
        echo "Target: $DST/$NAME"
        exit 1
    fi
    
    # Copy files to brunnr
    echo "Pushing $SECTION '$NAME' to brunnr..."
    if [ -d "$DST/$NAME" ]; then
        cp -r "$DST/$NAME" "$SRC/"
    else
        cp "$DST/$NAME.md" "$SRC/"
    fi
    
    echo "Pushed $SECTION '$NAME' to $SRC/"
    echo "Remember to update library.yaml and commit your changes."

# List available or installed items
list section="":
    #!/usr/bin/env bash
    SECTION="{{section}}"
    
    if [ -z "$SECTION" ]; then
        echo "brunnr catalog sections:"
        echo ""
        echo "skills:"
        ls -1 {{SKILLS_SRC}} 2>/dev/null || echo "  (empty)"
        echo ""
        echo "agents:"
        ls -1 {{AGENTS_SRC}} 2>/dev/null | sed 's/\.md$//' || echo "  (empty)"
        echo ""
        echo "prompts:"
        ls -1 {{PROMPTS_SRC}} 2>/dev/null | sed 's/\.md$//' || echo "  (empty)"
    else
        case "$SECTION" in
            skill)
                echo "Available skills:"
                ls -1 {{SKILLS_SRC}} 2>/dev/null || echo "  (none)"
                echo ""
                echo "Installed skills:"
                ls -1 {{SKILLS_DIR}} 2>/dev/null || echo "  (none)"
                ;;
            agent)
                echo "Available agents:"
                ls -1 {{AGENTS_SRC}} 2>/dev/null | sed 's/\.md$//' || echo "  (none)"
                echo ""
                echo "Installed agents:"
                ls -1 {{AGENTS_DIR}} 2>/dev/null | sed 's/\.md$//' || echo "  (none)"
                ;;
            prompt)
                echo "Available prompts:"
                ls -1 {{PROMPTS_SRC}} 2>/dev/null | sed 's/\.md$//' || echo "  (none)"
                echo ""
                echo "Installed prompts:"
                ls -1 {{PROMPTS_DIR}} 2>/dev/null | sed 's/\.md$//' || echo "  (none)"
                ;;
            *)
                echo "Error: Unknown section '$SECTION'"
                echo "Valid sections: skill, agent, prompt"
                exit 1
                ;;
        esac
    fi

# Sync brunnr repository with remote
@sync:
    cd {{BRUNNR_HOME}} && git pull
    echo "brunnr repository synced"

# Search the catalog
search query:
    #!/usr/bin/env bash
    echo "Searching brunnr catalog for '{{query}}'..."
    echo ""
    
    # Search in library.yaml
    if [ -f "{{BRUNNR_HOME}}/library.yaml" ]; then
        grep -i "{{query}}" {{BRUNNR_HOME}}/library.yaml || echo "No matches in library.yaml"
    fi
    
    # Search in skill/agent/prompt files
    find {{SKILLS_SRC}} {{AGENTS_SRC}} {{PROMPTS_SRC}} -type f -name "*.md" -exec grep -l -i "{{query}}" {} \; 2>/dev/null | head -20
