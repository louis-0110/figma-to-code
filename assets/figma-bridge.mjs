#!/usr/bin/env node
/**
 * figma-bridge.mjs — deterministic CLI client for the 3055 TalkToFigma relay.
 *
 * Usage:
 *   node figma-bridge.mjs --channel o10kkst1 --command get_document_info
 *   node figma-bridge.mjs --channel o10kkst1 --command get_node_info \
 *     --params '{"nodeId":"123:456"}' --json
 *
 * This is a fallback for hosts where the MCP tool is not exposed. It joins the
 * user-provided channel and sends exactly one plugin command, preserving the
 * relay protocol instead of guessing a channel or using REST for live state.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const skillAssets = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(skillAssets, 'package.json'));
const WebSocket = require('ws');

const channel = valueAfter('--channel');
const command = valueAfter('--command');
const port = Number(valueAfter('--port') || 3055);
const timeoutMs = Number(valueAfter('--timeout') || 15000);
const jsonOutput = args.includes('--json');

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

async function readParams() {
  const file = valueAfter('--params-file');
  const raw = file ? await fs.readFile(path.resolve(file), 'utf8') : valueAfter('--params') || '{}';
  try { return JSON.parse(raw); }
  catch (error) { throw new Error(`params 不是合法 JSON: ${error.message}`); }
}

function candidates(packet) {
  const values = [packet];
  if (packet && typeof packet.message === 'object') values.push(packet.message);
  if (packet?.message?.message && typeof packet.message.message === 'object') values.push(packet.message.message);
  return values;
}

function isResponse(packet, id) {
  for (const value of candidates(packet)) {
    if (value?.id !== id) continue;
    if (value.error) return { error: String(value.error) };
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return { result: value.result };
  }
  return null;
}

async function main() {
  if (!channel) throw new Error('缺少 --channel；必须使用 Figma 插件面板显示的频道名');
  if (!command) throw new Error('缺少 --command');
  if (!Number.isInteger(port) || port <= 0) throw new Error(`无效端口: ${port}`);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error(`无效超时: ${timeoutMs}`);
  const params = await readParams();
  const id = randomUUID();
  const joinId = randomUUID();
  const startedAt = Date.now();
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const finish = (value, exitCode) => {
    const report = { pass: exitCode === 0, channel, command, id, elapsedMs: Date.now() - startedAt, ...value };
    if (jsonOutput) console.log(JSON.stringify(report, null, 2));
    else if (report.pass) console.log(`Figma ${command}: PASS (${report.elapsedMs}ms)`);
    else console.error(`Figma ${command}: FAIL — ${report.error || 'unknown error'}`);
    try { ws.close(); } catch {}
    process.exitCode = exitCode;
  };
  const timer = setTimeout(() => finish({ error: `等待响应超时 (${timeoutMs}ms)，请确认 Figma 插件已打开并 Join 频道 ${channel}` }, 1), timeoutMs);

  ws.on('open', () => {
    ws.send(JSON.stringify({ id: joinId, type: 'join', channel: channel.trim() }));
    ws.send(JSON.stringify({ id, type: 'message', channel: channel.trim(), message: { id, command, params } }));
  });
  ws.on('message', (raw) => {
    let packet;
    try { packet = JSON.parse(raw.toString()); }
    catch { return; }
    const response = isResponse(packet, id);
    if (!response) return;
    clearTimeout(timer);
    if (response.error) finish({ error: response.error }, 1);
    else finish({ result: response.result }, 0);
  });
  ws.on('error', (error) => {
    clearTimeout(timer);
    finish({ error: `桥接连接失败: ${error.message}` }, 1);
  });
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; });
