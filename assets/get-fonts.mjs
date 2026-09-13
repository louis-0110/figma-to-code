#!/usr/bin/env node
/**
 * get-fonts.mjs — Google Fonts 本地化下载器(零依赖,node18+)
 *
 * 用法:
 *   node get-fonts.mjs "Outfit:400,500,600,700" "Urbanist:400,700" [--out <目录>]
 *
 * 行为:
 *   - 带 Chrome UA 请求 css2 API(否则返回 ttf 版 CSS),只取 latin 子集(U+0000-00FF)
 *   - 自动识别可变字体:同 family 所有权重 URL 相同 → 只存一个 <family>-var.woff2,
 *     生成 font-weight:100 900 的单条 @font-face(一个文件全权重,体积最小)
 *   - static 字体:每权重一文件,逐条 @font-face
 *   - 下载到 --out(默认 ./),并生成/追加 fonts-local.css(引用相对路径 fonts/)
 *
 * 示例(项目内落地):
 *   node get-fonts.mjs "Inter:400,700" --out <项目>/lib
 *   cp *.woff2 <项目>/lib/fonts/   # 或直接 --out <项目>/lib/fonts 后把 css 挪到 lib/
 */
import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : process.cwd();
const specs = args.filter((a, i) => a !== '--out' && i !== outIdx + 1)
  .map((s) => {
    const [family, weights] = s.split(':');
    return { family, weights: (weights || '400').split(',').map((w) => w.trim()) };
  });

if (!specs.length) {
  console.error('用法: node get-fonts.mjs "Family:400,700" [--out 目录]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const fams = [...new Set(specs.map((s) => s.family))];
const weightOf = {};
for (const s of specs) weightOf[s.family] = s.weights;

const url = 'https://fonts.googleapis.com/css2?' +
  fams.map((f) => `family=${f.replace(/ /g, '+')}:wght@${[...new Set(weightOf[f])].sort((a, b) => a - b).join(';')}`).join('&') +
  '&display=swap';

const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();

// 解析 latin 子集 @font-face 块
const faces = [];
for (const block of css.split('@font-face').slice(1)) {
  const g = (re) => (block.match(re) || [])[1];
  const fam = g(/font-family: '([^']+)'/);
  const w = g(/font-weight: (\d+)/);
  const u = g(/url\((https:[^)]+\.woff2)\)/);
  const range = g(/unicode-range: ([^;]+);/) || '';
  if (fam && w && u && /U\+0000-00FF/.test(range)) faces.push({ fam, w, u });
}

// 按 family 分组,判断可变(全部 URL 相同 → variable)
const byFam = {};
for (const f of faces) (byFam[f.fam] = byFam[f.fam] || []).push(f);

const cssLines = [];
for (const [fam, list] of Object.entries(byFam)) {
  const urls = [...new Set(list.map((f) => f.u))];
  const slug = fam.toLowerCase().replace(/ /g, '-');
  const isVar = urls.length === 1 && list.length > 1;
  const file = isVar ? `${slug}-var.woff2` : null;
  if (isVar) {
    const dest = path.join(outDir, file);
    fs.writeFileSync(dest, Buffer.from(await (await fetch(urls[0])).arrayBuffer()));
    cssLines.push(`@font-face{font-family:"${fam}";font-style:normal;font-weight:100 900;src:url(fonts/${file}) format("woff2")}`);
    console.log(`[var ] ${fam} → ${file} (${list.map((f) => f.w).join(',')} 全权重合一)`);
  } else {
    for (const f of list) {
      const fn = `${slug}-${f.w}.woff2`;
      fs.writeFileSync(path.join(outDir, fn), Buffer.from(await (await fetch(f.u)).arrayBuffer()));
      cssLines.push(`@font-face{font-family:"${fam}";font-style:normal;font-weight:${f.w};src:url(fonts/${fn}) format("woff2")}`);
      console.log(`[fix ] ${fam} ${f.w} → ${fn}`);
    }
  }
}
const cssPath = path.join(outDir, 'fonts-local.css');
fs.appendFileSync(cssPath, cssLines.join('\n') + '\n');
console.log(`css 追加至 ${cssPath}(页面里 <link> 引它,字体文件放 lib/fonts/)`);
