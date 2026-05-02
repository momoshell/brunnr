# Use Installed Items

> How to use skills, agents, and prompts once they're installed in your project.

## Overview

Once items are installed in your project (via `just add`), they become available to your AI assistant. This guide explains how to invoke and use each type of item.

> Examples below use names from the current brunnr catalog (`autoresearch-skill`, `eitri`, `skill-status`, etc.). Generic placeholders like `<skill-name>` mark spots where you would substitute your own item name.

## Using Skills

Skills are reusable capabilities that your AI assistant can apply to tasks.

### Direct Invocation

Most skills can be invoked directly by mentioning them:

```
User: @<skill-name> please review this function
AI: [applies the skill]
```

### Contextual Activation

Skills may auto-activate based on context — Pi loads skill descriptions into the system prompt and the model picks the relevant one based on user keywords.

### Skill Location

Installed skills are in `.pi/skills/<skill-name>/`:

```
.pi/skills/
└── <skill-name>/
    └── SKILL.md
```

## Using Agents

Agents are specialized AI configurations. They typically define:
- Specific expertise or role
- Behavioral guidelines
- Tool access patterns

### Agent Invocation

Agents are usually invoked by name (Pi resolves `@<agent>` to the matching `.pi/agents/<agent>.md`):

```
User: @autoresearch-skill optimize the my-skill capability
AI: [activates as autoresearch-skill]
```

### Agent Location

Installed agents are in `.pi/agents/`:

```
.pi/agents/
├── autoresearch-skill.md
├── autoresearch-skill-gepa.md
├── eval-designer.md
└── eitri/                     # directory-routed from extensions
    ├── eitri-orchestrator.md
    └── *-expert.md
```

## Using Prompts

Prompts are single-shot instructions or templates.

### Prompt Invocation

Prompts are typically invoked via slash-command syntax:

```
User: /skill-status
AI: [runs the skill-status prompt — scans evals.json history and ranks skills]
```

Or by direct reference:

```
User: Run the gen-evals prompt on this skill
AI: [applies gen-evals prompt template]
```

### Prompt Location

Installed prompts are in `.pi/prompts/`:

```
.pi/prompts/
├── skill-status.md
├── gen-evals.md
└── autoresearch-skill.md
```

## Using Multi-Agent Prompts

Multi-agent prompts orchestrate multiple agents in a workflow.

### Multi-Agent Invocation

```
User: /autoresearch-pipeline
AI: [orchestrates a three-stage skill optimization workflow]
```

### What Happens

A multi-agent prompt typically:
1. Invokes the first agent
2. Collects results
3. Invokes subsequent agents
4. Synthesizes a unified response

### Example Workflow (autoresearch-pipeline)

```markdown
---
name: autoresearch-pipeline
type: multi-agent
agents:
  - autoresearch-skill
  - autoresearch-skill-gepa
---

# Pipeline

1. Stage 1: hill-climb via autoresearch-skill until plateau
2. Stage 2: GEPA reflection via autoresearch-skill-gepa from the plateau seed
3. Stage 3: compaction via autoresearch-skill in delete-only mode
4. Surface the winning commit and a Pareto-front summary
```

## Combining Items

You can combine multiple items in a single request:

```
User: @autoresearch-skill optimize my-skill, then @eval-designer review the results
AI: [both agents contribute in sequence]
```

## Dependencies

Dependencies are documented in `library.yaml` but are NOT automatically installed. Before using an item, check if it has dependencies and install them manually:

```bash
# Check dependencies for an item
ruby -ryaml -e "
  catalog = YAML.load_file('~/.config/brunnr/library.yaml')
  item = catalog['agents'].find { |a| a['name'] == 'autoresearch-skill' }
  puts 'Dependencies: ' + item['dependencies'].to_s
"
```

Install any required dependencies using `just add`.

## Best Practices

1. **Start specific**: Use the most specific skill/agent for your task
2. **Layer when needed**: Combine complementary skills for complex tasks
3. **Check dependencies**: Review library.yaml and install required dependencies manually
4. **Keep updated**: Sync brunnr regularly to get improvements

## Troubleshooting

### "Skill not found"

Verify the skill is installed:
```bash
ls .pi/skills/
```

If missing, install it:
```bash
just -f ~/.config/brunnr/justfile add skill <name>
```

### "Agent not responding"

Check that the agent file exists and is valid:
```bash
cat .pi/agents/<agent-name>.md
```

### "Prompt not recognized"

Ensure the prompt is in the correct location:
```bash
ls .pi/prompts/
```

## See Also

- [`add.md`](add.md) — How to add items to your project
- [`list.md`](list.md) — How to list available and installed items
