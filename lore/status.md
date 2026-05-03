# Catalog Queue Status

> Show open pull requests in the brunnr remote — the queue of items "waiting to be forged" or scrapped.

## Syntax

```bash
brunnr status
```

No arguments. Reports against whatever `origin` your brunnr clone points to.

## Requires

- `gh` CLI installed and authenticated (`gh auth login`)
- `origin` remote configured on the brunnr repo

## Output

```bash
$ brunnr status
Open PRs in brunnr (waiting to be forged):

  #42 Add security-review skill
      add-security-review | @alice | 2d ago
  #43 Scrap stale-optimizer agent
      scrap-stale-optimizer | @bob | today

Review: gh pr view <num> --web   (run from ~/.config/brunnr)
```

When the queue is empty:

```bash
$ brunnr status
No open PRs — the forge is quiet.
```

Each entry shows PR number, title, branch name, author, and age.

## When to Run

- Before `brunnr sync` — see what's about to land
- Periodically as a maintainer — clear the review queue
- After `brunnr push` / `brunnr scrap` — confirm your PR shows up

There's no background notification; status is a manual check.

## See Also

- [`push.md`](push.md) — Open a PR to add an item (shows up in status)
- [`scrap.md`](scrap.md) — Open a PR to remove an item (shows up in status)
- [`sync.md`](sync.md) — Pull merged items into your local clone
