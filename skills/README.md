# Agent skills

Skills that teach an AI coding agent (e.g. WorkBuddy, Claude Code) how to use this library.

## `node-crawler`

Consumer-facing skill: how to scrape/crawl websites with the `crawler` package.

**Install** — copy the skill folder into a project's or your user skills dir:

```sh
# WorkBuddy — user-scoped (available in every project)
cp -r skills/node-crawler ~/.workbuddy/skills/node-crawler/

# Claude Code — project-scoped
cp -r skills/node-crawler /path/to/your-project/.claude/skills/node-crawler/

# Claude Code — user-scoped (available in every project)
cp -r skills/node-crawler ~/.claude/skills/node-crawler/
```

The agent loads it automatically when a task involves web scraping/crawling.

The canonical WorkBuddy version lives at `~/.workbuddy/skills/node-crawler/`.
Keep `skills/node-crawler/SKILL.md` in sync with the public API when it changes.
