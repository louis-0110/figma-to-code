#!/usr/bin/env node
/**
 * crop-assets.mjs — 从 Figma 整帧导出图裁剪素材(分号 ID 无法单独导出时的兜底)
 * 用法: node crop-assets.mjs <整帧导出图> <设计宽> <设计高> <裁剪清单.json> <输出目录>
 * 清析 JSON: [{ name, x, y, w, h }]  (x/y/w/h 为帧内设计坐标)
 *
 * ⚠️ 导出图实际尺寸 ≠ 设计尺寸×scale(Figma 大图会被重编码为 JPEG 且 ~2000px 上限),
 *    本脚本按 实际宽/设计宽 推导采样系数,绝不信请求的 scale。
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const [src, designW, designH, listFile, outDir] = process.argv.slice(2);
const buf = fs.readFileSync(src);
// 按魔数判断格式(Figma 导出 URL 的扩展名可能与内容不符:请求 PNG 大图会返回 JPEG)
const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
const img = isJpeg
  ? jpeg.decode(buf, { useTArray: true })
  : PNG.sync.read(buf);

const W = img.width, H = img.height;
const kx = W / Number(designW), ky = H / Number(designH);
console.log(`源图 ${W}x${H},采样系数 kx=${kx.toFixed(4)} ky=${ky.toFixed(4)}`);

const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

for (const it of list) {
  const sx = Math.round(it.x * kx), sy = Math.round(it.y * ky);
  const sw = Math.max(1, Math.round(it.w * kx)), sh = Math.max(1, Math.round(it.h * ky));
  const out = new PNG({ width: sw, height: sh });
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const si = ((sy + y) * W + (sx + x)) * 4, di = (y * sw + x) * 4;
    out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1];
    out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = img.data[si + 3] ?? 255;
  }
  const p = path.join(outDir, it.name + '.png');
  fs.writeFileSync(p, PNG.sync.write(out));
  console.log(`${it.name}.png  ${it.w}x${it.h} @ (${it.x},${it.y}) → ${sw}x${sh}`);
}
