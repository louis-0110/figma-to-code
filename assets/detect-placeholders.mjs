#!/usr/bin/env node
/**
 * detect-placeholders.mjs — catch fake icons and remote/runtime shortcuts
 * that commonly reduce Figma fidelity.
 *
 * Usage:
 *   node detect-placeholders.mjs <project-root> [--strict-icons] [--json]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const projectArg = args.find((arg) => !arg.startsWith('--'));
const projectRoot = path.resolve(projectArg || process.cwd());
const strictIcons = args.includes('--strict-icons');
const jsonOutput = args.includes('--json');

const suspiciousGlyphs = /[⚙⚒⚓⚡⌛⏳◉◎○●◌◍◈◇◆★☆✦✧]/u;
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const placeholderWords = /(?:TODO[_ -]?ICON|ICON[_ -]?(?:PLACEHOLDER|TODO)|PLACEHOLDER[_ -]?ICON|fake[-_ ]?icon)/i;
const iconMarkup = /<(?:Icon|i|span|svg)\b[^>]*(?:type\s*=|class\s*=\s*["'][^"']*(?:\bicon\b|ivu-icon|iconfont|fa-|icon-))/i;
const remoteImage = /(?:url\s*\(\s*["']?|(?:src|href)\s*=\s*["'])https?:\/\/[^\s'"\)]+\.(?:png|jpe?g|svg|webp|gif)(?:\?[^\s'"\)]*)?/i;
const sourceExtensions = new Set(['.vue', '.js', '.mjs', '.css', '.html']);

function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, (match) => '\n'.repeat((match.match(/\n/g) || []).length))
    .replace(/\/\*[\s\S]*?\*\//g, (match) => '\n'.repeat((match.match(/\n/g) || []).length))
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

async function filesUnder(directory, files = []) {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await filesUnder(full, files);
    else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

function lineAt(source, index) {
  const line = source.slice(0, index).split('\n').length;
  const start = source.lastIndexOf('\n', index - 1) + 1;
  return { line, column: index - start + 1 };
}

async function main() {
  const files = await filesUnder(path.join(projectRoot, 'src'));
  const indexPath = path.join(projectRoot, 'index.html');
  try { await fs.access(indexPath); files.push(indexPath); } catch {}
  const findings = [];
  for (const file of files) {
    const original = await fs.readFile(file, 'utf8');
    const source = stripComments(original);
    const relative = path.relative(projectRoot, file).replaceAll('\\', '/');
    const rules = [
      ['placeholder-glyph', suspiciousGlyphs],
      ['emoji-as-icon', emoji],
      ['placeholder-word', placeholderWords],
      ['remote-image-asset', remoteImage]
    ];
    for (const [rule, pattern] of rules) {
      const match = pattern.exec(source);
      if (match) {
        const position = lineAt(original, match.index);
        findings.push({ file: relative, rule, line: position.line, column: position.column, match: match[0] });
      }
    }
    if (strictIcons) {
      const match = iconMarkup.exec(source);
      if (match && !/data-figma-node\s*=/.test(source.slice(Math.max(0, match.index - 120), match.index + match[0].length + 120))) {
        const position = lineAt(original, match.index);
        findings.push({ file: relative, rule: 'unmapped-icon-markup', line: position.line, column: position.column, match: match[0].slice(0, 120), detail: '图标必须有 data-figma-node 或改用 assets-manifest 中的 Figma 导出资源' });
      }
    }
  }
  const report = { pass: findings.length === 0, strictIcons, projectRoot, findings };
  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`占位素材检查: ${report.pass ? 'PASS' : 'FAIL'} (${findings.length} 项)`);
    for (const finding of findings) console.error(`ERROR ${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.match}${finding.detail ? ` — ${finding.detail}` : ''}`);
  }
  process.exitCode = report.pass ? 0 : 1;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; });
