#!/usr/bin/env node
/**
 * verify-runtime.mjs — offline/runtime preflight for Vue2 no-build projects.
 *
 * Usage:
 *   node verify-runtime.mjs <project-root> [--strict] [--json]
 *
 * The check is deliberately static: it catches broken local script/style URLs,
 * CDN drift and incorrect bootstrap order before a browser is launched.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const projectRoot = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : process.cwd());
const strict = args.includes('--strict');
const jsonOutput = args.includes('--json');

const coreFiles = [
  'lib/vue.min.js',
  'lib/vue2-sfc-loader.js',
  'lib/screen-scale.js',
  'lib/iview.min.js',
  'lib/iview.css'
];

function cleanHtml(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (match) => /\bsrc\s*=\s*['"]/i.test(match) ? match : '');
}

function localPath(raw) {
  if (!raw || /^(?:data:|javascript:|mailto:|#)/i.test(raw)) return null;
  if (/^(?:https?:)?\/\//i.test(raw)) return { remote: true, raw };
  const withoutQuery = raw.split(/[?#]/, 1)[0].replaceAll('\\', '/');
  const relative = withoutQuery.replace(/^\/+/, '');
  if (!relative || relative.split('/').includes('..')) return { invalid: true, raw };
  const absolute = path.resolve(projectRoot, relative);
  const resolvedRoot = path.resolve(projectRoot);
  const rel = path.relative(resolvedRoot, absolute);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return { invalid: true, raw };
  return { relative: relative.replaceAll('\\', '/'), absolute };
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function readSourceFiles() {
  const files = [];
  async function walk(directory) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(vue|js|mjs|css|html)$/i.test(entry.name)) files.push(full);
    }
  }
  await walk(path.join(projectRoot, 'src'));
  return files;
}

async function main() {
  const errors = [];
  const warnings = [];
  const indexPath = path.join(projectRoot, 'index.html');
  let html = '';
  try { html = await fs.readFile(indexPath, 'utf8'); }
  catch (error) { errors.push(`缺少入口 index.html: ${error.message}`); }

  const source = cleanHtml(html);
  const references = [];
  for (const match of source.matchAll(/\b(src|href)\s*=\s*["']([^"']+)["']/gi)) {
    references.push({ attribute: match[1].toLowerCase(), raw: match[2] });
  }

  const localReferences = [];
  for (const reference of references) {
    const parsed = localPath(reference.raw);
    if (!parsed) continue;
    if (parsed.remote) {
      const message = `禁止运行时远程依赖: ${reference.raw}`;
      (strict ? errors : warnings).push(message);
      continue;
    }
    if (parsed.invalid) {
      errors.push(`入口引用路径不安全或无效: ${reference.raw}`);
      continue;
    }
    localReferences.push({ ...reference, path: parsed.relative });
    if (!await exists(parsed.absolute)) errors.push(`入口引用文件不存在: ${parsed.relative}`);
  }

  for (const relative of coreFiles) {
    if (!await exists(path.join(projectRoot, relative))) errors.push(`缺少 Vue2 本地运行时: ${relative}`);
  }

  const allSources = [html];
  for (const file of await readSourceFiles()) {
    try { allSources.push(await fs.readFile(file, 'utf8')); } catch {}
  }
  const needsEcharts = allSources.some((item) => /(?:echarts|BaseChart)/i.test(item));
  if (needsEcharts && !await exists(path.join(projectRoot, 'lib/echarts.min.js'))) {
    errors.push('源码使用 ECharts/BaseChart，但缺少 lib/echarts.min.js');
  }

  const scripts = localReferences.filter((item) => item.attribute === 'src').map((item) => item.path);
  const mainIndex = scripts.findIndex((item) => /(?:^|\/)src\/main\.js$/i.test(item));
  const vueIndex = scripts.findIndex((item) => /(?:^|\/)lib\/vue\.min\.js$/i.test(item));
  const loaderIndex = scripts.findIndex((item) => /vue2-sfc-loader\.js$/i.test(item));
  if (mainIndex >= 0 && vueIndex >= 0 && mainIndex < vueIndex) errors.push('src/main.js 必须在 vue.min.js 之后加载');
  if (mainIndex >= 0 && loaderIndex >= 0 && mainIndex < loaderIndex) errors.push('src/main.js 必须在 vue2-sfc-loader.js 之后加载');
  if (strict && !scripts.some((item) => /screen-scale\.js$/i.test(item))) errors.push('index.html 必须加载 lib/screen-scale.js');

  const report = {
    pass: errors.length === 0,
    strict,
    projectRoot,
    errors,
    warnings,
    references: localReferences,
    requiredCoreFiles: coreFiles,
    needsEcharts
  };
  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`运行时检查: ${report.pass ? 'PASS' : 'FAIL'} (${localReferences.length} 个本地引用)`);
    for (const warning of warnings) console.warn(`WARN ${warning}`);
    for (const error of errors) console.error(`ERROR ${error}`);
  }
  process.exitCode = report.pass ? 0 : 1;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; });
