#!/usr/bin/env node
/**
 * verify-assets.mjs — validate the Figma asset manifest and source references.
 *
 * Usage:
 *   node verify-assets.mjs <project-root> [--manifest assets-manifest.json]
 *     [--node-info node-info.json] [--strict] [--json]
 *
 * Strict mode makes the manifest mandatory and requires every manifest
 * requiredNodeId to be covered by an exported asset, CSS mapping, or an
 * explicit ignored entry with a reason.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const projectArg = args.find((arg) => !arg.startsWith('--'));
const projectRoot = path.resolve(projectArg || process.cwd());
const manifestArg = valueAfter('--manifest') || 'assets-manifest.json';
const nodeInfoArg = valueAfter('--node-info');
const strict = args.includes('--strict');
const jsonOutput = args.includes('--json');

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

function result(ok, errors, warnings, details = {}) {
  return { pass: errors.length === 0, strict, projectRoot, errors, warnings, ...details };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizeProjectPath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null;
  const clean = rawPath.replaceAll('\\', '/').replace(/^\/+/, '');
  if (path.isAbsolute(rawPath) || clean.split('/').includes('..')) return null;
  const absolute = path.resolve(projectRoot, clean);
  return isInside(projectRoot, absolute) ? absolute : null;
}

async function imageInfo(filePath) {
  const buffer = await fs.readFile(filePath);
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { format: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (marker >= 0xc0 && marker <= 0xc3 && offset + 7 <= buffer.length) {
        return { format: 'jpeg', height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5), bytes: buffer.length };
      }
      offset += length;
    }
    return { format: 'jpeg', width: null, height: null, bytes: buffer.length };
  }
  if (path.extname(filePath).toLowerCase() === '.svg') {
    const text = buffer.toString('utf8');
    return { format: 'svg', width: null, height: null, bytes: buffer.length, valid: /<svg(?:\s|>)/i.test(text) };
  }
  return { format: 'unknown', width: null, height: null, bytes: buffer.length };
}

function collectNodeIds(value, out = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (typeof value.id === 'string' && typeof value.type === 'string') out.add(value.id);
  if (Array.isArray(value)) {
    for (const item of value) collectNodeIds(item, out);
  } else {
    for (const child of Object.values(value)) collectNodeIds(child, out);
  }
  return out;
}

async function sourceReferences() {
  const roots = [path.join(projectRoot, 'src'), path.join(projectRoot, 'index.html')];
  const files = [];
  async function walk(current) {
    let stat;
    try { stat = await fs.stat(current); } catch { return; }
    if (stat.isFile()) {
      if (/\.(vue|js|mjs|css|html)$/i.test(current)) files.push(current);
      return;
    }
    for (const name of await fs.readdir(current)) await walk(path.join(current, name));
  }
  for (const root of roots) await walk(root);
  const refs = [];
  const pattern = /(?:^|["'(`\s])\/?assets\/([^"'`)\s?#]+)/g;
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    let match;
    while ((match = pattern.exec(text))) refs.push({ file: path.relative(projectRoot, file).replaceAll('\\', '/'), path: `assets/${match[1]}` });
  }
  return refs;
}

async function main() {
  const errors = [];
  const warnings = [];
  let manifest = null;
  const manifestPath = path.resolve(projectRoot, manifestArg);
  try { manifest = await readJson(manifestPath); }
  catch (error) {
    if (strict) errors.push(`缺少素材清单 ${path.relative(projectRoot, manifestPath)}`);
    else warnings.push(`未找到素材清单 ${path.relative(projectRoot, manifestPath)}；使用 --strict 时将失败`);
  }

  const nodeIds = new Set();
  if (nodeInfoArg) {
    const nodeInfoPath = path.resolve(projectRoot, nodeInfoArg);
    try { collectNodeIds(await readJson(nodeInfoPath), nodeIds); }
    catch (error) { errors.push(`无法读取 node-info ${nodeInfoArg}: ${error.message}`); }
  }

  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  const cssNodes = Array.isArray(manifest?.cssNodes) ? manifest.cssNodes : [];
  const ignoredNodes = Array.isArray(manifest?.ignoredNodes) ? manifest.ignoredNodes : [];
  const requiredNodeIds = Array.isArray(manifest?.requiredNodeIds) ? manifest.requiredNodeIds : [];
  if (manifest) {
    for (const field of ['requiredNodeIds', 'assets', 'cssNodes', 'ignoredNodes']) {
      if (manifest[field] !== undefined && !Array.isArray(manifest[field])) errors.push(`${field} 必须是数组`);
    }
  }
  const covered = new Map();
  const paths = new Set();
  for (const [index, entry] of assets.entries()) {
    const label = `assets[${index}]`;
    if (!entry || typeof entry !== 'object') { errors.push(`${label} 必须是对象`); continue; }
    if (typeof entry.nodeId !== 'string' || !entry.nodeId) errors.push(`${label}.nodeId 缺失`);
    if (typeof entry.path !== 'string' || !entry.path) errors.push(`${label}.path 缺失`);
    if (entry.nodeId && covered.has(entry.nodeId)) errors.push(`nodeId 重复: ${entry.nodeId}`);
    if (entry.nodeId) covered.set(entry.nodeId, 'asset');
    const filePath = normalizeProjectPath(entry.path);
    if (!filePath) { errors.push(`${label}.path 必须是项目内相对路径且不能包含 ..: ${entry.path}`); continue; }
    if (!entry.path.replaceAll('\\', '/').startsWith('assets/')) errors.push(`${label}.path 必须位于 assets/ 目录: ${entry.path}`);
    if (paths.has(entry.path)) errors.push(`素材路径重复: ${entry.path}`);
    paths.add(entry.path);
    try {
      const info = await imageInfo(filePath);
      if (info.bytes === 0) errors.push(`${entry.path} 是空文件`);
      if (info.format === 'unknown' || info.valid === false) errors.push(`${entry.path} 不是有效 PNG/JPEG/SVG`);
      if (entry.expected?.width && info.width && Number(entry.expected.width) !== info.width) errors.push(`${entry.path} 宽度 ${info.width} != 期望 ${entry.expected.width}`);
      if (entry.expected?.height && info.height && Number(entry.expected.height) !== info.height) errors.push(`${entry.path} 高度 ${info.height} != 期望 ${entry.expected.height}`);
    } catch { errors.push(`素材不存在: ${entry.path}`); }
  }
  for (const [kind, list] of [['cssNodes', cssNodes], ['ignoredNodes', ignoredNodes]]) {
    for (const [index, entry] of list.entries()) {
      if (!entry?.nodeId) { errors.push(`${kind}[${index}].nodeId 缺失`); continue; }
      if (covered.has(entry.nodeId)) errors.push(`nodeId 重复覆盖: ${entry.nodeId}`);
      covered.set(entry.nodeId, kind === 'cssNodes' ? 'css' : 'ignored');
      if (kind === 'ignoredNodes' && (!entry.reason || !String(entry.reason).trim())) errors.push(`${kind}[${index}] 必须填写 reason`);
    }
  }
  for (const nodeId of requiredNodeIds) {
    if (!covered.has(nodeId)) errors.push(`Figma 节点未覆盖: ${nodeId}；请导出素材、登记 cssNodes，或填写带原因的 ignoredNodes`);
    if (nodeIds.size && !nodeIds.has(nodeId)) warnings.push(`manifest 节点 ${nodeId} 不存在于 node-info`);
  }
  if (strict && !manifest?.version) errors.push('素材清单必须包含 version: 1');
  if (strict && manifest?.version !== 1) errors.push(`素材清单 version 必须为 1，当前为 ${manifest?.version ?? '缺失'}`);
  const references = await sourceReferences();
  for (const ref of references) {
    const filePath = normalizeProjectPath(ref.path);
    try { await fs.access(filePath); }
    catch { errors.push(`源码引用的素材不存在: ${ref.file} -> ${ref.path}`); }
  }

  const report = result(errors.length === 0, errors, warnings, {
    manifest: manifest ? path.relative(projectRoot, manifestPath).replaceAll('\\', '/') : null,
    assetCount: assets.length,
    coveredNodeCount: covered.size,
    sourceReferences: references
  });
  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`素材检查: ${report.pass ? 'PASS' : 'FAIL'} (${assets.length} 个清单素材, ${covered.size} 个节点映射)`);
    for (const warning of warnings) console.warn(`WARN ${warning}`);
    for (const error of errors) console.error(`ERROR ${error}`);
  }
  process.exitCode = report.pass ? 0 : 1;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; });
