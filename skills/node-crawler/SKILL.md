---
name: node-crawler
description: >-
  Node.js web crawler for production-grade, large-scale tasks — NOT for simple
  one-off requests. Use only when: bulk scraping, batch downloading, multi-page
  crawling, long-running spiders, or complex multi-step workflows that need
  connection pooling, rate limiting, proxy rotation, automatic retries, and
  Cheerio   parsing. Skip this for single pages or simple fetch — use `curl`
  instead. Triggers: scrape website at scale, crawl hundreds of pages, batch
  download files, web spider, data extraction from many URLs, crawl multiple pages
  with retries and proxies.
agent_created: true
metadata:
  author: Mike Chen
  version: "1.0"
---

# Node Crawler (`crawler` package)

`crawler` is a Node.js web spider library: internal queue + configurable
connection pool + per-domain rate limiting + automatic retries + proxy
rotation + charset detection + server-side Cheerio (jQuery-style) HTML
parsing. Built on `got`, supports HTTP/2.

## Prerequisites

- Node.js >= 22
- Pure ESM: `import Crawler from "crawler"`
- If the codebase must use CommonJS, install `crawler@beta`

```sh
npm install crawler
```

## When to use

This skill is for **production-grade, large-scale crawling**. Reach for it
when the task is substantial:

- Scraping **many pages** (dozens to millions) with structured data extraction
- **Batch-downloading** files — images, PDFs, archives — with retry and resume
- **Long-running spiders** that need rate limiting, retries, and connection pooling
- **Multi-step workflows** — pagination, link following, cascading crawls
- **Proxy rotation**, charset detection, HTTP/2 — infrastructure a real
  production crawler depends on

### When NOT to use

- A **single page** or one-off request → `curl` is far lighter.
  Spinning up a Crawler instance for 1-2 pages is overkill.
- Pages requiring **JavaScript rendering** → use the `agent-browser` skill
  (Playwright/Puppeteer) instead
- Simple **API data fetching** → `fetch` / `got` with JSON parsing

## CLI — preferred for most tasks

The bundled CLI covers the three core patterns. Prefer it over writing scripts
for scrape / download / spider tasks. The script is at `scripts/crawler-cli.js`
and requires Node.js >= 22 and `crawler` installed.

### scrape — extract data with CSS selectors

```bash
# Extract page titles from a list of URLs
node scripts/crawler-cli.js scrape https://example.com https://other.com \
  -s "title" -s "h1" -o results.json

# Extract hrefs from all links
node scripts/crawler-cli.js scrape https://example.com \
  -s "a" -a href -o links.json

# Scrape with proxy, concurrency control, and rate limiting
node scripts/crawler-cli.js scrape -f urls.txt \
  -s ".product-name" -s ".price" \
  -p http://proxy:8888 --rate-limit 500 -c 5 -o products.json

# Read URLs from a file (one per line)
node scripts/crawler-cli.js scrape -f urls.txt -s "h2" -o titles.json
```

### download — batch download files

```bash
# Download all images listed in a file
node scripts/crawler-cli.js download -f images.txt -d ./images

# With rate limiting and proxy
node scripts/crawler-cli.js download -f files.txt \
  -d ./downloads --rate-limit 1000 -p http://proxy:8888

# Download specific URLs directly
node scripts/crawler-cli.js download \
  https://host/file1.png https://host/file2.pdf -d ./out
```

### spider — recursive crawl following links

```bash
# Crawl a site, depth 3, extract all h2 text
node scripts/crawler-cli.js spider https://example.com/docs \
  -s "h2" --depth 3 -o pages.json

# Crawl with proxy, cross-origin, depth 5, extract links
node scripts/crawler-cli.js spider https://example.com \
  -s "article" --link-selector "a.internal" --depth 2 --rate-limit 1000
```

### Common options (all commands)

| Flag | Description | Default |
|------|-------------|---------|
| `-c, --concurrency` | Max concurrent requests | 10 |
| `-r, --rate-limit` | Min gap between requests (ms) | 0 |
| `-p, --proxy` | Proxy URL | — |
| `--retries` | Retry count on failure | 2 |
| `-t, --timeout` | Request timeout (ms) | 20000 |
| `--http2` | Use HTTP/2 | — |
| `-f, --url-file` | Read URLs from file | — |
| `--silent` | Suppress progress output | — |

Run `node scripts/crawler-cli.js --help` for the full reference.

## Programmatic API — for custom logic

When the CLI cannot express the required logic (complex callbacks, dynamic
scheduling, multi-stage pipelines), fall back to the programmatic API.

### Core decision: Queue vs Send

| Approach | When |
|----------|------|
| **`crawler.add()` + `'drain'` event** | Most cases. Goes through the queue, pool, rate limiter, retries, proxy rotation |
| **`crawler.send()`** | One-off requests. Bypasses queue, rate limiter, `preRequest`, `'request'` event |

## Basic usage: Queue mode

```js
import Crawler from "crawler";

const c = new Crawler({
  maxConnections: 10,
  callback: (error, res, done) => {
    if (error) {
      console.error(error);
    } else {
      const $ = res.$;  // Cheerio instance (enabled by default)
      console.log($("title").text());
    }
    done();  // REQUIRED: releases the connection slot, or the crawler deadlocks
  },
});

c.on("drain", () => console.log("All done"));

c.add("https://example.com");
c.add(["https://a.com", "https://b.com"]);
c.add({ url: "https://c.com", jQuery: false,
        callback: (e, res, done) => { /* custom callback */ done(); } });
```

Two most critical rules:

1. Call `done()` from every branch of every queue callback, including the
   `if (error)` branch
2. The crawler is finished when the `'drain'` event fires, **not** when
   `add()` returns. `add()` merely enqueues tasks

## Rate limiting and retries

```js
const c = new Crawler({
  rateLimit: 1000,    // minimum gap between requests >=1000ms (forces maxConnections=1)
  retries: 2,         // default: 2
  retryInterval: 3000,// ms to wait before retrying
  timeout: 20000,     // request timeout in ms
  callback: (e, res, done) => { /* ... */ done(); },
});
```

## Data extraction with Cheerio

Cheerio is enabled by default. Use jQuery selectors to extract data:

```js
callback: (e, res, done) => {
  const $ = res.$;
  const titles = $("h2.title").map((i, el) => $(el).text().trim()).get();
  const links  = $("a").map((i, el) => $(el).attr("href")).get();
  done();
}
```

## Binary file download

```js
import fs from "fs";
const c = new Crawler({
  encoding: null,     // keep body as Buffer
  jQuery: false,      // skip Cheerio parsing
  callback: (err, res, done) => {
    if (!err) fs.writeFileSync(res.options.userParams.filename, res.body);
    done();
  },
});
c.add({ url: "https://host/file.png", userParams: { filename: "file.png" } });
```

## Proxy rotation

Use the `'schedule'` event for dynamic assignment (preferred over using the
`proxies` array):

```js
c.on("schedule", options => { options.proxy = "http://proxy:port"; });
c.on("request",  options => { options.searchParams = { t: Date.now() }; });
```

Different proxies can have different rate limiters:

```js
c.add({ url: "...", rateLimiterId: 1, proxy: "http://p1:port" });
c.add({ url: "...", rateLimiterId: 2, proxy: "http://p2:port" });
```

## HTTP/2

```js
c.add({ url: "https://...", http2: true, callback: (e, res, done) => { done(); } });
```

When using Charles or self-signed certs, add `rejectUnauthorized: false`.

## Passing context data

Use `userParams` to attach data; read it back in the callback via
`res.options.userParams`. Do **not** attach custom fields directly on the
options object.

## Gotchas

- ❌ Forgetting `done()` in the `if (error)` branch → crawler deadlocks
- ❌ Writing `console.log("done")` right after `add()` → listen for `'drain'` instead
- ❌ Setting `maxConnections > 1` when `rateLimit > 0` → it gets overridden to 1
- ❌ Expecting `send()` to trigger `preRequest` or `'request'` → `send()` bypasses all queue mechanics
- ❌ POST form data via `body` → v2 requires `form`
- ❌ Binary download without `encoding: null` → corrupt output

## Options reference

The complete options table is in [references/options.md](references/options.md).

## Code examples

Full, runnable examples for every scenario are in [references/examples.md](references/examples.md):

- Basic queue crawling
- Rate limiting
- Cheerio data extraction
- Binary download
- Direct requests
- HTTP/2
- Proxy rotation
- preRequest hooks
- Full spider (pagination + extraction + following links)
