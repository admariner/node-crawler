# Agent skills

Skills that teach an AI coding agent (e.g. Claude Code) how to use this library.

## `web-scraping`

Consumer-facing skill: how to scrape/crawl websites with the `crawler` package.

**Install** — copy the skill folder into a project's or your user skills dir:

```sh
# project-scoped
cp -r skills/web-scraping /path/to/your-project/.claude/skills/

# or user-scoped (available in every project)
cp -r skills/web-scraping ~/.claude/skills/
```

The agent loads it automatically when a task involves web scraping/crawling.
Keep `web-scraping/SKILL.md` in sync with the public API when it changes.
