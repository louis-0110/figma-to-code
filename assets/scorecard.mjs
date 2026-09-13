#!/usr/bin/env node
/**
 * scorecard.mjs — figma-to-code 四门验收的自动评分引擎(门 1 像素 + 门 2 单向墨迹)
 *
 * 用法:
 *   node scorecard.mjs <design.png> <shot.png> [--config regression.json] [--page <名>] [--update] [--json]
 *
 *   --config  金样本配置(见 regression.json:golden[].design/shot/baselines/thresholds)
 *   --page    选 golden 里对应条目(缺省用唯一一条)
 *   --update  把本次实测写回 config 的 baselines(首次播种用)
 *
 * 自动量化:
 *   门1 像素:avgGray 平均灰阶差、sigDiffPct 显著差异占比(>40)、structuralBlobs 结构级差异块(>500px)
 *   门2 墨迹:overRenderBlobs 多渲染连通块(>60px,design 空白 && shot 有内容)、overRenderMaxPx
 * 门3 弹性/滚动、门4 交互冒烟为 DOM 级断言,输出 manualGates 清单由 agent 逐项勾填。
 *
 * 退出码:0 = 达标(baseline 内),1 = 超标或结构异常。
 * 依赖 pngjs:按 createRequire 链(脚本目录 → cwd)解析,项目里 `npm i -D pngjs` 即可。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const opt = (name, val) => {
  const i = args.indexOf(name);
  return i >= 0 ? (val === undefined ? args[i + 1] : true) : undefined;
};
const [designPng, shotPng] = args.filter((a, i) => !a.startsWith('--') && (i === 0 || i === 1 || args[i - 1]?.startsWith('--') !== true || ['--config', '--page'].includes(args[i - 1])));

// 参数解析(简单顺序式):前两个非 flag 参数 = design/shot
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--config' && args[i - 1] !== '--page');
const DESIGN = positional[0], SHOT = positional[1];
const CONFIG = opt('--config'), PAGE = opt('--page'), UPDATE = args.includes('--update'), JSON_OUT = args.includes('--json');

// pngjs 解析:脚本目录 → cwd,逐级向上找 node_modules
function loadPngjs() {
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  for (const base of [here, process.cwd(), path.resolve(process.cwd(), '..')]) {
    try { return createRequire(path.join(base, 'noop.js'))('pngjs'); } catch { /* next */ }
  }
  console.error('缺少 pngjs:在项目里 npm i -D pngjs 后重跑');
  process.exit(2);
}
const { PNG } = loadPngjs();

// ---- 指标计算 ----
const a = PNG.sync.read(fs.readFileSync(DESIGN));
const b = PNG.sync.read(fs.readFileSync(SHOT));
if (a.width !== b.width || a.height !== b.height) {
  console.error(`尺寸不一致: design=${a.width}x${a.height} shot=${b.width}x${b.height} — 先校验截图视口`);
  process.exit(2);
}
const W = a.width, H = a.height;
const gray = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

let sumDiff = 0, sigCount = 0;
const sig = new Uint8Array(W * H);          // 显著差异(双向,结构定位用)
const over = new Uint8Array(W * H);         // 单向多渲染(design 空白 && shot 有内容)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (W * y + x) << 2;
  const ga = a.data[i + 3] < 255 ? 255 : gray(a.data, i);
  const gb = gray(b.data, i);
  sumDiff += Math.abs(ga - gb);
  if (Math.abs(ga - gb) > 40) { sigCount++; sig[y * W + x] = 1; }
  if (ga > 235 && gb < 200) over[y * W + x] = 1;
}
const total = W * H;
const avgGray = +(sumDiff / total).toFixed(2);
const sigDiffPct = +(100 * sigCount / total).toFixed(2);

// 连通块(通用,mask 可选最小尺寸)
function blobs(mask, minPx) {
  const seen = new Uint8Array(W * H); const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!mask[p] || seen[p]) continue;
    let sx = 0, sy = 0, n = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    const q = [p]; seen[p] = 1;
    while (q.length) {
      const u = q.pop(); const ux = u % W, uy = (u / W) | 0;
      sx += ux; sy += uy; n++;
      minX = Math.min(minX, ux); maxX = Math.max(maxX, ux); minY = Math.min(minY, uy); maxY = Math.max(maxY, uy);
      for (const r of [u - 1, u + 1, u - W, u + W]) {
        if (r < 0 || r >= W * H) continue;
        if (Math.abs((r % W) - ux) > 1) continue;
        if (mask[r] && !seen[r]) { seen[r] = 1; q.push(r); }
      }
    }
    if (n >= minPx) out.push({ px: n, cx: Math.round(sx / n), cy: Math.round(sy / n), bbox: [minX, minY, maxX, maxY] });
  }
  return out.sort((u, v) => v.px - u.px);
}
const structural = blobs(sig, 500);              // 结构级差异块
const overBlobs = blobs(over, 60);               // 多渲染块(字形差通常 <170px)

// ---- 配置与基线 ----
let cfg = null, entry = null;
if (CONFIG && fs.existsSync(CONFIG)) {
  cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const list = cfg.golden || [];
  entry = PAGE ? list.find(g => g.page === PAGE) : (list.length === 1 ? list[0] : list[0]);
}
const th = (entry && entry.thresholds) || { sigDiffPctMax: 3.5, structuralMaxBlobs: 0, overRenderMaxBlobs: 2, overRenderMaxPx: 300 };

const metrics = {
  avgGray, sigDiffPct,
  structuralBlobs: structural.length,
  overRenderBlobs: overBlobs.length, overRenderMaxPx: overBlobs[0]?.px || 0,
};
const structuralTop = structural.slice(0, 3);
const overRenderTop = overBlobs.slice(0, 3);

// 达标判定
const fail = [];
if (metrics.sigDiffPct > th.sigDiffPctMax) fail.push(`显著差异 ${metrics.sigDiffPct}% > ${th.sigDiffPctMax}%`);
if (metrics.structuralBlobs > th.structuralMaxBlobs) fail.push(`结构差异块 ${metrics.structuralBlobs} > ${th.structuralMaxBlobs}`);
if (metrics.overRenderBlobs > th.overRenderMaxBlobs) fail.push(`多渲染块 ${metrics.overRenderBlobs} > ${th.overRenderMaxBlobs}`);
if (metrics.overRenderMaxPx > th.overRenderMaxPx) fail.push(`多渲染最大块 ${metrics.overRenderMaxPx}px > ${th.overRenderMaxPx}px`);
// 基线对比(回归):超标幅度超过容差即报警
if (entry?.baseline) {
  const b = entry.baseline;
  if (metrics.sigDiffPct > (b.sigDiffPct ?? 0) + (cfg.tolerance?.sigDiffPct ?? 0.5))
    fail.push(`回归:显著差异 ${metrics.sigDiffPct}% 比基线 ${b.sigDiffPct}% 恶化超过容差`);
}

// ---- 输出 ----
const report = {
  page: PAGE || (entry?.page) || path.basename(SHOT),
  design: DESIGN, shot: SHOT,
  metrics,
  thresholds: th,
  baseline: entry?.baseline || null,
  structuralTop, overRenderTop,
  verdict: fail.length ? 'FAIL' : 'PASS',
  fails: fail,
  manualGates: {
    gate3_弹性滚动: '注入长文本+增行后:无重叠/区域内滚动/表头吸顶 —— 由 agent 经 Playwright 断言',
    gate4_交互冒烟: '搜索过滤/排序(aria+行序双验)/选择联动/dropdown —— 由 agent 逐项断言',
  },
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`=== 评分卡 ${report.page} ===`);
  console.log(`门1 像素:平均灰阶 ${avgGray} / 显著差异 ${sigDiffPct}%${entry?.baseline ? `(基线 ${entry.baseline.sigDiffPct}%)` : ''}`);
  console.log(`   结构差异块(>500px):${structural.length}${structural[0] ? ' top: ' + structural[0].cx + ',' + structural[0].cy + ' ' + structural[0].px + 'px' : ''}`);
  console.log(`门2 墨迹:多渲染块 ${overBlobs.length} 块 / 最大 ${metrics.overRenderMaxPx}px${overBlobs[0] ? ' top: ' + overBlobs[0].cx + ',' + overBlobs[0].cy : ''}`);
  console.log(`判定:${report.verdict}${fail.length ? ' — ' + fail.join('; ') : ''}`);
  console.log(`门3/门4(弹性滚动/交互冒烟)为 DOM 断言,由 agent 按 verification.md 勾填`);
}

// 基线写回
if (UPDATE && cfg) {
  entry.baseline = { avgGray, sigDiffPct, overRenderBlobs: overBlobs.length, updated: new Date().toISOString() };
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`基线已写入 ${CONFIG} (${entry.page})`);
}
process.exit(fail.length ? 1 : 0);
