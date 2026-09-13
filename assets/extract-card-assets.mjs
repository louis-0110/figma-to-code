#!/usr/bin/env node
/**
 * extract-card-assets.mjs — 卡片皮肤 + 图标素材提取(WP-A/WP-B)
 *
 * 解决:卡片背景/标题样式靠近似、图标没下载到项目——素材必须提取而非近似。
 *
 * 用法:
 *   node extract-card-assets.mjs <node-info.json> <design.png> <fileKey> <outDir> [--scale 2]
 *
 * 做四件事:
 *   1. 卡片检测:cornerRadius ≥ 8 且宽 ≥300 的背景节点,取其"更大祖先组"为整卡 bbox
 *   2. 卡片渐变采样:卡 bbox 四角(内缩 6px)取色 → 每卡一条 CSS 渐变(135deg TL→BR)
 *   3. 光效叠加导出:名为 Background Image 的 IMAGE 填充节点 → REST 批量导出(带透明)
 *   4. 图标普查:≤48px 的 INSTANCE/GROUP 及全部 IMAGE 填充小节点 → REST 批量导出落盘
 *
 * 输出:<outDir>/card-assets.json + skins/ + icons/(文件名 = id 冒号转下划线.png)
 * 依赖 pngjs(createRequire 链:cwd → 上级)。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const [infoFile, designPng, fileKey, outDir] = args.filter(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--scale');
const SCALE = Number(process.argv.includes('--scale') ? process.argv[process.argv.indexOf('--scale') + 1] : 2);
if (!infoFile || !designPng || !fileKey || !outDir) {
  console.error('用法: node extract-card-assets.mjs <node-info.json> <design.png> <fileKey> <outDir> [--scale 2]');
  process.exit(1);
}

function loadJson(f) {
  let obj = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (Array.isArray(obj)) {
    const part = obj.find(p => typeof p.text === 'string' && /^\s*[{\[]/.test(p.text));
    if (!part) throw new Error('包装格式里找不到 JSON 段: ' + f);
    obj = JSON.parse(part.text);
  }
  return obj;
}
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const { PNG } = req('pngjs');

const root = loadJson(infoFile);
const ox = root.absoluteBoundingBox.x, oy = root.absoluteBoundingBox.y;

const token =
  process.env.FIGMA_TOKEN ||
  (() => {
    for (const p of [path.join(os.homedir(), '.secrets', 'figma'), path.resolve(process.cwd(), '.secrets', 'env')]) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const t = raw.match(/FIGMA_TOKEN=(.+)/)?.[1]?.trim() || raw.trim();
        if (t) return t;
      }
    }
    return null;
  })();
if (!token) { console.error('找不到 Figma token(.secrets 链)'); process.exit(2); }

// ---- 1) 卡片检测:r≥8 宽≥300 的背景节点;整卡 bbox = 面积 ≥1.8 倍的最近祖先 ----
// (父组可能是被裁的渐变带,故向上找更大的容器;去重后每卡一条)
const cards = [];
const seenCard = new Set();
const withParents = [];
(function collect(n, ancestors) {
  for (const c of n.children || []) {
    withParents.push({ node: c, chain: [...ancestors, n] });
    collect(c, [...ancestors, n]);
  }
})(root, []);
for (const { node: c, chain } of withParents) {
  const b = c.absoluteBoundingBox;
  if (!(b && c.cornerRadius >= 8 && b.width >= 300)) continue;
  let holder = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const aB = chain[i].absoluteBoundingBox;
    if (aB && aB.width * aB.height >= b.width * b.height * 1.8) { holder = chain[i]; break; }
  }
  holder = holder || chain[chain.length - 2] || chain[chain.length - 1];
  if (!holder || seenCard.has(holder.id)) continue;
  seenCard.add(holder.id);
  const hb = holder.absoluteBoundingBox;
  cards.push({
    id: holder.id, name: (holder.name || '').slice(0, 24),
    bbox: { x: Math.round(hb.x - ox), y: Math.round(hb.y - oy), w: Math.round(hb.width), h: Math.round(hb.height) },
    overlays: [], icons: [],
  });
}
uniqSort(cards);

function uniqSort(list) {
  const seen = new Set();
  list.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  for (const c of [...list]) { const k = c.bbox.x + ',' + c.bbox.y; if (seen.has(k)) list.splice(list.indexOf(c), 1); else seen.add(k); }
}

// ---- 2) 渐变采样 + 光效/图标归属 ----
const img = PNG.sync.read(fs.readFileSync(designPng));
const px = (x, y) => {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return '#ffffff';
  const i = (img.width * y + x) << 2;
  return '#' + [img.data[i], img.data[i + 1], img.data[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
};
const iconNodes = [];
for (const c of cards) {
  const { x, y, w, h } = c.bbox;
  c.gradient = `linear-gradient(135deg, ${px(x + 6, y + 6)} 0%, ${px(x + Math.round(w / 2), y + Math.round(h / 2))} 50%, ${px(x + w - 6, y + h - 6)} 100%)`;
}
(function walk(n, card) {
  const b = n.absoluteBoundingBox || {};
  const rel = { x: Math.round((b.x || 0) - ox), y: Math.round((b.y || 0) - oy) };
  const w = Math.round(b.width || 0), h = Math.round(b.height || 0);
  const inCard = cards.find(k => rel.x >= k.bbox.x - 4 && rel.y >= k.bbox.y - 4 &&
    rel.x + w <= k.bbox.x + k.bbox.w + 60 && rel.y + h <= k.bbox.y + k.bbox.h + 60);
  if (/Background Image/i.test(n.name || '') && (n.fills || []).some(f => f.type === 'IMAGE')) {
    (inCard || card || { overlays: [] }).overlays.push({ id: n.id, rel });
  }
  const isSmall = n.type !== 'TEXT' && w > 4 && w <= 48 && h > 4 && h <= 48;
  const named = /icon|logo|badge|图标/i.test(n.name || '');
  const hasImg = (n.fills || []).some(f => f.type === 'IMAGE');
  if (isSmall && (named || hasImg) && n.type !== 'DOCUMENT') {
    (inCard || card || { icons: [] }).icons.push({ id: n.id, name: (n.name || '').slice(0, 30), rel, w, h });
  }
  for (const c of n.children || []) walk(c, inCard || card);
})(root, null);

// ---- REST 批量导出 ----
async function restExport(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const r = await fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${chunk.join(',')}&format=png&scale=${SCALE}`,
      { headers: { 'X-Figma-Token': token } });
    const d = await r.json();
    if (d.err) { console.error('REST 错误:', d.err); continue; }
    for (const [id, url] of Object.entries(d.images || {})) if (url) out[id] = url;
  }
  return out;
}

const overlayIds = [...new Set(cards.flatMap(c => c.overlays.map(o => o.id)))];
const iconIds = [...new Set(cards.flatMap(c => c.icons.map(i => i.id)))];
const ids = [...new Set([...overlayIds, ...iconIds])];
fs.mkdirSync(path.join(outDir, 'skins'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });

console.log(`卡片 ${cards.length} | 光效叠加 ${overlayIds.length} | 图标 ${iconIds.length}`);
let okN = 0;
if (ids.length) {
  const urls = await restExport(ids);
  for (const [id, url] of Object.entries(urls)) {
    if (!url) continue;
    try {
      const r = await fetch(url);
      const buf = Buffer.from(await r.arrayBuffer());
      const isOverlay = overlayIds.includes(id);
      fs.writeFileSync(path.join(outDir, isOverlay ? 'skins' : 'icons', id.replace(/[:;]/g, '_') + '.png'), buf);
      okN++;
    } catch (e) { console.error('下载失败', id, e.message); }
  }
  console.log(`已导出 ${okN}/${ids.length}`);
}

const cssCards = cards.map(c => ({
  bbox: c.bbox, name: c.name, gradient: c.gradient,
  overlays: c.overlays.map(o => ({ ...o, file: 'skins/' + o.id.replace(/[:;]/g, '_') + '.png' })),
  icons: c.icons.map(i => ({ ...i, file: 'icons/' + i.id.replace(/[:;]/g, '_') + '.png' })),
}));
fs.writeFileSync(path.join(outDir, 'card-assets.json'), JSON.stringify({ cards: cssCards }, null, 2) + '\n');
console.log(`card-assets.json → ${path.join(outDir, 'card-assets.json')}`);
