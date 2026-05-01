# Install brunnr into a Project

> Initialize brunnr in your Pi project to start using skills, agents, prompts, extensions, and themes.

## Quick Install

```bash
# Install brunnr into the current project
just -f ~/.config/brunnr/justfile install
```

This creates the target directories in your project:
- `.pi/skills/` — for skills
- `.pi/agents/` — for agents
- `.pi/prompts/` — for prompts
- `.pi/extensions/` — for Pi extensions (.ts files)
- `.pi/themes/` — for Pi themes (.json files)

Pi reads each of these paths natively — no extra extension or settings shim required.

## What Gets Created

After running `install`, your project will have:

```
your-project/
├── .pi/
│   ├── skills/      # (empty, ready for skills)
│   ├── agents/      # (empty, ready for agents)
│   ├── prompts/     # (empty, ready for prompts)
│   ├── extensions/  # (empty, ready for Pi extensions)
│   └── themes/      # (empty, ready for Pi themes)
└── ...
```

## Verify Installation

```bash
# List the created directories
ls -la .pi/

# Should show:
# skills/
# agents/
# prompts/
# extensions/
# themes/
```

## Customizing Target Directories

If you prefer different target directories, set environment variables before running commands:

```bash
# Use custom directories
export BRUNNR_SKILLS_DIR=".ai/skills"
export BRUNNR_AGENTS_DIR=".ai/agents"
export BRUNNR_PROMPTS_DIR=".ai/prompts"
export BRUNNR_EXTENSIONS_DIR=".ai/extensions"
export BRUNNR_THEMES_DIR=".ai/themes"

just -f ~/.config/brunnr/justfile install
```

## Next Steps

Once installed, you can:

1. **Add skills** — `just -f ~/.config/brunnr/justfile add skill <name>`
2. **Add agents** — `just -f ~/.config/brunnr/justfile add agent <name>`
3. **Add prompts** — `just -f ~/.config/brunnr/justfile add prompt <name>`
4. **Add extensions** — `just -f ~/.config/brunnr/justfile add extension <name>`
5. **Add themes** — `just -f ~/.config/brunnr/justfile add theme <name>`

See [`add.md`](add.md) for detailed instructions.

## Troubleshooting

### "just: command not found"

Install just: https://github.com/casey/just

### "BRUNNR_HOME not found"

Set the `BRUNNR_HOME` environment variable to point to your brunnr repository:

```bash
export BRUNNR_HOME=/path/to/your/brunnr
default: just -f $BRUNNR_HOME/justfile install
```

### Directories already exist

The `install` command is safe to run multiple times. It will not overwrite existing directories or files.
