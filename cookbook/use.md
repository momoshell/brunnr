# Use Installed Items

> How to use skills, agents, and prompts once they're installed in your project.

## Overview

Once items are installed in your project (via `just add`), they become available to your AI assistant. This guide explains how to invoke and use each type of item.

## Using Skills

Skills are reusable capabilities that your AI assistant can apply to tasks.

### Direct Invocation

Most skills can be invoked directly by mentioning them:

```
User: @code-reviewer please review this function
AI: [applies code-reviewer skill]
```

### Contextual Activation

Skills may auto-activate based on context:

```
User: Can you check this code for security issues?
AI: [security-auditor skill activates based on keywords]
```

### Skill Location

Installed skills are in `.claude/skills/<skill-name>/`:

```
.claude/skills/
├── code-reviewer/
│   └── SKILL.md
├── test-writer/
│   └── SKILL.md
└── doc-generator/
    └── SKILL.md
```

## Using Agents

Agents are specialized AI configurations. They typically define:
- Specific expertise or role
- Behavioral guidelines
- Tool access patterns

### Agent Invocation

Agents are usually invoked by name:

```
User: @security-auditor analyze this authentication code
AI: [activates as security-auditor agent]
```

### Agent Location

Installed agents are in `.claude/agents/`:

```
.claude/agents/
├── security-auditor.md
├── performance-reviewer.md
└── docs-checker.md
```

## Using Prompts

Prompts are single-shot instructions or templates.

### Prompt Invocation

Prompts are typically invoked via command syntax:

```
User: /pr-description
AI: [runs pr-description prompt]
```

Or by direct reference:

```
User: Run the commit-message prompt on these changes
AI: [applies commit-message prompt template]
```

### Prompt Location

Installed prompts are in `.claude/commands/`:

```
.claude/commands/
├── pr-description.md
├── commit-message.md
└── code-explain.md
```

## Using Multi-Agent Prompts

Multi-agent prompts orchestrate multiple agents in a workflow.

### Multi-Agent Invocation

```
User: /complex-review
AI: [runs multi-agent workflow]
```

### What Happens

A multi-agent prompt typically:
1. Invokes the first agent
2. Collects results
3. Invokes subsequent agents
4. Synthesizes a unified response

### Example Workflow

```markdown
---
name: complex-review
type: multi-agent
agents:
  - security-auditor
  - performance-reviewer
  - docs-checker
---

# Complex Review

1. @security-auditor analyze for vulnerabilities
2. @performance-reviewer check for bottlenecks  
3. @docs-checker verify documentation
4. Synthesize findings into a report
```

## Combining Items

You can combine multiple items in a single request:

```
User: @security-auditor @performance-reviewer review this API endpoint
AI: [both agents contribute to the review]
```

## Best Practices

1. **Start specific**: Use the most specific skill/agent for your task
2. **Layer when needed**: Combine complementary skills for complex tasks
3. **Check dependencies**: Ensure required dependencies are installed
4. **Keep updated**: Sync brunnr regularly to get improvements

## Troubleshooting

### "Skill not found"

Verify the skill is installed:
```bash
ls .claude/skills/
```

If missing, install it:
```bash
just -f ~/.config/brunnr/justfile add skill <name>
```

### "Agent not responding"

Check that the agent file exists and is valid:
```bash
cat .claude/agents/<agent-name>.md
```

### "Prompt not recognized"

Ensure the prompt is in the correct location:
```bash
ls .claude/commands/
```

## See Also

- [`add.md`](add.md) — How to add items to your project
- [`list.md`](list.md) — How to list available and installed items
