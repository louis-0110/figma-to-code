#!/usr/bin/env node
/**
 * doctor.mjs — figma-to-code Skill 环境自检(新项目/新机器先跑这个)
 *
 * 用法: node doctor.mjs [项目根目录,默认当前目录]
 *
 * 检查项:
 *   1. node >= 18(脚本池依赖全局 fetch)
 *   2. Figma REST token:查找链 FIGMA_TOKEN 环境变量 → ~/.secrets/figma → <项目根>/.secrets/env,
 *      找到即调 /v1/me 验真(只读,10s 超时)
 *   3. TalkToFigma MCP 注册:扫描 ~/.claude.json(全局 mcpServers + 各项目 mcpServers)
 *      与 <项目根>/.mcp.json;并 TCP 探测 3055 桥接端口
 *   4. Skill 工具齐全性(本目录下 6 个 .mjs)
 *
 * 输出:✓/✗ 清单 + 修复提示。退出码 0=全过,1=有缺失。
 * 秘密安全:token 永不进 Skill 目录;打印时只露前 8 位。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const projectRoot = path.resolve(process.argv[2] || process.cwd());
const skillAssets = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const results = [];
const ok = (name, detail) => { results.push(['✓', name, detail]); return true; };
const bad = (name, detail) => { results.push(['✗', name, detail]); return false; };

// 1) node 版本
const major = Number(process.versions.node.split('.')[0]);
major >= 18 ? ok(`node ${process.versions.node}`, '满足 >=18') : bad(`node ${process.versions.node}`, '需 >=18(全局 fetch)');

// 2) token 三级查找 + 验真
function findToken() {
  if (process.env.FIGMA_TOKEN) return { src: '环境变量 FIGMA_TOKEN', token: process.env.FIGMA_TOKEN };
  const candidates = [
    { src: '~/.secrets/figma', p: path.join(os.homedir(), '.secrets', 'figma') },
    { src: path.join(projectRoot, '.secrets', 'env'), p: path.join(projectRoot, '.secrets', 'env') },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.p)) {
      const raw = fs.readFileSync(c.p, 'utf8');
      const t = raw.match(/FIGMA_TOKEN=(.+)/)?.[1]?.trim() || raw.trim();
      if (t) return { src: c.src, token: t };
    }
  }
  return null;
}
const found = findToken();
if (!found) {
  bad('Figma REST token', '三级查找全空。修复:Figma Settings → Personal access tokens 生成(只读即可),存到 ~/.secrets/figma(裸 token)或项目 .secrets/env(FIGMA_TOKEN=xxx);并确认 .secrets/ 在 .gitignore');
} else {
  const masked = found.token.slice(0, 8) + '…(' + found.src + ')';
  try {
    const r = await fetch('https://api.figma.com/v1/me', {
      headers: { 'X-Figma-Token': found.token }, signal: AbortSignal.timeout(10000)
    });
    if (r.ok) { const me = await r.json(); ok('Figma REST token', `${masked} 有效,账号 ${me.handle}`); }
    else bad('Figma REST token', `${masked} 服务端拒绝(${r.status}),可能已 revoke/过期`);
  } catch (e) {
    bad('Figma REST token', `${masked} 无法联网验证(${e.message});离线环境下 REST 功能不可用,MCP 管线不受影响`);
  }
}

// 3) MCP 注册扫描
const regHits = [];
const claudeJson = path.join(os.homedir(), '.claude.json');
try {
  const c = JSON.parse(fs.readFileSync(claudeJson, 'utf8'));
  for (const [k, v] of Object.entries(c.mcpServers || {}))
    if (/figma/i.test(k) || /figma/i.test(JSON.stringify(v))) regHits.push({ where: '全局 ~/.claude.json', key: k, cmd: v.command });
  for (const [p, cfg] of Object.entries(c.projects || {}))
    for (const [k, v] of Object.entries(cfg.mcpServers || {}))
      if (/figma/i.test(k) || /figma/i.test(JSON.stringify(v))) regHits.push({ where: `项目 ${p}`, key: k, cmd: v.command });
} catch { /* 文件不存在或不可解析,忽略 */ }
const mcpJson = path.join(projectRoot, '.mcp.json');
if (fs.existsSync(mcpJson)) {
  try {
    const c = JSON.parse(fs.readFileSync(mcpJson, 'utf8'));
    for (const [k, v] of Object.entries(c.mcpServers || {}))
      if (/figma/i.test(k) || /figma/i.test(JSON.stringify(v))) regHits.push({ where: '项目 .mcp.json', key: k, cmd: v.command });
  } catch { /* ignore */ }
}
if (regHits.length) {
  ok('TalkToFigma MCP 注册', regHits.map(h => `${h.where}:${h.key} → ${h.cmd}`).join('; '));
  for (const h of regHits) {
    const cmdPath = (h.cmd || '').replace(/"/g, '');
    if (/[\\/]/.test(cmdPath) && !cmdPath.startsWith('npx') && !fs.existsSync(cmdPath))
      bad('MCP 注册指向的文件', `${cmdPath} 不存在(clone 仓库或改注册)`);
  }
} else {
  bad('TalkToFigma MCP 注册', '未找到。修复:复制 assets/figma-mcp.example.json 中变体到项目 .mcp.json 或全局 ~/.claude.json');
}

// 3055 桥接探测
const bridgeUp = await new Promise((resolve) => {
  const s = net.connect(3055, '127.0.0.1');
  s.setTimeout(1500);
  s.on('connect', () => { s.destroy(); resolve(true); });
  s.on('error', () => resolve(false));
  s.on('timeout', () => { s.destroy(); resolve(false); });
});
bridgeUp
  ? ok('3055 WebSocket 桥接', '端口在线(插件侧连接依赖它;命令超时仍需重开插件重新 join)')
  : bad('3055 WebSocket 桥接', '端口未开。修复:运行 cursor-talk-to-figma-mcp 的 start-mcp.cmd(幂等,会自动后台拉起),并在 Figma 桌面端打开插件');

// 4) 工具齐全性
const tools = ['scan-tree.mjs', 'layout-infer.mjs', 'normalize-ir.mjs', 'detect-hidden.mjs', 'fetch-visible.mjs', 'crop-assets.mjs', 'get-fonts.mjs'];
const missing = tools.filter(t => !fs.existsSync(path.join(skillAssets, t)));
missing.length ? bad('Skill 工具池', `缺 ${missing.join(', ')}`) : ok('Skill 工具池', `${tools.length} 个脚本齐全`);

// 汇总
console.log('\n=== figma-to-code 环境自检(项目根:' + projectRoot + ') ===');
for (const [mark, name, detail] of results) console.log(`${mark} ${name} — ${detail}`);
const fails = results.filter(r => r[0] === '✗').length;
console.log(`\n${fails === 0 ? '✅ 全部通过' : `⚠️ ${fails} 项未过,按上方提示修复后重跑`}`);
process.exit(fails === 0 ? 0 : 1);
