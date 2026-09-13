#!/usr/bin/env node
/**
 * layout-infer.mjs — Figma 节点树 → 布局意图树(〇节协议的布局推导工具)
 *
 * CLI 用法: node layout-infer.mjs <node-info.json> [--min-rep 3]
 *   打印布局树,每节点标注 layout: row|column|grid-repeat|xy-split|flow|abs-overlay
 *   gap 取中位数吸收手摆误差
 *
 * API 用法(供 build-ir.mjs 等复用):
 *   import { layoutTree } from './layout-infer.mjs';
 *   const tree = layoutTree(rootNode);   // 会把 rootNode 的 bbox 原地归一化为帧相对坐标
 *
 * 算法(业界 layout-inference 管线):
 *   1) 背景过滤:面积 ≥ 父盒 90% 的实心矩形不参与布局
 *   2) row/column:兄弟排序后投影重叠 >60% 且相邻不重叠;gap 取中位数
 *   3) grid-repeat:等尺寸(±2px)等距(±3px)≥3
 *   4) xy-split:最大空白带(容忍 2px 重叠)切一刀递归
 *   5) 兜底:abs-overlay 白名单
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MIN_REP = Number(process.argv.includes('--min-rep') ? process.argv[process.argv.indexOf('--min-rep') + 1] : 3);

// 宽容加载:MCP 落盘可能是裸节点 JSON,也可能是 [{type,text}] 包装(text 内嵌 JSON 字符串)
export function loadJson(file) {
  let obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(obj)) {
    const part = obj.find(p => typeof p.text === 'string' && /^\s*[{\[]/.test(p.text));
    if (!part) throw new Error('包装格式里找不到 JSON 段: ' + file);
    obj = JSON.parse(part.text);
  }
  return obj;
}

const box = (n) => {
  const b = n.absoluteBoundingBox || {};
  return { x: b.x ?? 0, y: b.y ?? 0, w: b.width ?? 0, h: b.height ?? 0 };
};
const med = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const overlapY = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
const overlapX = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);

// 坐标归一化:整棵树的 bbox 改写为帧相对坐标(原地)
export function normalize(rootNode) {
  // 先取原点"值"再遍历——若持有 bbox 对象引用,根节点归一化会把原点改成 0,子孙全部失效
  const bb = rootNode.absoluteBoundingBox || { x: 0, y: 0 };
  const ox = bb.x, oy = bb.y;
  (function walk(n) {
    const b = n.absoluteBoundingBox;
    if (b) { b.x -= ox; b.y -= oy; }
    for (const c of n.children || []) walk(c);
  })(rootNode);
}

function infer(children, depth, parentBox) {
  if (children.length === 0) return null;
  // 背景过滤:盒面积 ≥ 父盒 90% 的实心矩形视为背景,不参与布局推导
  // (bg 保留完整节点:几何/填充对代码生成有用,如表格斑马纹)
  if (parentBox) {
    const bg = children.filter(n => {
      const b = box(n);
      return b.w * b.h >= parentBox.w * parentBox.h * 0.9;
    });
    if (bg.length && children.length > bg.length) {
      const rest = infer(children.filter(n => !bg.includes(n)), depth, parentBox) || { layout: 'flow' };
      return { layout: rest.layout, bg, ...rest };
    }
  }
  if (children.length === 1) return { layout: 'flow', child: children[0] };

  const boxes = children.map(box);
  // row/column 判定(先按 x/y 排序——设计稿兄弟次序不可靠):
  // 相邻投影重叠 >60% 最小边,且后者的起点 ≥ 前者终点-1(重叠即叠加,非行列)
  const minH = Math.min(...boxes.map(b => b.h));
  const minW = Math.min(...boxes.map(b => b.w));
  const byX = [...children].sort((a, b) => box(a).x - box(b).x);
  const byY = [...children].sort((a, b) => box(a).y - box(b).y);
  const bx = byX.map(box), by = byY.map(box);
  const rowOK = bx.every((b, i) => i === 0 || (overlapY(bx[i - 1], b) > minH * 0.6 && b.x >= bx[i - 1].x + bx[i - 1].w - 1));
  const colOK = by.every((b, i) => i === 0 || (overlapX(by[i - 1], b) > minW * 0.6 && b.y >= by[i - 1].y + by[i - 1].h - 1));

  const tryRepeat = (sorted, axis) => {
    if (sorted.length < MIN_REP) return null;
    const b0 = box(sorted[0]);
    const sameSize = sorted.every(c => {
      const b = box(c);
      return Math.abs(b.w - b0.w) <= 2 && Math.abs(b.h - b0.h) <= 2;
    });
    if (!sameSize) return null;
    const gaps = sorted.slice(1).map((c, i) => {
      const b = box(c), p = box(sorted[i]);
      return axis === 'x' ? b.x - (p.x + p.w) : b.y - (p.y + p.h);
    });
    const g = med(gaps);
    if (gaps.every(d => Math.abs(d - g) <= 3)) return { gap: Math.round(g * 10) / 10 };
    return null;
  };

  if (rowOK) {
    const rep = tryRepeat(byX, 'x');
    if (rep) return { layout: 'grid-repeat', dir: 'x', count: children.length, ...rep, children: byX };
    const gaps = [];
    byX.slice(1).forEach((c, i) => gaps.push(box(c).x - (box(byX[i]).x + box(byX[i]).w)));
    return { layout: 'row', gap: Math.round(med(gaps) * 10) / 10, children: byX };
  }
  if (colOK) {
    const rep = tryRepeat(byY, 'y');
    if (rep) return { layout: 'grid-repeat', dir: 'y', count: children.length, ...rep, children: byY };
    const gaps = [];
    byY.slice(1).forEach((c, i) => gaps.push(box(c).y - (box(byY[i]).y + box(byY[i]).h)));
    return { layout: 'column', gap: Math.round(med(gaps) * 10) / 10, children: byY };
  }

  // XY 切割:找 x/y 方向最大空白带;容忍 2px 手摆重叠(切在重叠中点)
  const cuts = [];
  const scanAxis = (axis) => {
    const ivs = boxes.map(b => axis === 'x' ? [b.x, b.x + b.w] : [b.y, b.y + b.h]).sort((a, b) => a[0] - b[0]);
    let cur = ivs[0][1];
    for (const [s, e] of ivs.slice(1)) {
      if (s >= cur - 2) cuts.push({ axis, at: (s + cur) / 2, size: s - cur });
      cur = Math.max(cur, e);
    }
  };
  scanAxis('x'); scanAxis('y');
  if (cuts.length) {
    cuts.sort((a, b) => b.size - a.size);
    const c = cuts[0];
    const A = children.filter(n => (c.axis === 'x' ? box(n).x + box(n).w / 2 : box(n).y + box(n).h / 2) < c.at);
    const B = children.filter(n => !A.includes(n));
    if (A.length && B.length) {
      const pb = parentBox || { x: Math.min(...boxes.map(b => b.x)), y: Math.min(...boxes.map(b => b.y)) };
      const rel = c.axis === 'x' ? Math.round(c.at - pb.x) : Math.round(c.at - pb.y);
      return { layout: 'xy-split', axis: c.axis, at: rel, groups: [infer(A, depth + 1), infer(B, depth + 1)].filter(Boolean) };
    }
  }
  return { layout: 'abs-overlay', children };
}

// ============ 导出:可序列化布局树(供 build-ir.mjs 等复用) ============
function toNode(n) {
  const b = box(n);
  const e = {
    id: n.id, name: n.name || '', type: n.type,
    bbox: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) },
  };
  if (n.type === 'TEXT') {
    e.text = (n.characters || '').slice(0, 80);
    const s = n.style || {};
    e.font = { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, lineHeight: Math.round((s.lineHeightPx || 0) * 10) / 10 };
    const f = (n.fills || []).find(f => f.type === 'SOLID' && f.visible !== false && f.color);
    if (f) e.color = f.color;
  }
  if ((n.fills || []).some(f => f.type === 'IMAGE')) e.hasImage = true;
  if (n.cornerRadius) e.radius = n.cornerRadius;
  return e;
}

export function layoutTree(rootNode) {
  normalize(rootNode);   // 帧相对坐标(原地归一化,调用方传入自己的数据副本)
  // infer 结果 → 可序列化 group:child(flow 单子)/children(平铺)/groups(嵌套切割)三种形态都要接住,
  // 否则 kids 为空 → bbox 对空数组取 Math.min 得 Infinity(JSON 出来是 null)——2026-09-04 修
  function groupLeaves(g, out) {
    if (!g) return out;
    if (g.child) out.push(g.child);
    (g.children || []).forEach(c => out.push(c));
    (g.groups || []).forEach(nested => groupLeaves(nested, out));
    (g.bg || []).forEach(bgn => out.push(bgn));
    return out;
  }
  const toBgNode = (n) => {
    const b = box(n);
    return {
      name: n.name || '', type: n.type,
      bbox: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) },
      fill: (n.fills || []).find(f => f.type === 'SOLID' && f.visible !== false)?.color || null,
      radius: n.cornerRadius || null,
    };
  };
  function serializeGroup(g) {
    if (!g) return { layout: 'flow', bbox: null, children: [] };
    const e = { layout: g.layout };
    if (g.gap !== undefined) e.gap = g.gap;
    if (g.count) { e.count = g.count; e.dir = g.dir; }
    if (g.bg) e.bg = g.bg.map(toBgNode);
    if (g.layout === 'xy-split') { e.axis = g.axis; e.at = g.at; }
    if (g.layout === 'xy-split') {
      e.groups = (g.groups || []).filter(Boolean).map(serializeGroup);
    } else if (g.child) {
      e.children = [build(g.child)];           // 单子节点链(flow),勿丢失
    } else {
      e.children = (g.children || []).map(build);
    }
    const bs = groupLeaves(g, []).map(box);    // bbox 从全部下游叶子算,嵌套也不丢
    e.bbox = bs.length ? {
      x: Math.round(Math.min(...bs.map(b => b.x))), y: Math.round(Math.min(...bs.map(b => b.y))),
      w: Math.round(Math.max(...bs.map(b => b.x + b.w)) - Math.min(...bs.map(b => b.x))),
      h: Math.round(Math.max(...bs.map(b => b.y + b.h)) - Math.min(...bs.map(b => b.y))),
    } : null;
    return e;
  }
  function build(n) {
    const e = toNode(n);
    if (n.children?.length) {
      const inf = infer(n.children, 0, box(n));
      e.layout = inf.layout;
      if (inf.gap !== undefined) e.gap = inf.gap;
      if (inf.count) { e.count = inf.count; e.dir = inf.dir; }
      if (inf.bg) e.bg = inf.bg.map(toBgNode);
      if (inf.layout === 'xy-split') {
        e.axis = inf.axis; e.at = inf.at;
        e.groups = (inf.groups || []).filter(Boolean).map(serializeGroup);
      } else if (inf.child) {
        e.children = [build(inf.child)];   // 单子节点链(flow),勿丢失
      } else {
        e.children = (inf.children || []).map(build);
      }
    }
    return e;
  }
  return build(rootNode);
}

// ============ CLI ============
const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  const root = loadJson(process.argv[2]);
  normalize(root);
  console.log(`# 布局意图树:${root.name} ${Math.round(box(root).w)}x${Math.round(box(root).h)}(min-repeat=${MIN_REP})`);
  (function dump(node, d) {
    const b = box(node);
    const pad = '  '.repeat(d);
    const inf = node.children && node.children.length ? infer(node.children, d, b) : null;
    let line = pad + (node.name || node.type) + `  [${Math.round(b.w)}x${Math.round(b.h)}]`;
    if (inf) {
      const tag = inf.layout === 'grid-repeat' ? `grid-repeat×${inf.count} gap=${inf.gap}(${inf.dir})`
        : inf.layout === 'row' || inf.layout === 'column' ? `${inf.layout} gap=${inf.gap}`
        : inf.layout === 'xy-split' ? `split(${inf.axis}@${inf.at})` : inf.layout;
      console.log(line + '  →  ' + tag);
      if (inf.bg) console.log('  '.repeat(d + 1) + `(背景层:${inf.bg.map(n => n.name || n).join(',')} 不参与布局)`);
      if (inf.layout === 'xy-split') {
        inf.groups.forEach(g => {
          if (!g) return;
          const gp = '  '.repeat(d + 1);
          const tg = g.layout === 'xy-split' ? `split(${g.axis}@${g.at})` : `${g.layout} gap=${g.gap ?? ''}${g.count ? '×' + g.count : ''}`;
          console.log(gp + `· ${tg}`);
          if (g.layout === 'xy-split') g.groups.forEach(x => dumpG(x, d + 2));
          else (g.children || []).forEach(c => dump(c, d + 2));
        });
        function dumpG(g, dd) {
          if (!g) return;
          const tg = g.layout === 'xy-split' ? `split(${g.axis}@${g.at})` : `${g.layout} gap=${g.gap ?? ''}${g.count ? '×' + g.count : ''}`;
          console.log('  '.repeat(dd) + `· ${tg}`);
          if (g.layout === 'xy-split') g.groups.forEach(x => dumpG(x, dd + 1));
        }
      } else if (inf.children) {
        inf.children.forEach(c => dump(c, d + 1));
      }
    } else {
      console.log(line + (node.type === 'TEXT' ? ` "${(node.characters || '').slice(0, 24)}"` : ''));
    }
  })(root, 0);
}
