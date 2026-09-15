#!/usr/bin/env node
/**
 * Shared Playwright runtime discovery for verify-ui and the skill self-test.
 *
 * It supports three installation shapes:
 * 1. project-local node_modules/playwright;
 * 2. PLAYWRIGHT_MODULE supplied by the caller;
 * 3. the bundled Playwright that ships beside the active Node runtime.
 *
 * Browser discovery also reuses an existing Playwright browser cache when the
 * package version and cached browser revision differ.
 */
import { access, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const FILE_OK = path.win32.sep === '\\' ? 'win' : process.platform;

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

function moduleCandidates() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE);

  const runtimeNodeModules = path.resolve(path.dirname(process.execPath), '..', 'node_modules');
  candidates.push(
    path.resolve(process.cwd(), 'node_modules', 'playwright', 'index.mjs'),
    path.resolve(runtimeNodeModules, 'playwright', 'index.mjs')
  );
  return candidates;
}

async function resolveExplicitModule(candidate) {
  if (!candidate) return null;
  const absolute = path.resolve(candidate);
  if (await exists(absolute)) return absolute;
  const packageEntry = path.join(absolute, 'index.mjs');
  return await exists(packageEntry) ? packageEntry : null;
}

/** Return an absolute Playwright module entry, or null when unavailable. */
export async function resolvePlaywrightModule() {
  const explicit = await resolveExplicitModule(process.env.PLAYWRIGHT_MODULE);
  if (explicit) return explicit;

  try {
    await import('playwright');
    return 'playwright';
  } catch {}

  for (const candidate of moduleCandidates()) {
    const resolved = await resolveExplicitModule(candidate);
    if (resolved) return resolved;
  }

  const bases = [process.cwd(), path.dirname(process.execPath)];
  for (const base of bases) {
    try {
      const require = createRequire(path.join(base, 'package.json'));
      return require.resolve('playwright');
    } catch {}
  }
  return null;
}

/** Load Playwright using the same discovery rules as resolvePlaywrightModule. */
export async function loadPlaywright() {
  const resolved = await resolvePlaywrightModule();
  if (!resolved) {
    throw new Error('Playwright is not resolvable. Install it in the project or set PLAYWRIGHT_MODULE.');
  }
  if (resolved === 'playwright') return import('playwright');
  return import(pathToFileURL(resolved).href);
}

function browserRoots() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    return [path.resolve(process.env.PLAYWRIGHT_BROWSERS_PATH)];
  }
  const home = os.homedir();
  if (process.platform === 'win32') {
    return [process.env.LOCALAPPDATA, path.join(home, 'AppData', 'Local')]
      .filter(Boolean)
      .map((root) => path.join(root, 'ms-playwright'));
  }
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Caches', 'ms-playwright')];
  return [path.join(home, '.cache', 'ms-playwright')];
}

function browserRelativeCandidates() {
  if (process.platform === 'win32') {
    return [
      path.join('chrome-win64', 'chrome.exe'),
      path.join('chrome-win', 'chrome.exe'),
      path.join('chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
      path.join('chrome-win', 'headless_shell.exe')
    ];
  }
  if (process.platform === 'darwin') {
    return [
      path.join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      path.join('chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
    ];
  }
  return [
    path.join('chrome-linux', 'chrome'),
    path.join('chrome-linux64', 'chrome'),
    path.join('chrome-headless-shell-linux64', 'chrome-headless-shell')
  ];
}

function revisionSort(a, b) {
  const number = (name) => Number(name.match(/(\d+)$/)?.[1] || 0);
  return number(b).valueOf() - number(a).valueOf();
}

/**
 * Find a cached Chromium executable without downloading anything.
 * Explicit PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH always wins.
 */
export async function resolveChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const relativeCandidates = browserRelativeCandidates();
  for (const root of browserRoots()) {
    let entries;
    try { entries = await readdir(root, { withFileTypes: true }); } catch { continue; }
    const revisions = entries
      .filter((entry) => entry.isDirectory() && /^(?:chromium|chromium_headless_shell)-\d+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort(revisionSort);
    for (const revision of revisions) {
      for (const relative of relativeCandidates) {
        const executable = path.join(root, revision, relative);
        if (await exists(executable)) return executable;
      }
    }
  }
  return '';
}

export const runtimePlatform = FILE_OK;
