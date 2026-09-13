#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

function usage() {
  process.stdout.write(`Usage: node verify-ui.mjs --url <URL> [options]

Options:
  --viewport 1920x1080       Browser viewport (default: 1920x1080)
  --wait 1200                Settle wait after navigation in ms (default: 1200)
  --scroll-container sel     Scale scroll container (default: .scale-viewport)
  --stage sel                Scale stage (default: .scale-stage)
  --table-wrapper sel        Table scroll wrapper (default: .table-wrapper)
  --thead sel                Table header (default: thead)
  --skip-table               Skip table assertions
  --browser-executable PATH  Chromium executable (or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
`);
}

function parseArgs(argv) {
  const options = {
    url: '',
    viewport: [1920, 1080],
    wait: 1200,
    scrollContainer: '.scale-viewport',
    stage: '.scale-stage',
    tableWrapper: '.table-wrapper',
    thead: 'thead',
    skipTable: false,
    browserExecutable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    switch (arg) {
      case '--url': options.url = value; index += 1; break;
      case '--viewport': {
        const match = /^(\d+)x(\d+)$/i.exec(value || '');
        if (!match) throw new Error('--viewport must use WIDTHxHEIGHT, for example 1920x1080');
        options.viewport = [Number(match[1]), Number(match[2])];
        index += 1;
        break;
      }
      case '--wait': options.wait = Number(value); index += 1; break;
      case '--scroll-container': options.scrollContainer = value; index += 1; break;
      case '--stage': options.stage = value; index += 1; break;
      case '--table-wrapper': options.tableWrapper = value; index += 1; break;
      case '--thead': options.thead = value; index += 1; break;
      case '--skip-table': options.skipTable = true; break;
      case '--browser-executable': options.browserExecutable = value; index += 1; break;
      case '--help': case '-h': options.help = true; break;
      default: throw new Error(`unknown option: ${arg}`);
    }
  }
  if (!options.help && !options.url) throw new Error('--url is required');
  if (options.browserExecutable && !options.browserExecutable.trim()) throw new Error('--browser-executable must be a path');
  if (!Number.isFinite(options.wait) || options.wait < 0) throw new Error('--wait must be a non-negative number');
  return options;
}

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) {
    return import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
  }

  try {
    return await import('playwright');
  } catch (error) {
    const candidates = [process.cwd(), import.meta.url];
    for (const candidate of candidates) {
      try {
        const require = createRequire(join(dirname(candidate), 'package.json'));
        const resolved = require.resolve('playwright');
        return await import(pathToFileURL(resolved).href);
      } catch {}
    }
    throw new Error(`Playwright is not resolvable. Install it in the project or set PLAYWRIGHT_MODULE. (${error.message})`);
  }
}

async function metrics(page, selectors) {
  return page.evaluate((selectors) => {
    function box(selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        display: getComputedStyle(element).display,
        overflowX: getComputedStyle(element).overflowX,
        overflowY: getComputedStyle(element).overflowY
      };
    }
    return {
      scroll: box(selectors.scrollContainer),
      stage: box(selectors.stage),
      wrapper: selectors.tableWrapper ? box(selectors.tableWrapper) : null,
      thead: selectors.tableWrapper && !selectors.skipTable ? box(selectors.thead) : null
    };
  }, selectors);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const { chromium } = await loadPlaywright();
  const launchOptions = { headless: true };
  if (options.browserExecutable) launchOptions.executablePath = options.browserExecutable;
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: options.viewport[0], height: options.viewport[1] } });
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const checks = [];
  const selectors = {
    scrollContainer: options.scrollContainer,
    stage: options.stage,
    tableWrapper: options.skipTable ? '' : options.tableWrapper,
    thead: options.skipTable ? '' : options.thead
  };

  try {
    const response = await page.goto(options.url, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(options.wait);
    checks.push({ id: 'page-load', pass: Boolean(response?.ok()), detail: `HTTP ${response ? response.status() : 'no response'}` });

    const before = await metrics(page, selectors);
    if (!before.scroll || !before.stage) {
      checks.push({ id: 'scale-dom', pass: false, detail: `missing ${!before.scroll ? options.scrollContainer : options.stage}` });
    } else {
      const widthDelta = Math.abs(before.stage.width - before.scroll.clientWidth);
      checks.push({ id: 'stage-width', pass: widthDelta <= 2, detail: `stage=${before.stage.width.toFixed(1)}px container=${before.scroll.clientWidth}px delta=${widthDelta.toFixed(1)}px` });
      checks.push({ id: 'no-horizontal-overflow', pass: before.scroll.scrollWidth <= before.scroll.clientWidth + 1, detail: `scrollWidth=${before.scroll.scrollWidth} clientWidth=${before.scroll.clientWidth}` });
      if (before.scroll.scrollHeight > before.scroll.clientHeight + 2) {
        checks.push({ id: 'vertical-scroll', pass: before.scroll.overflowY === 'auto' || before.scroll.overflowY === 'scroll', detail: `overflowY=${before.scroll.overflowY}, scrollHeight=${before.scroll.scrollHeight}, clientHeight=${before.scroll.clientHeight}` });
      } else {
        checks.push({ id: 'vertical-scroll', pass: true, skipped: true, detail: 'no vertical overflow at this viewport' });
      }
    }

    if (!options.skipTable) {
      if (!before.wrapper) {
        checks.push({ id: 'table-wrapper', pass: false, detail: `missing ${options.tableWrapper}` });
      } else {
        checks.push({ id: 'table-vertical-overflow-only', pass: before.wrapper.scrollWidth <= before.wrapper.clientWidth + 1, detail: `scrollWidth=${before.wrapper.scrollWidth} clientWidth=${before.wrapper.clientWidth}` });
        if (before.wrapper.scrollHeight > before.wrapper.clientHeight + 2) {
          await page.evaluate((selector) => {
            document.querySelector(selector).scrollTop = document.querySelector(selector).scrollHeight;
          }, options.tableWrapper);
          await page.waitForTimeout(80);
          const after = await metrics(page, selectors);
          const first = before.thead.top - before.wrapper.top;
          const last = after.thead.top - after.wrapper.top;
          const headDelta = Math.abs(last - first);
          checks.push({ id: 'thead-sticky', pass: headDelta <= 2 && Math.abs(last) <= 2, detail: `header offset first=${first.toFixed(1)}px last=${last.toFixed(1)}px delta=${headDelta.toFixed(1)}px` });
          checks.push({ id: 'tbody-scrolls', pass: true, detail: `scrollHeight=${after.wrapper.scrollHeight} clientHeight=${after.wrapper.clientHeight}` });
        } else {
          checks.push({ id: 'tbody-scrolls', pass: true, skipped: true, detail: 'table rows do not overflow at this viewport' });
        }
      }
    }

    checks.push({ id: 'console-errors', pass: consoleErrors.length === 0, detail: consoleErrors.length ? consoleErrors.join(' | ') : 'none' });
  } finally {
    await browser.close();
  }

  process.stdout.write(`${JSON.stringify({
    url: options.url,
    viewport: `${options.viewport[0]}x${options.viewport[1]}`,
    pass: checks.every((check) => check.pass),
    checks
  }, null, 2)}\n`);
  process.exitCode = checks.every((check) => check.pass) ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
