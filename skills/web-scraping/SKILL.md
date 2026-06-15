---
name: web-scraping
description: >-
  Scrape or crawl websites with the `crawler` npm package (HTTP/HTTP2, proxies,
  rate limiting, request pooling, Cheerio/jQuery parsing, charset conversion).
  Use when the task is to fetch multiple pages, build a spider, extract data
  from HTML at scale, or download files politely with retries and rate limits.
---

# Web scraping with `crawler`

`crawler` is a Node.js web spider: an internal queue with a configurable pool,
per-host rate limiting, automatic retries, proxy rotation, charset detection,
and server-side Cheerio (jQuery-style) HTML parsing. Built on `got` + HTTP/2.

**Requirements:** Node.js >= 22. The package is native **ESM** (use `import`,
or `crawler@beta` if you truly need CommonJS).

```sh
npm install crawler
```

## Decide: queue vs. direct send

- **Queue (`crawler.add`)** — the normal path. Use for crawling many URLs: it
  pools connections, applies `maxConnections`/`rateLimit`, retries, rotates
  proxies/user-agents, and fires the `callback` per page. Crawl finishes on the
  `'drain'` event.
- **Direct (`crawler.send`)** — one-off fetch. Returns a Promise (or takes a
  callback). **Skips** the queue, `preRequest`, rate limiting, and the
  `'request'` event. Use it for a single ad-hoc request, not for crawling.

## Queue pattern (most common)

```js
import Crawler from "crawler";

const c = new Crawler({
  maxConnections: 10,        // pool size; forced to 1 when rateLimit > 0
  callback: (error, res, done) => {
    if (error) {
      console.error(error);
    } else {
      const $ = res.$;        // Cheerio instance (jQuery: true by default)
      console.log($("title").text());
    }
    done();                   // REQUIRED: release the slot, or the crawl stalls
  },
});

c.on("drain", () => console.log("done — queue empty"));

c.add("https://example.com");                    // single URL
c.add(["https://a.com", "https://b.com"]);       // list of URLs
c.add({ url: "https://c.com", jQuery: false,     // single task; per-task overrides win
        callback: (e, res, done) => { /* ... */ done(); } });
c.add([{ url: "https://a.com", userParams: { id: 1 } },   // array of task objects,
        { url: "https://b.com", userParams: { id: 2 } }]); // each with its own options
```

Two rules that cause almost all bugs:
1. **Always call `done()`** in every callback branch (including errors), or the
   pool slot is never freed and the crawl hangs.
2. **Completion is the `'drain'` event**, not the return of `add()`. `add()`
   only enqueues.

The process exits **naturally** once the queue drains — the crawler holds no
handles open. Don't call `process.exit()` to terminate a finished crawl; only
add it if *you* opened something that keeps the event loop alive (DB pool, etc.,
which you'd typically close in the `'drain'` handler).

## Direct request

```js
const c = new Crawler();
const res = await c.send("https://example.com");   // Promise form
console.log(res.statusCode, res.body.length);

c.send({ url: "https://example.com",
         callback: (err, res) => { /* callback form: 2 args, no done() */ } });
```

## Be polite: rate limit & retries

```js
const c = new Crawler({
  rateLimit: 1000,   // >=1000ms gap between requests (forces maxConnections=1)
  retries: 2,        // default 2
  retryInterval: 3000,
  timeout: 20000,
  callback: (e, res, done) => { /* ... */ done(); },
});
```

Per-host limiters: give tasks a `rateLimiterId` (separate limiter per id), and
commonly pair each with its own `proxy`:

```js
c.add({ url: "https://site/1", rateLimiterId: 1, proxy: "http://p1:port" });
c.add({ url: "https://site/2", rateLimiterId: 2, proxy: "http://p2:port" });
```

## Passing data through to the callback

Use `userParams` to carry context; read it on `res.options.userParams`:

```js
c.add({ url: "https://site/item/42", userParams: { id: 42 } });
// callback: console.log(res.options.userParams.id)
```

## Parse with Cheerio

When `jQuery` is true (default), `res.$` is a loaded Cheerio instance — use
jQuery-style selectors:

```js
const titles = res.$("h2.title").map((i, el) => res.$(el).text().trim()).get();
const links  = res.$("a").map((i, el) => res.$(el).attr("href")).get();
```

## Download binary files (images, PDFs)

Set `encoding: null` so the body stays a Buffer, and `jQuery: false`:

```js
import fs from "fs";
const c = new Crawler({
  encoding: null,
  jQuery: false,
  callback: (err, res, done) => {
    if (!err) fs.writeFileSync(res.options.userParams.filename, res.body);
    done();
  },
});
c.add({ url: "https://host/file.png", userParams: { filename: "file.png" } });
```

## HTTP/2 and proxies

```js
c.send({ url: "https://nghttp2.org/httpbin/status/200", http2: true,
         callback: (e, res) => console.log(res.statusCode) });
```

With proxies + Charles/self-signed certs, set `rejectAuthority: false` to avoid
"self-signed certificate" errors. Prefer rotating proxies via the `'schedule'`
event over the `proxies: []` array option.

## Tweak options mid-flight (events)

```js
c.on("schedule", options => { options.proxy = "http://proxy:port"; });
c.on("request",  options => { options.searchParams = { t: Date.now() }; });
```

## Key options

Pass to the `Crawler({...})` constructor (global) or per task in `add({...})`
(overrides global). All native [`got` options](https://github.com/sindresorhus/got/blob/main/documentation/2-options.md)
(`method`, `headers`, `body`, `form`, `searchParams`, ...) pass straight through.

| Option | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `maxConnections` | global | 10 | Max simultaneous requests (forced to 1 if `rateLimit`>0) |
| `rateLimit` | global | 0 | Min ms gap between requests |
| `priorityLevels` | global | 10 | Number of priority levels |
| `skipDuplicates` | global | false | Drop URLs already seen |
| `userAgents` | global | – | Rotate UA per request (string or array) |
| `silence` | global | false | Mute warnings/errors (request errors still reported) |
| `jQuery` | per-task | true | Load Cheerio into `res.$` |
| `encoding` | per-task | "utf8" | Body encoding; `null` keeps a Buffer |
| `forceUTF8` | per-task | false | Detect charset and convert to UTF-8 |
| `retries` | per-task | 2 | Retry count on failure |
| `retryInterval` | per-task | 3000 | Ms before a retry |
| `timeout` | per-task | 20000 | Request timeout (ms) |
| `priority` | per-task | 5 | Queue priority (lower = sooner) |
| `rateLimiterId` | per-task | 0 | Which limiter governs this task |
| `proxy` / `proxies` | per-task | – | Single proxy / rotated list |
| `http2` | per-task | false | Use HTTP/2 |
| `preRequest` | per-task | – | `(options, done)` hook before each queued request |
| `userParams` | per-task | – | Arbitrary data, read via `res.options.userParams` |

## Gotchas checklist

- ESM only — `import Crawler from "crawler"`. Node >= 22.
- Call `done()` in **every** queue-callback path, or the crawl stalls.
- Wait for `'drain'` to know the crawl is finished.
- `rateLimit > 0` pins `maxConnections` to 1.
- `crawler.send` bypasses the queue, rate limits, `preRequest`, and `'request'`.
- For POST form data use `form` (the old `body`-for-forms usage from v1 is gone).
- Binary downloads need `encoding: null` and `jQuery: false`.
