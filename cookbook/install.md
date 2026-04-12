# Install brunnr into a Project

> Initialize brunnr in your current project to start using skills, agents, and prompts.

## Quick Install

```bash
# Install brunnr into the current project
just -f ~/.config/brunnr/justfile install
```

This creates the target directories in your project:
- `.claude/skills/` — for skills
- `.claude/agents/` — for agents  
- `.claude/commands/` — for prompts

## What Gets Created

After running `install`, your project will have:

```
your-project/
├── .claude/
│   ├── skills/     # (empty, ready for skills)
│   ├── agents/     # (empty, ready for agents)
│   └── commands/   # (empty, ready for prompts)
└── ...
```

## Verify Installation

```bash
# List the created directories
ls -la .claude/

# Should show:
# skills/
# agents/
# commands/
```

## Customizing Target Directories

If you prefer different target directories, set environment variables before running commands:

```bash
# Use custom directories
export BRUNNR_SKILLS_DIR=".ai/skills"
export BRUNNR_AGENTS_DIR=".ai/agents"
export BRUNNR_PROMPTS_DIR=".ai/prompts"

just -f ~/.config/brunnr/justfile install
```

## Next Steps

Once installed, you can:

1. **Add skills** — `just -f ~/.config/brunnr/justfile add skill <name>`
2. **Add agents** — `just -f ~/.config/brunnr/justfile add agent <name>`
3. **Add prompts** — `just -f ~/.config/brunnr/justfile add prompt <name>`

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
