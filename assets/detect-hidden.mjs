#!/usr/bin/env node
/**
 * detect-hidden.mjs — 自动检测 Figma 隐藏节点(MCP 不序列化 visible 的绕行方案)
 *
 * 原理:scan_nodes_by_types 会跳过 visible:false 的顶层节点(实测 28:1320 缺席),
 *  而 get_node_info 返回全量(含隐藏)→ 两者差集 = 隐藏候选。
 *  差集噪声:scan 对 instance 深层子节点递归有限,3 层以下全部缺席(误报)——
 *  仅采信「顶层/浅层」候选,再用设计导出图墨迹验证(该区域空白 = 真隐藏)。
 *
 * 用法: node detect-hidden.mjs <get_node_info.json> <scan_nodes_by_types落盘.txt> <design.png> [帧宽 帧高]
 * 输出:确认隐藏的节点清单(含坐标),供还原管线剔除。
 *
 * 流程位置:〇节协议第 2 步(功能扫描)之后、生成之前必须跑一次。
 *
 * ⚠️ 已知局限(实测):
 *  1. 墨迹验证依赖树坐标,而 INSTANCE 子节点树坐标是源组件系(整体偏移可达 ~168px)
 *     → instance 子节点的"真隐藏/可见"判定会失真,只对**顶层节点**(坐标可信)可靠;
 *     instance 子节点候选应先像素定位真实区域再验,或交 get_selection 人工确认
 *  2. 同位叠加(隐藏变体 + 可见行)时,隐藏节点的区域墨迹来自叠加的可见行 → 误判"可见"
 *  3. 画布外节点墨迹测不到(脚本按越界判定为"舞台裁切,视觉无影响")
 *  4. 全遮挡节点(被上层图形盖住)墨迹法天然误判
 * 根治方案:Figma REST API GET /v1/files/:key 每节点带 visible 字段(需 personal access
 * token,超 MCP 范围);有 token 时优先 REST,本脚本是 MCP-only 环境的绕行。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

// pngjs 解析顺序:脚本同级 node_modules → 当前工作目录(如 diff-tool/)→ 报错提示
function loadPngjs() {
  const requires = [
    createRequire(import.meta.url),
    createRequire(path.join(process.cwd(), 'package.json')),
  ];
  for (const req of requires) {
    try { return req('pngjs'); } catch { /* try next */ }
  }
  console.error('缺少 pngjs:在含 pngjs 的目录运行(如 diff-tool/),或 npm i pngjs');
  process.exit(1);
}
const { PNG } = loadPngjs();

const [infoFile, scanFile, designFile, W = 1440, H = 1024] = process.argv.slice(2);
// 宽容加载:MCP 落盘可能是裸 JSON,也可能是 [{type,text}] 包装(text 内嵌 JSON 字符串)
function loadJson(file) {
  let obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(obj)) {
    const part = obj.find(p => typeof p.text === 'string' && /^\s*[{\[]/.test(p.text));
    if (!part) throw new Error('包装格式里找不到 JSON 段: ' + file);
    obj = JSON.parse(part.text);
  }
  return obj;
}
const root = loadJson(infoFile);
const ox = root.absoluteBoundingBox.x, oy = root.absoluteBoundingBox.y;

// scan 落盘文件:loadJson 兼容裸数组与 [{type,text}] 包装(找以 [ 开头的 text 段)
const scanArr = loadJson(scanFile);
const scanIds = new Set(scanArr.map(n => n.id));

// 全量树 → 每节点记录分号深度(instance 嵌套层)与帧内坐标
const all = [];
(function walk(n, depth, semi) {
  const b = n.absoluteBoundingBox || {};
  all.push({
    id: n.id, name: n.name, type: n.type, semi,
    x: Math.round((b.x || 0) - ox), y: Math.round((b.y || 0) - oy),
    w: Math.round(b.width || 0), h: Math.round(b.height || 0), depth
  });
  for (const c of n.children || []) walk(c, depth + 1, semi + (c.id.includes(';') ? 1 : 0));
})(root, 0, 0);

const diff = all.filter(n => !scanIds.has(n.id));
// 仅采信浅层候选:instance 嵌套 ≤1 层(scan 递归可达范围),且排除根自身
const candidates = diff.filter(n => n.semi <= 1 && n.id !== root.id);
console.log(`全量 ${all.length} | scan ${scanIds.size} | 差集 ${diff.length} | 浅层候选 ${candidates.length}`);

// 墨迹验证:候选区域在设计稿导出图中无墨 → 真隐藏
const img = PNG.sync.read(fs.readFileSync(designFile));
const inkAt = (x, y) => {
  const xi = Math.round(x * img.width / W), yi = Math.round(y * img.height / img.width * W / W * (W / img.width * img.width / W));
  return false; // placeholder
};
function regionHasInk(x0, y0, w, h) {
  const kx = img.width / W, ky = img.height / H;
  let cnt = 0, total = 0;
  for (let y = Math.max(0, Math.round(y0 * ky)); y < Math.min(img.height, Math.round((y0 + h) * ky)); y += 2) {
    for (let x = Math.max(0, Math.round(x0 * kx)); x < Math.min(img.width, Math.round((x0 + w) * kx)); x += 2) {
      const i = (img.width * y + x) << 2;
      const g = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      total++;
      if (g < 200) cnt++;
    }
  }
  return cnt / Math.max(1, total);
}

console.log('\n=== 隐藏节点判定(浅层候选 + 墨迹验证)===');
for (const c of candidates) {
  const offCanvas = c.y >= H || c.x >= W || c.x + c.w <= 0 || c.y + c.h <= 0;
  if (offCanvas) {
    console.log(`[画布外] ${c.id} ${c.name} @${c.x},${c.y} — 舞台裁切,视觉无影响,建议连 DOM 一并剔除`);
    continue;
  }
  const ink = regionHasInk(c.x, c.y, c.w, c.h);
  const verdict = ink < 0.005 ? '★真隐藏(区域全空白,应剔除)' : `可见(墨迹 ${(ink * 100).toFixed(1)}%,scan 深度误报)`;
  console.log(`${verdict.padEnd(1)} ${c.id} ${(c.name || '').slice(0, 30)} @${c.x},${c.y} ${c.w}x${c.h}`);
}
