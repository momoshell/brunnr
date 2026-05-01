---
name: fork-agent
description: Fork an externally-referenced agent into the brunnr repo — converts a remote or local reference to repo-backed so it can be edited and optimized. Use this when autoresearch-agent tells you to fork an agent first, or when you want to take ownership of an external agent.
type: single
tags: [agents, fork, import, catalog]
dependencies:
  skills: []
  agents: []
---

# Fork an external agent into brunnr

Convert a `file://` or `https://` referenced agent into a repo-backed agent so it can be edited, optimized with `/autoresearch-agent`, and versioned in brunnr.

Agents are single `.md` files (unlike skills, which are directories), so the fork is simpler — one file copy plus a `library.yaml` update.

## Parameters

| Parameter | Meaning |
|---|---|
| `AGENT_NAME` | Name of the agent as listed in `library.yaml` |

## Steps

### 1. Look up the agent in `library.yaml`

Find the entry under the `agents:` section by name. Verify the source is external:
- If `source` starts with `file://` — local reference
- If `source` starts with `https://` — remote reference
- If it's already a repo-backed path (e.g. `agents/<name>.md`) — **stop**, the agent is already in brunnr. Nothing to do.

### 2. Fetch the content

- **Local reference** (`file://`): read the file from the absolute path.
- **Remote reference** (`https://`): fetch the raw content from the URL.

If the fetch fails, stop and report the error. Do not create partial files.

### 3. Copy into brunnr

Write the content to:

```
agents/<AGENT_NAME>.md
```

If `agents/<AGENT_NAME>.md` already exists, **stop** — do not overwrite. Ask the user what to do.

Validate the content has a frontmatter block with `name`, `description`, and (ideally) `tags` and `dependencies`. If frontmatter is missing or malformed, surface it to the user — the agent may not load correctly without it. Do not auto-fix.

### 4. Update `library.yaml`

Change the entry's `source` from the external URL/path to the repo-backed path:

```yaml
# Before
- name: my-agent
  source: https://raw.githubusercontent.com/org/repo/main/agents/my-agent.md

# After
- name: my-agent
  source: agents/my-agent.md
  origin: https://raw.githubusercontent.com/org/repo/main/agents/my-agent.md
```

- Set `source` to `agents/<AGENT_NAME>.md`
- Preserve the original URL/path in `origin` for attribution
- Keep all other fields (`tags`, `dependencies`, `sync`, etc.) unchanged
- Set `sync` to `manual` if it was previously `auto` or `never` — auto-sync no longer applies since the source changed

### 5. Report

Tell the user:
- The agent is now repo-backed at `agents/<AGENT_NAME>.md`
- The original source is preserved in `origin`
- They can now run `/gen-evals-agent` and `/autoresearch-agent` on it
- Remind them to commit the new file
