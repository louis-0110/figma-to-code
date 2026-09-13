// 像素对比:设计稿 vs 实现截图(灰阶差>40 记显著)
// 用法: node diff.js <design.png> <shot.png> [--heat]
const fs = require('fs');
const { PNG } = require('pngjs');

const a = PNG.sync.read(fs.readFileSync(process.argv[2]));
const b = PNG.sync.read(fs.readFileSync(process.argv[3]));
const HEAT = process.argv.includes('--heat');
if (a.width !== b.width || a.height !== b.height) {
  console.error(`尺寸不一致! design=${a.width}x${a.height} shot=${b.width}x${b.height} — 先校验截图尺寸`);
  process.exit(1);
}
const W = a.width, H = a.height;
const gray = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// 1) 全局 + 8x6 网格区域统计
const GX = 8, GY = 6;
const cells = Array.from({ length: GY }, () => Array(GX).fill(0));
const cellW = W / GX, cellH = H / GY;
let diffCount = 0, total = 0, sumDiff = 0;
const diffMap = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (W * y + x) << 2;
    // 设计稿 RGBA 可能带 alpha,拍到白底再比
    const ga = a.data[i + 3] < 255 ? 255 : gray(a.data, i);
    const gb = gray(b.data, i);
    const d = Math.abs(ga - gb);
    sumDiff += d; total++;
    if (d > 40) {
      diffCount++;
      diffMap[y * W + x] = 1;
      cells[Math.min(GY - 1, (y / cellH) | 0)][Math.min(GX - 1, (x / cellW) | 0)]++;
    }
  }
}
console.log(`平均灰阶差: ${(sumDiff / total).toFixed(2)}  显著差异像素占比: ${(100 * diffCount / total).toFixed(2)}%`);
const pct = (n) => (100 * n / (cellW * cellH)).toFixed(1).padStart(5);
console.log('差异热力图(%,每格=180x170px):');
const maxCell = Math.max(...cells.flat());
for (let gy = 0; gy < GY; gy++) {
  const row = cells[gy].map((n) => {
    const v = n === 0 ? '  ·  ' : pct(n).padStart(5);
    return maxCell > 0 && n / maxCell > 0.5 ? `[${v}]` : ` ${v} `;
  });
  console.log(row.join(''));
}

// 2) 显著差异的连通块质心(找错位区域)
if (diffCount / total > 0.005) {
  const visited = new Uint8Array(W * H);
  const blobs = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!diffMap[p] || visited[p]) continue;
    let sx = 0, sy = 0, n = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    const queue = [p]; visited[p] = 1;
    while (queue.length) {
      const q = queue.pop(); const qx = q % W, qy = (q / W) | 0;
      sx += qx; sy += qy; n++;
      minX = Math.min(minX, qx); maxX = Math.max(maxX, qx); minY = Math.min(minY, qy); maxY = Math.max(maxY, qy);
      const nb = [q - 1, q + 1, q - W, q + W];
      for (const r of nb) {
        if (r < 0 || r >= W * H) continue;
        const rx = r % W;
        if (Math.abs(rx - qx) > 1) continue;
        if (diffMap[r] && !visited[r]) { visited[r] = 1; queue.push(r); }
      }
    }
    if (n > 50) blobs.push({ n, cx: (sx / n) | 0, cy: (sy / n) | 0, minX, minY, maxX, maxY });
  }
  blobs.sort((u, v) => v.n - u.n);
  console.log('主要差异块(top8, 坐标为 1440x1024 系):');
  for (const bl of blobs.slice(0, 8)) {
    console.log(`  (${bl.cx},${bl.cy}) bbox=[${bl.minX},${bl.minY}..${bl.maxX},${bl.maxY}] px=${bl.n}`);
  }
}
