#!/usr/bin/env node
/**
 * build-ir.mjs — 分析产物固化成 IR(中间表示):生成阶段只读 IR,不回看原始树
 *
 * 用法:
 *   node build-ir.mjs <node-info.json> [--hidden hidden.json] [--tokens design-tokens.json]
 *                      [--out analysis.json] [--scan <scan落盘>] [--design design.png]
 *
 * IR 结构(analysis.json):
 *   frame            帧 meta(id/名称/尺寸)
 *   layoutTree       布局意图树(layout-infer,帧相对坐标,含文本样式/图片标记)
 *   texts[]          全部文本(帧坐标 + 字体规格 + 颜色)——供逐元素定位
 *   assets[]         含位图填充的节点(导出/裁剪清单)
 *   scrollCandidates 滚动区域候选(定高父容器内 column/grid-repeat 且内容超高)
 *   hidden[]         隐藏节点(REST 线索,须按 pipeline.md 仲裁后使用)
 *   tokens           引用的 design-tokens.json(meta)
 *
 * 兼容裸 JSON 与 [{type,text}] 包装。
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadJson, layoutTree } from './layout-infer.mjs';

const args = process.argv.slice(2);
const get = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const file = args[0];
if (!file) { console.error('用法: node build-ir.mjs <node-info.json> [--hidden x.json] [--tokens x.json] [--out analysis.json] [--scan x.json] [--design x.png]'); process.exit(1); }

const root = loadJson(file);
const origin = root.absoluteBoundingBox || { x: 0, y: 0 };
const frame = { id: root.id, name: root.name, width: Math.round(root.absoluteBoundingBox.width), height: Math.round(root.absoluteBoundingBox.height) };

// 布局树(内部会把树归一化)
const tree = layoutTree(root);

// 展平文本 / 素材 / 滚动候选
const texts = [], assets = [], scrollCandidates = [];
(function walk(n) {
  if (n.type === 'TEXT') {
    texts.push({ id: n.id, text: n.text, bbox: n.bbox, font: n.font, color: n.color || null });
  }
  if (n.hasImage) assets.push({ id: n.id, name: n.name, bbox: n.bbox, type: n.type });
  // 滚动候选:column/grid-repeat(y 向)且子项总高 > 父高 60%,父高 ≥200
  if ((n.layout === 'grid-repeat' && n.dir === 'y' || n.layout === 'column') && n.bbox && n.bbox.h >= 200 && n.children?.length) {
    const ch = n.children.reduce((s, c) => s + (c.bbox?.h || 0), 0) + ((n.gap || 0) * Math.max(0, n.children.length - 1));
    if (ch > n.bbox.h * 0.6) scrollCandidates.push({ node: n.name || n.id || (n.layout + '@' + n.bbox.x + ',' + n.bbox.y), bbox: n.bbox, contentH: Math.round(ch), note: '定高容器内容超出/恰满 → 内容区滚动(表头吸顶如为表格)' });
  }
  for (const c of n.children || []) walk(c);
  // bg 层(背景矩形,含斑马纹等)也参与素材/墨迹统计
  if (Array.isArray(n.bg)) for (const bgn of n.bg) walk(bgn);
  // 嵌套 xy-split:groups 内可能还有 groups,必须整组递归(2026-09-04 修:
  // 原来只 forEach g.children,嵌套组内容全部漏掉)
  if (n.groups) for (const g of n.groups) walk(g);
})(tree);

// 隐藏节点(REST 线索;仲裁规则见 pipeline.md 步 3)
let hidden = [];
const hiddenFile = get('--hidden');
if (hiddenFile && fs.existsSync(hiddenFile)) {
  hidden = JSON.parse(fs.readFileSync(hiddenFile, 'utf8')).map(h => ({
    id: h.id, name: h.name, type: h.type, bbox: h.bbox, parentChain: h.parentChain, subtreeNodes: h.subtreeNodes,
  }));
}

// tokens 引用
let tokensRef = null;
const tokensFile = get('--tokens');
if (tokensFile && fs.existsSync(tokensFile)) tokensRef = { file: path.basename(tokensFile), meta: JSON.parse(fs.readFileSync(tokensFile, 'utf8')).meta };

const scanFile = get('--scan');
const ir = {
  irVersion: 1,
  frame,
  layoutTree: tree,
  texts,
  assets,
  scrollCandidates,
  hidden,
  tokens: tokensRef,
  sources: { nodeInfo: path.basename(file), hidden: hiddenFile ? path.basename(hiddenFile) : null, scan: scanFile ? path.basename(scanFile) : null, design: get('--design') || null },
};

const out = get('--out') || 'analysis.json';
fs.writeFileSync(out, JSON.stringify(ir, null, 2) + '\n');
console.log(`IR → ${out}`);
console.log(`帧 ${frame.name} ${frame.width}x${frame.height} | 文本 ${texts.length} | 素材 ${assets.length} | 滚动候选 ${scrollCandidates.length} | 隐藏 ${hidden.length}`);
if (scrollCandidates.length) scrollCandidates.forEach(s => console.log(`  滚动候选: ${s.node} @(${s.bbox.x},${s.bbox.y}) 内容高 ${s.contentH}`));
