#!/usr/bin/env node
/**
 * normalize-ir.mjs — IR 虚拟规范化层(〇节协议步 4.6):把 build-ir 的布局树重排为
 * 「语义组件树 + 页面网格 + 模式匹配 + 切图建议」,生成阶段只读它,不再回看原始树。
 *
 * 动机(2026-09-07 edu-dashboard 复盘):手摆稿的还原度地板主要来自结构歧义——
 *   命名无语义(GROUP 8)、嵌套扁平(全部 abs-overlay)、间距手摆不均。
 * 不写回 Figma(插件无 re-parent/重命名命令),在 IR 上虚拟规范化,像素验收仍以原稿为准。
 *
 * 用法: node normalize-ir.mjs <analysis.json> [--out normalized.json]
 * 输入: build-ir 产物(analysis.json:layoutTree/texts/assets)
 * 输出: normalized.json
 *   page      帧尺寸
 *   grid      页面级栅格(列/行轨道 + 均一 gap 建议 + 手摆离群标记)
 *   components[]  {role,title,name,bbox,layoutHint,pattern,bake[]}
 *     role: topbar | card | unknown
 *     pattern.type: table | bar-list | rank-list | pagination | stat-blocks |
 *                   legend | kpi-stats | todo-items | chart | content
 *     bake[]: 建议切图的素材(bbox + 有无文字叠印)
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : null;
if (!file) { console.error('用法: node normalize-ir.mjs <analysis.json> [--out normalized.json]'); process.exit(1); }

const ir = JSON.parse(fs.readFileSync(file, 'utf8'));
const frame = ir.frame;
const root = ir.layoutTree;
const assets = ir.assets || [];

// ---------- 遍历辅助:group 描述符无 id/name,节点有 ----------
const kidsOf = (n) => [...(n.children || []), ...(n.groups || [])];
const isNode = (n) => n && n.id && n.type;
const bb = (n) => n.bbox || { x: 0, y: 0, w: 0, h: 0 };

// ---------- Stage 1: 展平出「顶层单元」(跳过背景层) ----------
const units = [];
(function walk(n, depth, path) {
  for (const c of kidsOf(n)) {
    const b = bb(c);
    if (!b.w && !b.h) continue;
    const entry = { node: c, depth, path: [...path, c.name || c.layout || '?'] };
    units.push(entry);
    // 顶层单元不再深入收集(模式匹配时再按需下钻)
    if (depth === 0) walk(c, depth + 1, entry.path);
  }
})(root, 0, []);

// 深度0 = root 的直接子级;深度1 = 卡片级。整理:直接子级里的整宽矮条 = topbar 候选
const top = [];
(function collect(n, depth) {
  for (const c of kidsOf(n)) {
    const b = bb(c);
    if (!b.w && !b.h) continue;
    top.push({ node: c, depth, bbox: b });
    collect(c, depth + 1);
  }
})(root, 0);

const frameW = frame.width, frameH = frame.height;
const isTopbar = (u) => u.bbox.h <= 90 && u.bbox.w >= frameW * 0.9;

// 卡片 = 深度≥1、尺寸≥300x150、非 topbar 的节点(含 group 描述符合并的容器)
const cards = [];
(function hunt(n, depth) {
  for (const c of kidsOf(n)) {
    const b = bb(c);
    if (!b.w && !b.h) continue;
    if (isTopbar({ bbox: b })) continue;
    if (depth >= 1 && b.w >= 300 && b.h >= 150 && b.w <= frameW * 0.7) {
      cards.push({ node: c, depth, bbox: b });
    }
    hunt(c, depth + 1); // 命中也要下钻:区域容器可能套着真卡片(containment 过滤会留内层)
  }
})(root, 0);
// 去重:同 bbox 只留最深;候选消歧——真卡片尺寸必有兄弟复用(sizeCount≥2 优先),
// 区域容器(吞了真卡)丢弃,真卡内的内容子区域丢弃
const seen = new Set();
const contains = (a, b) => a.x <= b.x + 4 && a.y <= b.y + 4 && a.x + a.w >= b.x + b.w - 4 && a.y + a.h >= b.y + b.h - 4;
function hasTitle(node) {
  const b = bb(node);
  return (function w(n) {
    if (n.type === 'TEXT' && n.font && n.font.size >= 18 && !/^[\d.%\s]+$/.test(n.text || '') && bb(n).y < b.y + b.h * 0.3) return true;
    return (n.children || []).some(w) || (n.groups || []).some(w);
  })(node);
}
const cands = cards.filter(c => c.bbox.h >= 180).filter(c => {
  const k = `${c.bbox.x},${c.bbox.y},${c.bbox.w},${c.bbox.h}`;
  if (seen.has(k)) return false; seen.add(k); return true;
});
const sizeCount = {};
for (const c of cands) {
  const k = `${c.bbox.w}x${c.bbox.h}`;
  sizeCount[k] = (sizeCount[k] || 0) + 1;
}
const preferred = cands.filter(c => sizeCount[`${c.bbox.w}x${c.bbox.h}`] >= 2);
const cardList = cands.filter(c => {
  const pref = preferred.includes(c);
  if (pref) return !preferred.some(o => o !== c && contains(c.bbox, o.bbox)); // 容器卡丢弃
  // 非优先:被优先卡包含 → 内容子区域,丢弃;包含优先卡 → 区域容器,丢弃
  const inside = preferred.some(o => contains(o.bbox, c.bbox));
  const wraps = preferred.some(o => contains(c.bbox, o.bbox));
  return !inside && !wraps;
});

// ---------- Stage 2: 卡片标题与命名 ----------
function findTitle(node, cb) {
  const b = bb(node);
  let best = null;
  (function w(n) {
    if (n.type === 'TEXT' && n.font && n.font.size >= 18 && !/^[\d.%\s]+$/.test(n.text || '') && bb(n).y < b.y + b.h * 0.3) {
      // 取最靠上,次选最靠左(标题在卡头,数值/图例值偏右或偏下)
      if (!best || bb(n).y < best.bbox.y - 2 || (Math.abs(bb(n).y - best.bbox.y) <= 2 && bb(n).x < best.bbox.x)) best = n;
    }
    for (const c of kidsOf(n)) w(c);
  })(node);
  return best;
}
function cardTitle(node) {
  const t = findTitle(node);
  return t ? { text: t.text, bbox: bb(t) } : null;
}

// ---------- Stage 3: 身体区域模式匹配 ----------
const flatTexts = (n, band) => {
  const out = [];
  (function w(m) {
    if (m.type === 'TEXT') { const b = bb(m); if (!band || b.y >= band.y0 && b.y <= band.y1) out.push({ text: m.text, bbox: b, font: m.font }); }
    for (const c of kidsOf(m)) w(c);
  })(n);
  return out;
};
const flatRects = (n) => {
  const out = [];
  (function w(m) {
    if (m.type === 'RECTANGLE' || m.type === 'ELLIPSE') out.push({ name: m.name, bbox: bb(m), fill: (m.fill || m.fills?.[0]?.color || (m.fills?.[0]?.type === 'IMAGE' ? 'IMG' : null)), r: m.radius });
    for (const bgn of (m.bg || [])) w(bgn); // bg 层(斑马纹/底色条)也有几何与填充
    for (const c of kidsOf(m)) w(c);
  })(n);
  return out;
};

function matchPattern(node) {
  const b = bb(node);
  const texts = flatTexts(node);
  const rects = flatRects(node);

  // 表格:表头底色条 + 任意深度下等宽行容器(≥5 文本),按 y 去重
  const headerBar = rects.find(r => r.bbox.h >= 25 && r.bbox.h <= 45 && r.bbox.w >= b.w * 0.8);
  const rowLike = [];
  (function w(n) {
    for (const c of kidsOf(n)) {
      const cb = bb(c);
      if (cb.h >= 25 && cb.h <= 45 && cb.w >= b.w * 0.8 && flatTexts(c).length >= 5) {
        if (!rowLike.some(r => Math.abs(r - cb.y) < 6)) rowLike.push(cb.y);
      }
      w(c);
    }
  })(node);
  if (headerBar && rowLike.length >= 3) {
    const cols = texts.filter(t => Math.abs(t.bbox.y - headerBar.bbox.y) < 12).sort((a, c) => a.bbox.x - c.bbox.x);
    return { type: 'table', header: cols.map(t => t.text), rows: rowLike.length };
  }
  // 图表-折线:≥6 个 MM-DD 形日期文本
  const dates = texts.filter(t => /^\d{2}-\d{2}$/.test(t.text.trim()));
  if (dates.length >= 6) return { type: 'chart', guess: 'lines' };
  // 分页:≥3 个 28-40 方块、同一行(y 差 <8)、位于卡片底部 25% 区
  const pageSq = rects.filter(r => r.bbox.w >= 26 && r.bbox.w <= 40 && Math.abs(r.bbox.w - r.bbox.h) <= 4 && r.bbox.y > b.y + b.h * 0.75);
  if (pageSq.length >= 3 && pageSq.length <= 8 && pageSq.every(r => Math.abs(r.bbox.y - pageSq[0].bbox.y) < 8)) {
    return { type: 'pagination', pages: pageSq.length };
  }
  // 进度条列表:≥3 行宽条(允许 track/fill 成对,y 去重)
  const bars = rects.filter(r => r.bbox.w >= b.w * 0.5 && r.bbox.h >= 5 && r.bbox.h <= 14);
  const barRows = [];
  for (const bar of bars) if (!barRows.some(y => Math.abs(y - bar.bbox.y) < 6)) barRows.push(bar.bbox.y);
  if (barRows.length >= 3) return { type: 'bar-list', bars: barRows.length };
  // stat 块:≥3 个 48-76 方形图标
  const icons = rects.filter(r => r.bbox.w >= 44 && r.bbox.w <= 76 && Math.abs(r.bbox.w - r.bbox.h) <= 4);
  if (icons.length >= 3) return { type: 'stat-blocks', blocks: icons.length };
  // 图表-竖柱:≥3 根细高柱(宽 6-24,高 ≥20;排除 1-2px 分隔线)
  const vbars = rects.filter(r => r.bbox.w >= 6 && r.bbox.w <= 24 && r.bbox.h >= 20);
  if (vbars.length >= 3) return { type: 'chart', guess: 'bars', bars: vbars.length };
  // 图例:≥3 个 12-20 色块 + ≥3 个 % 文本
  const swatches = rects.filter(r => r.bbox.w >= 10 && r.bbox.w <= 20 && Math.abs(r.bbox.w - r.bbox.h) <= 3);
  const pct = texts.filter(t => /%/.test(t.text)).length;
  if (swatches.length >= 3 && pct >= 3) return { type: 'legend', items: swatches.length };
  // 图表-环:椭圆群
  const ellipses = rects.filter(r => /Ellipse|椭圆/.test(r.name || ''));
  if (ellipses.length >= 4) return { type: 'chart', guess: 'donut', bake: true };
  // todo/编号条目:≥3 个 16-26 方形徽标
  const badges = rects.filter(r => r.bbox.w >= 16 && r.bbox.w <= 26 && Math.abs(r.bbox.w - r.bbox.h) <= 4);
  if (badges.length >= 3) return { type: 'rank-list', items: badges.length };
  return { type: 'content' };
}

// ---------- Stage 4: 页面栅格 ----------
function tracks(vals, tol = 3) {
  const sorted = [...vals].sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(v - last.v) <= tol) { last.v = (last.v * last.n + v) / (last.n + 1); last.n++; }
    else out.push({ v, n: 1 });
  }
  return out.filter(t => t.n >= 2).map(t => Math.round(t.v));
}
const colTracks = tracks(cardList.map(c => c.bbox.x));
const rowTracks = tracks(cardList.map(c => c.bbox.y));
const colWidths = tracks(cardList.map(c => c.bbox.w), 5);
const rowHeights = tracks(cardList.map(c => c.bbox.h), 5);
// 手摆离群:卡片 bbox 不在轨道上
const outliers = cardList
  .filter(c => !colTracks.some(t => Math.abs(t - c.bbox.x) <= 3) || !rowTracks.some(t => Math.abs(t - c.bbox.y) <= 3))
  .map(c => ({ name: c.node.name || '', bbox: c.bbox }));

// ---------- Stage 5: 切图建议(IR assets = 图片填充节点) ----------
const bake = assets.map(a => {
  const overlapped = (ir.texts || []).filter(t => t.bbox && a.bbox &&
    t.bbox.x < a.bbox.x + a.bbox.w && t.bbox.x + t.bbox.w > a.bbox.x &&
    t.bbox.y < a.bbox.y + a.bbox.h && t.bbox.y + t.bbox.h > a.bbox.y);
  return {
    id: a.id, name: a.name, bbox: a.bbox,
    textOver: overlapped.length > 0,
    hint: overlapped.length ? '有文字叠印:裁切后涂白文字区/留孔洞,或读 fills 重建 CSS' : '可直接裁切或节点导出',
  };
});
// 素材归属:与卡片相交 ≥50% 面积(卡头溢出装饰也能归位)
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// ---------- Stage 6: 组装组件树 ----------
const topbarUnits = top.filter(isTopbar);
const topbar = topbarUnits.filter(u => u === topbarUnits.find(v => Math.abs(v.bbox.y - u.bbox.y) < 4))
  .slice(0, 1).map(u => ({
  role: 'topbar', name: 'TopBar', bbox: u.bbox,
  bake: bake.filter(bk => bk.bbox.y < u.bbox.h + 4),
}));
const components = cardList.map((c, i) => {
  const title = cardTitle(c.node);
  const bodyY0 = title ? title.bbox.y + title.bbox.h + 4 : c.bbox.y + 60;
  const pattern = matchPattern(c.node);
  const gridPos = {
    col: colTracks.findIndex(t => Math.abs(t - c.bbox.x) <= 4) + 1 || null,
    row: rowTracks.findIndex(t => Math.abs(t - c.bbox.y) <= 4) + 1 || null,
  };
  return {
    role: 'card',
    name: (title ? 'Card_' : 'Panel_') + (i + 1) + (gridPos.row ? `_r${gridPos.row}` : '') + (gridPos.col ? `c${gridPos.col}` : ''),
    title: title ? title.text : c.node.name || '',
    bbox: c.bbox,
    grid: { col: gridPos.col || 'off-track', row: gridPos.row || 'off-track' },
    layout: c.node.layout || 'abs-overlay',
    pattern,
    bake: bake.filter(bk => {
      const interArea = inter(bk.bbox, c.bbox);
      return interArea >= 0.5 * bk.bbox.w * bk.bbox.h;
    }),
  };
});

const result = {
  version: 1,
  page: { w: frameW, h: frameH },
  grid: {
    columns: colTracks, columnWidths: colWidths,
    rows: rowTracks, rowHeights,
    outliers,
    note: '手摆离群卡片坐标仅供参考,建议吸附轨道后以轨道为准',
  },
  topbar,
  components,
  bakeOrphans: bake.filter(bk => !components.some(c => c.bake.includes(bk))),
};

if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');

// ---------- 摘要 ----------
console.log(`规范化 → ${OUT || '(stdout)'}   帧 ${frameW}x${frameH}`);
console.log(`栅格: 列轨道[${colTracks}] 列宽[${colWidths}] 行轨道[${rowTracks}] 行高[${rowHeights}]  离群 ${outliers.length}`);
console.log(`顶栏 ${topbar.length} | 卡片 ${components.length}`);
for (const c of components) {
  console.log(`  ${c.name.padEnd(16)} "${c.title.slice(0, 14)}" ${String(c.bbox.w) + 'x' + String(c.bbox.h)}  ${c.pattern.type}${c.pattern.rows ? ' rows=' + c.pattern.rows : ''}${c.pattern.bars ? ' bars=' + c.pattern.bars : ''}${c.pattern.pages ? ' pages=' + c.pattern.pages : ''}${c.pattern.blocks ? ' blocks=' + c.pattern.blocks : ''}${c.pattern.items ? ' items=' + c.pattern.items : ''}  bake:${c.bake.length}`);
}
console.log(`游离素材: ${result.bakeOrphans.length}`);
