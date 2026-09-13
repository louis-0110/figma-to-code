#!/usr/bin/env node
/**
 * scan-tree.mjs — Figma get_node_info JSON → 紧凑树 + 功能信号统计(〇节协议第 2 步工具)
 * 用法: node scan-tree.mjs <node-info.json> [--text]
 * 输出: 缩进树(类型/名称/坐标x,y/尺寸/圆角/填充色)+ 文本清单 + 信号统计
 *       信号: 图标 instance 数、椭圆/矢量群、等宽矩形序列(柱图)、轴向文本、
 *            大数字、递归缩进(树)、横向长条+日期(甘特)…供 agent 按 feature-map 判据判定
 */
import fs from 'node:fs';

const file = process.argv[2];
const SHOW_TEXT = process.argv.includes('--text');
// 宽容加载:MCP 落盘可能是裸节点 JSON,也可能是 [{type,text}] 包装(text 内嵌 JSON 字符串)
function loadJson(file) {
  let obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(obj)) {
    const part = obj.find(p => typeof p.text === 'string' && /^\s*[{\[]/.test(p.text));
    if (!part) throw new Error('包装格式里找不到 JSON 段: ' + file);
    obj = JSON.parse(part.text);
  }
  return obj;
}
const root = loadJson(file);
const ox = root.absoluteBoundingBox?.x ?? 0;
const oy = root.absoluteBoundingBox?.y ?? 0;

const lines = [];
const texts = [];
const sig = {
  instances: 0, vectors: 0, ellipses: 0, rects: 0, frames: 0, texts: 0,
  smallIcons: 0,          // ≤48px instance
  equalRectRuns: [],      // 等宽矩形序列(柱图嫌疑)
  bigNumbers: [],         // 大数字文本(翻牌器嫌疑)
  dateLike: [],           // 日期/时间文本(甘特/日历嫌疑)
  indentTree: [],         // 递归缩进嫌疑(树)
  longBars: [],           // 横向长条(甘特/进度)
  chartWords: [],         // 命名含 chart/pie/bar/graph 等
};
const numRe = /^[\d,\.]+\s*(%|万|亿|k|K|M|G)?$/;

function fillOf(n) {
  const f = n.fills && n.fills[0];
  if (!f) return '';
  if (f.type === 'SOLID' && f.color) return f.color;
  if (f.type === 'GRADIENT_LINEAR') return 'gradient(' + (f.gradientStops || []).map(s => s.color).join('→') + ')';
  if (f.type === 'IMAGE') return 'image';
  return f.type;
}

function walk(n, depth, parent) {
  const b = n.absoluteBoundingBox || {};
  const x = Math.round((b.x ?? 0) - ox), y = Math.round((b.y ?? 0) - oy);
  const w = Math.round(b.width ?? 0), h = Math.round(b.height ?? 0);
  // 统计
  if (n.type === 'INSTANCE') { sig.instances++; if (w <= 48 && h <= 48 && w > 0) sig.smallIcons++; }
  if (n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION' || n.type === 'LINE') sig.vectors++;
  if (n.type === 'ELLIPSE') sig.ellipses++;
  if (n.type === 'RECTANGLE') {
    sig.rects++;
    if (w > 8 && w < 80 && h > 20 && h < 400) sig.equalRectRuns.push({ x, y, w, h });
  }
  if (n.type === 'FRAME' || n.type === 'GROUP') sig.frames++;
  if (n.type === 'TEXT') {
    sig.texts++;
    const ch = n.characters || '';
    const size = n.style?.fontSize || 0;
    texts.push({ ch, size, weight: n.style?.fontWeight, x, y, w, h, color: fillOf(n) });
    if (numRe.test(ch.trim()) && size >= 20) sig.bigNumbers.push({ ch, size, x, y });
    if (/月|日|周一|周二|Mon|Tue|202\d|Q[1-4]|\d{1,2}:\d{2}/.test(ch)) sig.dateLike.push({ ch, x, y });
    if (/[%\/→]/.test(ch) === false && ch.length > 30) { /* long desc */ }
  }
  if (/chart|pie|bar|graph|gantt|calendar|timeline|tree|map|3d|render|kanban|board|drag/i.test(n.name || '')) {
    sig.chartWords.push({ name: n.name, type: n.type, w, h });
  }
  // 横向长条(甘特嫌疑):宽>120 高<40 的填充矩形
  if ((n.type === 'RECTANGLE' || n.type === 'FRAME') && w > 120 && h > 0 && h < 40 && (n.fills || []).length && n.fills[0].type === 'SOLID') {
    sig.longBars.push({ name: n.name, x, y, w, h, c: fillOf(n) });
  }

  const t = n.type === 'TEXT' ? '' : n.type[0];
  lines.push('  '.repeat(depth) + `${n.type.padEnd(12)} ${(n.name || '').slice(0, 40).padEnd(40)} ${x},${y} ${w}x${h}` +
    (n.cornerRadius ? ` r${n.cornerRadius}` : '') + (fillOf(n) ? ` ${fillOf(n)}` : '') +
    (n.type === 'TEXT' ? ` "${(n.characters || '').slice(0, 30)}" ${n.style?.fontSize || ''}px` : ''));

  for (const c of n.children || []) walk(c, depth + 1, n);
}
walk(root, 0, null);

// 等宽矩形按 y 分组(同一行的柱序列)
const byRow = {};
for (const r of sig.equalRectRuns) { const k = Math.round(r.y / 10) * 10; (byRow[k] = byRow[k] || []).push(r); }
const barRuns = Object.entries(byRow).filter(([k, v]) => v.length >= 4).map(([k, v]) => `y≈${k} 柱数${v.length} 等宽${v[0].w}`);

console.log(`== 帧概览 == ${(root.name || '')} ${Math.round((root.absoluteBoundingBox?.width) || 0)}x${Math.round((root.absoluteBoundingBox?.height) || 0)}`);
console.log(`== 信号统计 ==`);
console.log(`instance:${sig.instances}(小图标≤48px:${sig.smallIcons}) vector:${sig.vectors} ellipse:${sig.ellipses} rect:${sig.rects} text:${sig.texts}`);
if (barRuns.length) console.log(`柱序列嫌疑(同行≥4等宽矩形): ${barRuns.join(' | ')}`);
if (sig.bigNumbers.length) console.log(`大数字嫌疑: ${sig.bigNumbers.map(b => `"${b.ch}"${b.size}px`).join(', ').slice(0, 200)}`);
if (sig.dateLike.length) console.log(`日期文本: ${sig.dateLike.map(d => `"${d.ch}"`).join(', ').slice(0, 200)}`);
if (sig.longBars.length > 2) console.log(`横向长条嫌疑(甘特/进度): ${sig.longBars.slice(0, 8).map(b => `${b.w}x${b.h}@${b.x},${b.y}`).join(' | ')}`);
if (sig.chartWords.length) console.log(`命名线索: ${sig.chartWords.map(c => `${c.name}(${c.type})`).slice(0, 10).join(', ')}`);
console.log(`\n== 节点树(前 220 行) ==`);
console.log(lines.slice(0, 220).join('\n'));
if (lines.length > 220) console.log(`…共 ${lines.length} 行`);
if (SHOW_TEXT) {
  console.log(`\n== 文本清单 ==`);
  console.log(texts.map(t2 => `${t2.x},${t2.y} ${t2.size}px/${t2.weight} ${t2.color} "${t2.ch}"`).join('\n'));
}
