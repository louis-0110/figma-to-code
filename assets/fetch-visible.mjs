#!/usr/bin/env node
/**
 * fetch-hidden.mjs — Figma REST API 拉全量节点树(含 visible)→ 隐藏节点清单
 * MCP 不序列化 visible 的根治方案。
 *
 * 用法: node fetch-hidden.mjs <file-key> [frameName]
 *   token 从 ../.secrets/env 或环境变量 FIGMA_TOKEN 读取
 *   frameName 过滤某个顶层 Frame(缺省输出全部)
 * 输出:
 *   1) <frameName>.hidden.json — 隐藏节点数组(id/name/type/bbox/父链)
 *   2) 终端摘要(父级隐藏 → 子树整棵不渲染,按"顶层隐藏祖先"归并输出)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const [fileKey, frameName] = process.argv.slice(2);
// token 三级查找链:环境变量 → ~/.secrets/figma(机器级,跨项目)→ 项目 .secrets/env
function findToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN;
  const candidates = [
    path.join(os.homedir(), '.secrets', 'figma'),
    path.resolve(process.cwd(), '.secrets', 'env'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, 'utf8');
    const t = raw.match(/FIGMA_TOKEN=(.+)/)?.[1]?.trim() || raw.trim();
    if (t) return t;
  }
  return null;
}
const token = findToken();
if (!token || !fileKey) {
  console.error('用法: node fetch-hidden.mjs <file-key> [frameName](token 需在 .secrets/env 或 FIGMA_TOKEN)');
  process.exit(1);
}

const res = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
  headers: { 'X-Figma-Token': token }
});
if (!res.ok) { console.error('REST 失败:', res.status, (await res.text()).slice(0, 200)); process.exit(1); }
const doc = await res.json();
console.log('文件:', doc.name);

// 遍历 document 树:visible !== false 的节点才是渲染树;false 即隐藏(子树整棵不渲染)
const hidden = [];
let visibleCount = 0;
(function walk(n, chain, hiddenByAncestor) {
  const isHidden = n.visible === false;
  if (isHidden && !hiddenByAncestor) {
    // 顶层隐藏祖先(它之下全部不渲染,归并到它)
    hidden.push({
      id: n.id, name: n.name, type: n.type,
      bbox: n.absoluteBoundingBox || null,
      parentChain: chain.slice(-3).map(p => p.name || p.type).join(' / '),
      subtreeNote: '其子树整棵不渲染'
    });
    // 继续走子树只为统计,不再重复记录
    let sub = 0;
    (function count(c) { sub++; (c.children || []).forEach(count); })(n);
    hidden[hidden.length - 1].subtreeNodes = sub;
  } else if (!isHidden) visibleCount++;
  for (const c of n.children || []) walk(c, [...chain, n], hiddenByAncestor || isHidden);
})(doc.document, [], false);

console.log(`\n可见节点 ${visibleCount},顶层隐藏节点 ${hidden.length}(含子树共 ${hidden.reduce((s, h) => s + (h.subtreeNodes || 0), 0)} 节点):`);
for (const h of hidden) {
  const bb = h.bbox ? ` @(${Math.round(h.bbox.x)},${Math.round(h.bbox.y)})` : '';
  console.log(`  ${h.id.padEnd(14)} ${(h.name || '').slice(0, 36).padEnd(38)} ${h.type.padEnd(10)}${bb} +${h.subtreeNodes}子节点  ← ${h.parentChain}`);
}
const out = path.resolve(process.cwd(), `${frameName || doc.name}.hidden.json`);
fs.writeFileSync(out, JSON.stringify(hidden, null, 2));
console.log('\n已写入', out);
