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
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    LIBRARY="$BRUNNR_HOME/library.yaml"
    
    # Map section to target directory and YAML key
    case "$SECTION" in
        skill)
            DST="{{SKILLS_DIR}}"
            YAML_KEY="skills"
            ;;
        agent)
            DST="{{AGENTS_DIR}}"
            YAML_KEY="agents"
            ;;
        prompt)
            DST="{{PROMPTS_DIR}}"
            YAML_KEY="prompts"
            ;;
        *)
            echo "Error: Unknown section '$SECTION'"
            echo "Valid sections: skill, agent, prompt"
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
    if [ -e "$DST/$NAME" ] || [ -e "$DST/$NAME.md" ]; then
        echo "Error: $SECTION '$NAME' already installed"
        echo "Use 'push' to update brunnr with local changes, or remove first."
        exit 1
    fi
    
    # Copy files
    echo "Adding $SECTION '$NAME'..."
    
    # Ensure destination directory exists
    mkdir -p "$DST"
    
    if [ -d "$RESOLVED_SRC" ]; then
        # For directories (skills), copy the entire directory to target
        cp -r "$RESOLVED_SRC" "$DST/"
    else
        # For files (agents, prompts), copy the file
        cp "$RESOLVED_SRC" "$DST/"
    fi
    
    echo "Installed $SECTION '$NAME' to $DST/"
    echo "Dependencies (if any) are documented in library.yaml - install manually if needed."

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
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    LIBRARY="$BRUNNR_HOME/library.yaml"
    
    # Map section to source and target directories
    case "$SECTION" in
        skill)
            SRC="{{SKILLS_SRC}}"
            DST="{{SKILLS_DIR}}"
            YAML_KEY="skills"
            ;;
        agent)
            SRC="{{AGENTS_SRC}}"
            DST="{{AGENTS_DIR}}"
            YAML_KEY="agents"
            ;;
        prompt)
            SRC="{{PROMPTS_SRC}}"
            DST="{{PROMPTS_DIR}}"
            YAML_KEY="prompts"
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
        echo "This item may not be in the catalog yet."
        echo "After pushing, you must add an entry to library.yaml."
        echo ""
        echo "Proceeding with push to create new entry in brunnr..."
    }
    
    # Extract source from entry if it exists (safe YAML parsing)
    if [ -n "$ENTRY" ]; then
        SOURCE=$(echo "$ENTRY" | ruby -ryaml -e "require 'yaml'; puts YAML.safe_load(STDIN.read, permitted_classes: [], permitted_symbols: [], aliases: false)['source']")
        
        # Check source type and fail for non-repo-backed sources
        if [[ "$SOURCE" == file://* ]]; then
            echo "Error: Source is a local reference — cannot push to file:// path"
            echo "Source: $SOURCE"
            echo "Run /fork-skill {{name}} first to copy it into brunnr, then push."
            exit 1
        fi

        if [[ "$SOURCE" == https://* ]]; then
            echo "Error: Source is a remote reference — cannot push to external repo"
            echo "Source: $SOURCE"
            echo "Run /fork-skill {{name}} first to copy it into brunnr, then push."
            exit 1
        fi
        
        # For repo-backed sources, check if item exists in brunnr
        if [ -e "$SRC/$NAME" ] || [ -e "$SRC/$NAME.md" ]; then
            echo "Warning: $SECTION '$NAME' already exists in brunnr"
            echo "Review differences manually before overwriting."
            echo "Source: $SRC/$NAME"
            echo "Target: $DST/$NAME"
            exit 1
        fi
    else
        # No entry in library.yaml - check if item exists in brunnr anyway
        if [ -e "$SRC/$NAME" ] || [ -e "$SRC/$NAME.md" ]; then
            echo "Warning: $SECTION '$NAME' already exists in brunnr"
            echo "Review differences manually before overwriting."
            echo "Source: $SRC/$NAME"
            echo "Target: $DST/$NAME"
            exit 1
        fi
    fi
    
    # Copy files to brunnr
    echo "Pushing $SECTION '$NAME' to brunnr..."
    if [ -d "$DST/$NAME" ]; then
        cp -r "$DST/$NAME" "$SRC/"
    else
        cp "$DST/$NAME.md" "$SRC/"
    fi
    
    echo "Pushed $SECTION '$NAME' to $SRC/"
    echo ""
    echo "IMPORTANT: If this is a new item, you must update library.yaml"
    echo "with an entry for '$NAME' and commit your changes."

# List available or installed items
list section="":
    #!/usr/bin/env bash
    SECTION="{{section}}"
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    LIBRARY="$BRUNNR_HOME/library.yaml"
    
    # Function to list installed items in a directory
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
    
    # Function to format catalog entries as "name - description"
    format_catalog() {
        local items="$1"
        if [ -z "$items" ]; then
            echo "  (none)"
        else
            echo "$items"
        fi
    }
    
    if [ -z "$SECTION" ]; then
        echo "brunnr catalog sections:"
        echo ""
        
        # Read from library.yaml
        if [ -f "$LIBRARY" ]; then
            echo "skills:"
            ruby -ryaml -e "
                require 'yaml'
                catalog = YAML.safe_load(File.read('$LIBRARY'), permitted_classes: [], permitted_symbols: [], aliases: false)
                items = catalog['skills'] || []
                items.each { |i| puts \"  #{i['name']} - #{i['description']}\" }
            " 2>/dev/null || echo "  (none)"
            
            echo ""
            echo "agents:"
            ruby -ryaml -e "
                require 'yaml'
                catalog = YAML.safe_load(File.read('$LIBRARY'), permitted_classes: [], permitted_symbols: [], aliases: false)
                items = catalog['agents'] || []
                items.each { |i| puts \"  #{i['name']} - #{i['description']}\" }
            " 2>/dev/null || echo "  (none)"
            
            echo ""
            echo "prompts:"
            ruby -ryaml -e "
                require 'yaml'
                catalog = YAML.safe_load(File.read('$LIBRARY'), permitted_classes: [], permitted_symbols: [], aliases: false)
                items = catalog['prompts'] || []
                items.each { |i| puts \"  #{i['name']} - #{i['description']}\" }
            " 2>/dev/null || echo "  (none)"
        else
            echo "  Error: library.yaml not found"
        fi
    else
        case "$SECTION" in
            skill)
                echo "Available skills:"
                if [ -f "$LIBRARY" ]; then
                    ruby -ryaml -e "
                        require 'yaml'
                        catalog = YAML.safe_load(File.read('$LIBRARY'), permitted_classes: [], permitted_symbols: [], aliases: false)
                        items = catalog['skills'] || []
                        items.each { |i| puts \"  #{i['name']} - #{i['description']}\" }
                    " 2>/dev/null || echo "  (none)"
                else
                    echo "  (none)"
                fi
                echo ""
                echo "Installed skills:"
                list_installed "{{SKILLS_DIR}}" "" | sed 's/^/  /' || echo "  (none)"
                ;;
            agent)
                echo "Available agents:"
                if [ -f "$LIBRARY" ]; then
                    ruby -ryaml -e "
                        require 'yaml'
                        catalog = YAML.safe_load(File.read('$LIBRARY'), permitted_classes: [], permitted_symbols: [], aliases: false)
                        items = catalog['agents'] || []
                        items.each { |i| puts \"  #{i['name']} - #{i['description']}\" }
                    " 2>/dev/null || echo "  (none)"
                else
                    echo "  (none)"
                fi
                echo ""
                echo "Installed agents:"
                list_installed "{{AGENTS_DIR}}" ".md" | sed 's/^/  /' || echo "  (none)"
                ;;
            prompt)
                echo "Available prompts:"
                if [ -f "$LIBRARY" ]; then
                    ruby -ryaml -e "
                        require 'yaml'
                        catalog = YAML.safe_load(File.read('$LIBRARY'), permitted_classes: [], permitted_symbols: [], aliases: false)
                        items = catalog['prompts'] || []
                        items.each { |i| puts \"  #{i['name']} - #{i['description']}\" }
                    " 2>/dev/null || echo "  (none)"
                else
                    echo "  (none)"
                fi
                echo ""
                echo "Installed prompts:"
                list_installed "{{PROMPTS_DIR}}" ".md" | sed 's/^/  /' || echo "  (none)"
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
    #!/usr/bin/env bash
    set -euo pipefail
    BRUNNR_HOME="{{BRUNNR_HOME}}"
    
    # Check BRUNNR_HOME is a git repo
    if [ ! -d "$BRUNNR_HOME/.git" ]; then
        echo "Error: $BRUNNR_HOME is not a git repository"
        echo "Initialize with: cd $BRUNNR_HOME && git init && git remote add origin <url>"
        exit 1
    fi
    
    cd "$BRUNNR_HOME"
    
    # Check for dirty working tree
    if [ -n "$(git status --porcelain)" ]; then
        echo "Error: brunnr has uncommitted changes"
        echo "Please commit or stash your changes before syncing."
        echo ""
        echo "Modified files:"
        git status --porcelain
        exit 1
    fi
    
    # Check remote exists
    if ! git remote get-url origin >/dev/null 2>&1; then
        echo "Error: No remote configured for brunnr"
        echo "Add a remote with: cd $BRUNNR_HOME && git remote add origin <url>"
        exit 1
    fi
    
    # Fetch remote state
    echo "Fetching latest changes..."
    git fetch origin
    
    # Get current branch
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    
    # Check if branch has upstream tracking
    UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null) || {
        echo "Error: Current branch '$CURRENT_BRANCH' has no upstream tracking"
        echo "Set upstream with: git push -u origin $CURRENT_BRANCH"
        exit 1
    }
    
    # Get commit counts
    LOCAL_AHEAD=$(git rev-list --count @{upstream}..HEAD 2>/dev/null || echo "0")
    LOCAL_BEHIND=$(git rev-list --count HEAD..@{upstream} 2>/dev/null || echo "0")
    
    # Check divergence and handle accordingly
    if [ "$LOCAL_BEHIND" -gt 0 ] && [ "$LOCAL_AHEAD" -gt 0 ]; then
        echo "Error: Branch has diverged from remote"
        echo "Local: $LOCAL_AHEAD commit(s) ahead"
        echo "Remote: $LOCAL_BEHIND commit(s) behind"
        echo ""
        echo "Manual merge required. Options:"
        echo "  1. Review and merge: cd $BRUNNR_HOME && git merge origin/$CURRENT_BRANCH"
        echo "  2. Rebase if safe: cd $BRUNNR_HOME && git rebase origin/$CURRENT_BRANCH"
        echo "  3. Reset to remote: cd $BRUNNR_HOME && git reset --hard origin/$CURRENT_BRANCH"
        exit 1
    elif [ "$LOCAL_BEHIND" -gt 0 ]; then
        # Fast-forward possible
        echo "Fast-forwarding $CURRENT_BRANCH to latest..."
        git merge --ff-only origin/$CURRENT_BRANCH
        echo "brunnr repository synced successfully"
    elif [ "$LOCAL_AHEAD" -gt 0 ]; then
        # Local is ahead of remote (pushed but remote not updated)
        echo "brunnr is up to date (local is $LOCAL_AHEAD commit(s) ahead of remote)"
        echo "Push your changes with: cd $BRUNNR_HOME && git push"
    else
        echo "brunnr is already up to date"
    fi

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
        
        ['skills', 'agents', 'prompts'].each do |section|
          items = catalog[section] || []
          items.each do |item|
            name = item['name'].to_s.downcase
            desc = item['description'].to_s.downcase
            tags = item['tags'].to_a.map(&:to_s).map(&:downcase)
            
            if name.include?(query) || desc.include?(query) || tags.any? { |t| t.include?(query) }
              found = true
              section_name = section[0..-2]  # Remove 's' for singular
              puts \"#{section_name}: #{item['name']} - #{item['description']}\"
              puts \"  tags: #{item['tags'].join(', ')}\" if item['tags'] && !item['tags'].empty?
              puts
            end
          end
        end
        
        exit(found ? 0 : 1)
    " "$QUERY" || echo "No matches found in catalog"
