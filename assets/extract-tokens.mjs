#!/usr/bin/env node
/**
 * extract-tokens.mjs — 从 Figma 节点树提取设计 Token(〇节协议:生成前跑一次)
 *
 * 用法: node extract-tokens.mjs <node-info.json> [--out design-tokens.json] [--css tokens.css] [--top 12]
 * 输入:兼容裸 JSON 与 [{type,text}] 包装(MCP 两种落盘格式)
 * 输出:
 *   design-tokens.json — 结构化 Token(色板/字体/圆角/间距,按频次排序,含样例文本)
 *   tokens.css         — CSS 自定义属性骨架(text、fill、radius 变量;语义命名由 agent 依据用法定)
 *
 * 提取逻辑:
 *   色板   — SOLID fills/strokes,TEXT 节点的填充归 text-*,其余归 fill-*(alpha<100% 跳过)
 *   字体   — TEXT 节点的 family/size/weight/lineHeight 组合,记一条样例文本
 *   圆角   — cornerRadius > 0 的频次
 *   间距   — auto-layout 的 itemSpacing(无 auto-layout 的手摆间距由 layout-infer 的 gap 提供)
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const file = args[0];
const outJson = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'design-tokens.json';
const outCss = args.includes('--css') ? args[args.indexOf('--css') + 1] : null;
const TOP = Number(args.includes('--top') ? args[args.indexOf('--top') + 1] : 12);
if (!file) { console.error('用法: node extract-tokens.mjs <node-info.json> [--out x.json] [--css x.css] [--top 12]'); process.exit(1); }

// 宽容加载(MCP 两种落盘格式)
function loadJson(f) {
  let obj = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (Array.isArray(obj)) {
    const part = obj.find(p => typeof p.text === 'string' && /^\s*[{\[]/.test(p.text));
    if (!part) throw new Error('包装格式里找不到 JSON 段: ' + f);
    obj = JSON.parse(part.text);
  }
  return obj;
}
const root = loadJson(file);
const ox = root.absoluteBoundingBox?.x ?? 0, oy = root.absoluteBoundingBox?.y ?? 0;

const colors = new Map();   // key: usage|hex → {count, samples[]}
const typo = new Map();     // key: family|size|weight|lh → {count, sample}
const radius = new Map();
const spacing = new Map();
const solid = (f) => f && f.type === 'SOLID' && f.visible !== false && f.color && f.opacity !== 0;

function walk(n, parentIsText) {
  const isText = n.type === 'TEXT';
  // 色板
  for (const f of [...(n.fills || []), ...(n.strokes || [])]) {
    if (!solid(f)) continue;
    const usage = isText ? 'text' : (n.strokes || []).includes(f) ? 'border' : 'fill';
    const key = usage + '|' + f.color;
    const e = colors.get(key) || { usage, value: f.color, count: 0, samples: [] };
    e.count++;
    if (e.samples.length < 3) e.samples.push((n.characters || n.name || n.type).slice(0, 24));
    colors.set(key, e);
  }
  // 字体
  if (isText && n.style) {
    const s = n.style;
    const key = [s.fontFamily, s.fontSize, s.fontWeight, Math.round(s.lineHeightPx * 10) / 10].join('|');
    const e = typo.get(key) || { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, lineHeight: Math.round(s.lineHeightPx * 10) / 10, count: 0, sample: '' };
    e.count++;
    if (!e.sample) e.sample = (n.characters || '').slice(0, 24);
    typo.set(key, e);
  }
  // 圆角
  if (n.cornerRadius > 0) {
    radius.set(n.cornerRadius, (radius.get(n.cornerRadius) || 0) + 1);
  }
  // auto-layout 间距
  if (n.itemSpacing > 0) {
    spacing.set(n.itemSpacing, (spacing.get(n.itemSpacing) || 0) + 1);
  }
  for (const c of n.children || []) walk(c, isText);
}
walk(root, false);

const top = (map, n) => [...map.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.count - a.count).slice(0, n);

const tokens = {
  meta: { frame: root.name, frameId: root.id, size: `${Math.round(root.absoluteBoundingBox.width)}x${Math.round(root.absoluteBoundingBox.height)}` },
  colors: {
    text: top(new Map([...colors].filter(([, v]) => v.usage === 'text').map(([k, v]) => [k, v])), TOP),
    fill: top(new Map([...colors].filter(([, v]) => v.usage === 'fill').map(([k, v]) => [k, v])), TOP),
    border: top(new Map([...colors].filter(([, v]) => v.usage === 'border').map(([k, v]) => [k, v])), TOP),
  },
  typography: top(typo, TOP).map(({ key, ...t }) => t),
  radius: top(radius, 8).map(({ key, ...v }) => ({ value: Number(key), ...v })),
  spacing: top(spacing, 8).map(({ key, ...v }) => ({ value: Number(key), ...v })),
};

fs.writeFileSync(outJson, JSON.stringify(tokens, null, 2) + '\n');
console.log(`design-tokens → ${outJson}`);
console.log(`色板 text ${tokens.colors.text.length} / fill ${tokens.colors.fill.length} / border ${tokens.colors.border.length} | 字体 ${tokens.typography.length} | 圆角 ${tokens.radius.length} | 间距 ${tokens.spacing.length}`);

// CSS 变量骨架(频次序命名,语义重命名交给 agent)
if (outCss) {
  const lines = ['/* 由 extract-tokens.mjs 生成;变量名按频次序,语义重命名结合用法进行 */', ':root {'];
  tokens.colors.text.forEach((c, i) => lines.push(`  --text-${i + 1}: ${c.value}; /* ${c.count}次,如:${c.samples[0] || ''} */`));
  tokens.colors.fill.forEach((c, i) => lines.push(`  --fill-${i + 1}: ${c.value}; /* ${c.count}次,如:${c.samples[0] || ''} */`));
  tokens.typography.forEach((t, i) => lines.push(`  --font-${i + 1}: ${t.weight} ${t.size}px/${t.lineHeight}px '${t.family}', sans-serif; /* ${t.count}次,如:${t.sample} */`));
  tokens.radius.forEach((r, i) => lines.push(`  --radius-${i + 1}: ${r.value}px;`));
  lines.push('}');
  fs.writeFileSync(outCss, lines.join('\n') + '\n');
  console.log(`tokens.css → ${outCss}`);
}
