#!/usr/bin/env node
import process from 'node:process';
import { loadPlaywright, resolveChromiumExecutable } from './playwright-runtime.mjs';

const DATA_QA_SELECTORS = {
  scrollContainer: '[data-qa="scale-viewport"]',
  stage: '[data-qa="stage"]',
  tableWrapper: '[data-qa="table-scroll"]',
  thead: '[data-qa="table-head"]',
  panelTabs: '[data-qa="panel-tabs"]',
  searchInput: '[data-qa="search-input"]',
  chartCanvas: '[data-qa="chart"]'
};

const FALLBACK_SELECTORS = {
  scrollContainer: ['.scale-viewport', '#viewport'],
  stage: ['.scale-stage', '#stage'],
  tableWrapper: ['.table-wrapper', '.table-scroll'],
  thead: ['thead'],
  panelTabs: ['.panel-tabs'],
  searchInput: ['input[type="search"]', '.search-input'],
  chartCanvas: ['canvas.chart', '.chart canvas']
};

function usage() {
  process.stdout.write(`Usage: node verify-ui.mjs --url <URL> [options]

Options:
  --viewport 1920x1080       Browser viewport (default: 1920x1080)
  --wait 1200                Settle wait after navigation in ms (default: 1200)
  --scroll-container sel     Scale scroll container (default: data-qa contract, then legacy selectors)
  --stage sel                Scale stage (default: data-qa contract, then legacy selectors)
  --table-wrapper sel        Table scroll wrapper (default: data-qa contract, then legacy selectors)
  --thead sel                Table header (default: data-qa contract, then thead)
  --skip-table               Skip table assertions
  --check-tabs               Click each tab button and verify table content changes
  --check-search TEXT        Type search text and verify row count changes
  --check-chart              Verify chart canvas exists with non-blank pixels
  --panel-tabs sel           Tab button container (default: data-qa contract, then legacy)
  --search-input sel         Search input selector (default: data-qa contract, then legacy)
  --chart-canvas sel         Chart canvas selector (default: data-qa contract, then legacy)
  --browser-executable PATH  Chromium executable (or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)

Selector contract:
  [data-qa="scale-viewport"], [data-qa="stage"],
  [data-qa="table-scroll"], [data-qa="table-head"],
  [data-qa="panel-tabs"], [data-qa="search-input"], [data-qa="chart"]

Legacy .scale-viewport / .scale-stage / .table-wrapper selectors remain supported.
`);
}

function parseArgs(argv) {
  const options = {
    url: '',
    viewport: [1920, 1080],
    wait: 1200,
    scrollContainer: null,
    stage: null,
    tableWrapper: null,
    thead: null,
    skipTable: false,
    checkTabs: false,
    checkSearch: '',
    checkChart: false,
    panelTabs: null,
    searchInput: null,
    chartCanvas: null,
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
      case '--check-tabs': options.checkTabs = true; break;
      case '--check-search': options.checkSearch = value || 'row'; index += 1; break;
      case '--check-chart': options.checkChart = true; break;
      case '--panel-tabs': options.panelTabs = value; index += 1; break;
      case '--search-input': options.searchInput = value; index += 1; break;
      case '--chart-canvas': options.chartCanvas = value; index += 1; break;
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

async function resolveSelector(page, explicit, candidates, label) {
  const selectors = explicit ? [explicit] : [DATA_QA_SELECTORS[label], ...candidates[label]];
  const found = await page.evaluate((selectorList) => {
    for (const selector of selectorList) {
      if (document.querySelector(selector)) return selector;
    }
    return '';
  }, selectors);

  if (!found) {
    const expected = selectors.join(', ');
    throw new Error(`UI selector not found for ${label}. Expected one of: ${expected}`);
  }
  return found;
}

async function resolveSelectors(page, options) {
  const selectors = {
    scrollContainer: await resolveSelector(page, options.scrollContainer, FALLBACK_SELECTORS, 'scrollContainer'),
    stage: await resolveSelector(page, options.stage, FALLBACK_SELECTORS, 'stage')
  };

  if (!options.skipTable) {
    selectors.tableWrapper = await resolveSelector(page, options.tableWrapper, FALLBACK_SELECTORS, 'tableWrapper');
    selectors.thead = await resolveSelector(page, options.thead, FALLBACK_SELECTORS, 'thead');
  } else {
    selectors.tableWrapper = '';
    selectors.thead = '';
  }

  if (options.checkTabs) {
    selectors.panelTabs = await resolveSelector(page, options.panelTabs, FALLBACK_SELECTORS, 'panelTabs');
  }
  if (options.checkSearch) {
    selectors.searchInput = await resolveSelector(page, options.searchInput, FALLBACK_SELECTORS, 'searchInput');
  }
  if (options.checkChart) {
    selectors.chartCanvas = await resolveSelector(page, options.chartCanvas, FALLBACK_SELECTORS, 'chartCanvas');
  }

  return selectors;
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

async function tabProbe(page, tabSelector, tableSelector) {
  const buttons = await page.$$(`${tabSelector} button`);
  if (buttons.length < 2) return { pass: true, detail: `only ${buttons.length} tab(s), skipping content-change assertion` };

  const headerTexts = [];
  for (const tab of buttons) {
    await tab.click();
    await page.waitForTimeout(200);
    const text = await page.$eval(tableSelector, (el) => {
      if (!el) return '';
      const table = el.querySelector('table') || el;
      const ths = table.querySelectorAll('th');
      return Array.from(ths).map((th) => th.textContent.trim()).join('|');
    });
    headerTexts.push(text);
  }
  const hasDiff = headerTexts.some((t, i) => i > 0 && t !== headerTexts[0]);
  return { pass: hasDiff, detail: `clicked ${buttons.length} tabs; header sets ${hasDiff ? 'change across tabs' : 'are identical (may indicate column set not wired)'}` };
}

async function searchProbe(page, inputSelector, wrapperSelector, text) {
  const rowSelector = `${wrapperSelector} tbody tr`;
  const beforeCount = await page.$$eval(rowSelector, (rows) => rows.length);
  await page.fill(inputSelector, text);
  await page.waitForTimeout(300);
  const afterCount = await page.$$eval(rowSelector, (rows) => rows.length);
  await page.fill(inputSelector, '');
  await page.waitForTimeout(200);
  const restoredCount = await page.$$eval(rowSelector, (rows) => rows.length);
  const changed = afterCount !== beforeCount;
  const restored = restoredCount === beforeCount;
  return { pass: changed && restored, detail: `before=${beforeCount} filtered=${afterCount} restored=${restoredCount} text="${text}" changed=${changed} restored=${restored}` };
}

async function chartProbe(page, canvasSelector) {
  return page.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    if (!canvas) return { pass: false, detail: 'canvas not found' };
    if (canvas.width === 0 || canvas.height === 0) return { pass: false, detail: `canvas has zero dimensions ${canvas.width}x${canvas.height}` };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { pass: false, detail: 'cannot get 2d context' };
    const w = Math.min(canvas.width, 200);
    const h = Math.min(canvas.height, 200);
    const data = ctx.getImageData(0, 0, w, h).data;
    let nonBlank = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) { nonBlank++; if (nonBlank > 10) break; }
    }
    return { pass: nonBlank > 10, detail: `canvas=${canvas.width}x${canvas.height} nonBlankPixels=${nonBlank} (checked ${w}x${h} region)` };
  }, canvasSelector);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const { chromium } = await loadPlaywright();
  const launchOptions = { headless: true };
  const executablePath = options.browserExecutable || await resolveChromiumExecutable();
  if (executablePath) launchOptions.executablePath = executablePath;
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: options.viewport[0], height: options.viewport[1] } });
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const checks = [];
  let selectors = {};
  try {
    const response = await page.goto(options.url, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(options.wait);
    checks.push({ id: 'page-load', pass: Boolean(response?.ok()), detail: `HTTP ${response ? response.status() : 'no response'}` });

    try {
      selectors = await resolveSelectors(page, options);
      checks.push({
        id: 'selector-contract',
        pass: true,
        detail: JSON.stringify(selectors)
      });
    } catch (error) {
      selectors = null;
      checks.push({ id: 'selector-contract', pass: false, detail: error.message });
    }

    if (selectors) {
      const before = await metrics(page, selectors);
      const widthDelta = Math.abs(before.stage.width - before.scroll.clientWidth);
      checks.push({ id: 'stage-width', pass: widthDelta <= 2, detail: `stage=${before.stage.width.toFixed(1)}px container=${before.scroll.clientWidth}px delta=${widthDelta.toFixed(1)}px` });
      checks.push({ id: 'no-horizontal-overflow', pass: before.scroll.scrollWidth <= before.scroll.clientWidth + 1, detail: `scrollWidth=${before.scroll.scrollWidth} clientWidth=${before.scroll.clientWidth}` });
      if (before.scroll.scrollHeight > before.scroll.clientHeight + 2) {
        checks.push({ id: 'vertical-scroll', pass: before.scroll.overflowY === 'auto' || before.scroll.overflowY === 'scroll', detail: `overflowY=${before.scroll.overflowY}, scrollHeight=${before.scroll.scrollHeight}, clientHeight=${before.scroll.clientHeight}` });
      } else {
        checks.push({ id: 'vertical-scroll', pass: true, skipped: true, detail: 'no vertical overflow at this viewport' });
      }

      if (!options.skipTable) {
        checks.push({ id: 'table-vertical-overflow-only', pass: before.wrapper.scrollWidth <= before.wrapper.clientWidth + 1, detail: `scrollWidth=${before.wrapper.scrollWidth} clientWidth=${before.wrapper.clientWidth}` });
        if (before.wrapper.scrollHeight > before.wrapper.clientHeight + 2) {
          await page.evaluate((selector) => {
            document.querySelector(selector).scrollTop = document.querySelector(selector).scrollHeight;
          }, selectors.tableWrapper);
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

      if (options.checkTabs && selectors.panelTabs) {
        try {
          const result = await tabProbe(page, selectors.panelTabs, selectors.tableWrapper);
          checks.push({ id: 'tab-column-sets', pass: result.pass, detail: result.detail });
        } catch (error) {
          checks.push({ id: 'tab-column-sets', pass: false, detail: error.message });
        }
      }

      if (options.checkSearch && selectors.searchInput) {
        try {
          const result = await searchProbe(page, selectors.searchInput, selectors.tableWrapper, options.checkSearch);
          checks.push({ id: 'search-filter', pass: result.pass, detail: result.detail });
        } catch (error) {
          checks.push({ id: 'search-filter', pass: false, detail: error.message });
        }
      }

      if (options.checkChart && selectors.chartCanvas) {
        try {
          const result = await chartProbe(page, selectors.chartCanvas);
          checks.push({ id: 'chart-canvas', pass: result.pass, detail: result.detail });
        } catch (error) {
          checks.push({ id: 'chart-canvas', pass: false, detail: error.message });
        }
      }
    }
    checks.push({ id: 'console-errors', pass: consoleErrors.length === 0, detail: consoleErrors.length ? consoleErrors.join(' | ') : 'none' });
  } finally {
    await browser.close();
  }

  const passed = checks.every((check) => check.pass);
  process.stdout.write(`${JSON.stringify({
    url: options.url,
    viewport: `${options.viewport[0]}x${options.viewport[1]}`,
    selectors,
    pass: passed,
    checks
  }, null, 2)}\n`);
  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
