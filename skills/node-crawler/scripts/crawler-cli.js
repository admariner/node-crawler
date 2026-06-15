#!/usr/bin/env node
/**
 * crawler-cli — command-line interface for the `crawler` npm package.
 *
 * Usage:
 *   node crawler-cli.js scrape   <url...>  [options]
 *   node crawler-cli.js download <url...>  [options]
 *   node crawler-cli.js spider   <baseUrl> [options]
 *
 * Each command maps to one of the three core crawler patterns:
 *   scrape   — extract HTML content via Cheerio CSS selectors
 *   download — fetch binary files and save to disk
 *   spider   — recursive crawl following links
 *
 * Requires: Node.js >= 22, `crawler` installed (npm install crawler).
 */

import Crawler from "crawler";
import fs from "fs";
import path from "path";
import { URL } from "url";

// ---------------------------------------------------------------------------
// Argument parser (no external deps)
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
  showHelp();
  process.exit(0);
}

const cmd = argv[0];
const rest = argv.slice(1);
const args = parseArgs(rest);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function parseArgs(raw) {
  const opts = { urls: [], selectors: [], attrib: "text" };
  let i = 0;
  while (i < raw.length) {
    const a = raw[i];
    if (a === "-s" || a === "--selector") {
      opts.selectors.push(raw[++i]);
    } else if (a === "-a" || a === "--attr") {
      opts.attrib = raw[++i];
    } else if (a === "-o" || a === "--output") {
      opts.output = raw[++i];
    } else if (a === "-c" || a === "--concurrency") {
      opts.maxConnections = parseInt(raw[++i], 10);
    } else if (a === "-r" || a === "--rate-limit") {
      opts.rateLimit = parseInt(raw[++i], 10);
    } else if (a === "-p" || a === "--proxy") {
      opts.proxy = raw[++i];
    } else if (a === "--retries") {
      opts.retries = parseInt(raw[++i], 10);
    } else if (a === "-t" || a === "--timeout") {
      opts.timeout = parseInt(raw[++i], 10);
    } else if (a === "--http2") {
      opts.http2 = true;
    } else if (a === "--user-agent") {
      opts.userAgent = raw[++i];
    } else if (a === "-d" || a === "--dir") {
      opts.dir = raw[++i];
    } else if (a === "--link-selector") {
      opts.linkSelector = raw[++i];
    } else if (a === "--depth") {
      opts.maxDepth = parseInt(raw[++i], 10);
    } else if (a === "--same-origin") {
      opts.sameOrigin = true;
    } else if (a === "--silent") {
      opts.silent = true;
    } else if (a === "-f" || a === "--url-file") {
      const file = raw[++i];
      const content = fs.readFileSync(file, "utf8");
      opts.urls.push(
        ...content
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"))
      );
    } else if (a.startsWith("-")) {
      if (!opts.silent) console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else {
      opts.urls.push(a);
    }
    i++;
  }
  return opts;
}

function buildCrawlerOptions(opts = {}, extra = {}) {
  return {
    maxConnections: opts.maxConnections ?? 10,
    rateLimit: opts.rateLimit ?? 0,
    retries: opts.retries ?? 2,
    retryInterval: opts.retryInterval ?? 3000,
    timeout: opts.timeout ?? 20000,
    silence: opts.silent ?? false,
    ...extra,
  };
}

function log(msg) {
  if (!args.silent) console.error(`[crawler-cli] ${msg}`);
}

// ---------------------------------------------------------------------------
// Subcommand: scrape
// ---------------------------------------------------------------------------

function runScrape() {
  if (args.urls.length === 0) {
    console.error("Error: at least one URL is required.");
    process.exit(1);
  }
  if (args.selectors.length === 0) {
    args.selectors.push("title"); // sensible default
  }

  const results = [];
  const selectors = args.selectors;
  const attrib = args.attrib;

  const crawler = new Crawler(
    buildCrawlerOptions(args, {
      jQuery: true,
      callback: (error, res, done) => {
        if (error) {
          log(`FAIL ${res?.options?.url ?? "?"} — ${error.message}`);
          results.push({ url: res?.options?.url, error: error.message });
          done();
          return;
        }
        const $ = res.$;
        const row = { url: res.options.url, status: res.statusCode };

        for (const sel of selectors) {
          const els = $(sel);
          if (els.length === 0) {
            row[sel] = null;
          } else if (attrib === "text") {
            row[sel] =
              els.length === 1
                ? els.text().trim()
                : els
                    .map((_, el) => $(el).text().trim())
                    .get();
          } else if (attrib === "html") {
            row[sel] =
              els.length === 1
                ? els.html()?.trim()
                : els
                    .map((_, el) => $(el).html()?.trim())
                    .get();
          } else {
            row[sel] =
              els.length === 1
                ? els.attr(attrib)
                : els
                    .map((_, el) => $(el).attr(attrib))
                    .get();
          }
        }

        log(`OK   ${res.options.url}`);
        results.push(row);
        done();
      },
    })
  );

  crawler.on("drain", () => {
    const json = JSON.stringify(results, null, 2);
    if (args.output) {
      fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
      fs.writeFileSync(args.output, json);
      log(`Saved ${results.length} rows → ${args.output}`);
    } else {
      console.log(json);
    }
  });

  log(`Scraping ${args.urls.length} URL(s) with selector(s): ${selectors.join(", ")}`);
  crawler.add(args.urls.map((url) => ({ url, proxy: args.proxy })));
}

// ---------------------------------------------------------------------------
// Subcommand: download
// ---------------------------------------------------------------------------

function runDownload() {
  if (args.urls.length === 0) {
    console.error("Error: at least one URL or --url-file is required.");
    process.exit(1);
  }

  const outDir = path.resolve(args.dir ?? "./downloads");
  fs.mkdirSync(outDir, { recursive: true });
  const downloaded = [];

  const crawler = new Crawler(
    buildCrawlerOptions(args, {
      encoding: null, // keep body as Buffer
      jQuery: false,
      callback: (error, res, done) => {
        if (error) {
          log(`FAIL ${res?.options?.url ?? "?"} — ${error.message}`);
          downloaded.push({ url: res?.options?.url, error: error.message });
          done();
          return;
        }
        const filename = res.options.userParams.filename;
        const filePath = path.join(outDir, filename);
        fs.writeFileSync(filePath, res.body);
        const size = res.body.length;
        log(`OK   ${res.options.url} → ${filename} (${formatSize(size)})`);
        downloaded.push({ url: res.options.url, file: filePath, size });
        done();
      },
    })
  );

  crawler.on("drain", () => {
    const failures = downloaded.filter((d) => d.error).length;
    log(
      `Done. ${downloaded.length - failures} downloaded, ${failures} failed → ${outDir}`
    );
  });

  log(`Downloading ${args.urls.length} file(s) → ${outDir}`);
  crawler.add(
    args.urls.map((url) => ({
      url,
      proxy: args.proxy,
      userParams: { filename: basenameFromUrl(url) },
    }))
  );
}

// ---------------------------------------------------------------------------
// Subcommand: spider
// ---------------------------------------------------------------------------

function runSpider() {
  if (args.urls.length === 0) {
    console.error("Error: a base URL is required.");
    process.exit(1);
  }

  const baseUrl = args.urls[0];
  const maxDepth = args.maxDepth ?? 3;
  const linkSel = args.linkSelector ?? "a";
  const sameOrigin = args.sameOrigin !== false; // default true
  const results = [];
  const selectors = args.selectors.length > 0 ? args.selectors : ["title"];

  // Ensure base URL is absolute with protocol
  const baseUrlObj = new URL(
    baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`
  );
  const baseOrigin = baseUrlObj.origin;
  const visited = new Set();
  let queued = 0;

  const crawler = new Crawler(
    buildCrawlerOptions(args, {
      maxConnections: args.maxConnections ?? 5,
      rateLimit: args.rateLimit ?? 500,
      jQuery: true,
      callback: (error, res, done) => {
        if (error) {
          log(`FAIL ${res.options.url} — ${error.message}`);
          done();
          return;
        }
        const $ = res.$;
        const pageUrl = res.options.url;
        const depth = res.options.userParams.depth;

        // Extract target data
        const row = { url: pageUrl, depth, status: res.statusCode };
        for (const sel of selectors) {
          row[sel] = $(sel).first().text().trim() || null;
        }
        results.push(row);
        log(`OK   [d=${depth}] ${pageUrl}`);

        // Follow links if not at max depth
        if (depth < maxDepth) {
          $(linkSel).each((_, el) => {
            const href = $(el).attr("href");
            if (!href) return;
            let nextUrl;
            try {
              nextUrl = new URL(href, pageUrl).href;
            } catch {
              return;
            }
            if (sameOrigin && new URL(nextUrl).origin !== baseOrigin) return;
            // Skip fragments, strip trailing hash
            const clean = nextUrl.split("#")[0];
            if (visited.has(clean)) return;
            visited.add(clean);
            crawler.add({
              url: clean,
              proxy: args.proxy,
              userParams: { depth: depth + 1 },
            });
            queued++;
          });
        }
        done();
      },
    })
  );

  crawler.on("drain", () => {
    const json = JSON.stringify(results, null, 2);
    if (args.output) {
      fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
      fs.writeFileSync(args.output, json);
      log(`Saved ${results.length} pages → ${args.output}`);
    } else {
      console.log(json);
    }
    log(`Spider done. ${results.length} pages scraped, ${queued} links followed.`);
  });

  visited.add(baseUrlObj.href);
  log(`Spider start: ${baseUrlObj.href}  depth=${maxDepth}  same-origin=${sameOrigin}`);
  crawler.add({ url: baseUrlObj.href, proxy: args.proxy, userParams: { depth: 0 } });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function basenameFromUrl(url) {
  try {
    const p = new URL(url).pathname;
    const name = path.basename(p) || "index";
    return name.includes(".") ? name : `${name}.html`;
  } catch {
    return "download";
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function showHelp() {
  const help = `
crawler-cli — command-line interface for the \`crawler\` npm package.

USAGE
  node crawler-cli.js <command> [options]

COMMANDS
  scrape    Extract data from pages using CSS selectors
  download  Fetch binary files and save to disk
  spider    Recursively crawl a site, following links

COMMON OPTIONS
  -c, --concurrency <n>    Max concurrent connections (default: 10)
  -r, --rate-limit <ms>    Minimum gap between requests in ms
  -p, --proxy <url>        Proxy URL
  --retries <n>            Retry count on failure (default: 2)
  -t, --timeout <ms>       Request timeout in ms (default: 20000)
  --http2                  Use HTTP/2
  --user-agent <ua>        Custom User-Agent header
  -f, --url-file <path>    Read URLs from a file (one per line)
  --silent                 Suppress status output

SCRAPE OPTIONS
  -s, --selector <sel>     CSS selector to extract (repeatable; default: title)
  -a, --attr <attr>        Attribute to extract: text | html | href | src | ...
                            (default: text)
  -o, --output <file>      JSON output file (stdout if omitted)

DOWNLOAD OPTIONS
  -d, --dir <path>         Output directory (default: ./downloads)
  -o, --output <file>      JSON report file (omitted by default)

SPIDER OPTIONS
  -s, --selector <sel>     Content selector to extract (default: title)
  --link-selector <sel>    Selector for links to follow (default: a)
  --depth <n>              Max crawl depth (default: 3)
  --same-origin            Only follow same-origin links (default: true)
  -o, --output <file>      JSON output file (stdout if omitted)

EXAMPLES
  # Scrape page titles
  node crawler-cli.js scrape https://example.com -s "title"

  # Scrape multiple pages, extract text and hrefs
  node crawler-cli.js scrape https://site/page/1 https://site/page/2 \\
    -s "h2.product-title" -s "a.link" -a href -o results.json

  # Batch download images
  node crawler-cli.js download -f urls.txt -d ./images --rate-limit 500

  # Spider a site, depth 2, extracting all h2 text
  node crawler-cli.js spider https://example.com/docs \\
    -s "h2" --depth 2 -o pages.json

  # Spider with proxy and 1 request/sec
  node crawler-cli.js spider https://example.com \\
    -p http://proxy:8888 --rate-limit 1000 --depth 5
`.trim();
  console.log(help);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

switch (cmd) {
  case "scrape":
    runScrape();
    break;
  case "download":
    runDownload();
    break;
  case "spider":
    runSpider();
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    console.error("Run with --help to see usage.");
    process.exit(1);
}
