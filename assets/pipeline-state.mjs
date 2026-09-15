#!/usr/bin/env node
/**
 * pipeline-state.mjs — small content-addressed cache for the seven-step pipe.
 *
 * Usage:
 *   node pipeline-state.mjs <project-root> --phase layout \
 *     --input node-info.json [--input hidden.json] [--write] [--json]
 *
 * A phase is dirty when an input is missing or its SHA-256 digest changed.
 * The state file lives in qa/.pipeline-state.json and contains no source data.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const projectRoot = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : process.cwd());
const phase = valueAfter('--phase');
const inputs = valuesAfter('--input');
const write = args.includes('--write');
const jsonOutput = args.includes('--json');
const statePath = path.join(projectRoot, 'qa', '.pipeline-state.json');

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

function valuesAfter(flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1] && !args[index + 1].startsWith('--')) values.push(args[index + 1]);
  }
  return values;
}

function projectFile(raw) {
  const absolute = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(projectRoot, raw);
  const relative = path.relative(projectRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`input 必须位于项目内: ${raw}`);
  return { absolute, relative: relative.replaceAll('\\', '/') };
}

async function digest(file) {
  try {
    const buffer = await fs.readFile(file.absolute);
    return { path: file.relative, sha256: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length };
  } catch (error) {
    return { path: file.relative, missing: true, error: error.message };
  }
}

async function readState() {
  try { return JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch { return { version: 1, phases: {} }; }
}

async function main() {
  if (!phase) throw new Error('缺少 --phase <name>');
  if (!inputs.length) throw new Error('至少提供一个 --input <file>');
  const inputDigests = await Promise.all(inputs.map((input) => digest(projectFile(input))));
  const state = await readState();
  const previous = state.phases?.[phase];
  const dirty = !previous || JSON.stringify(previous.inputs) !== JSON.stringify(inputDigests);
  const current = { phase, dirty, inputs: inputDigests, previous: previous || null, statePath: path.relative(projectRoot, statePath).replaceAll('\\', '/') };
  if (write) {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    state.version = 1;
    state.phases = { ...(state.phases || {}), [phase]: { inputs: inputDigests, updatedAt: new Date().toISOString() } };
    await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
    current.written = true;
  }
  if (jsonOutput) console.log(JSON.stringify(current, null, 2));
  else console.log(`${dirty ? 'DIRTY' : 'UNCHANGED'} ${phase}${write ? ' (state updated)' : ''}`);
  process.exitCode = dirty ? 10 : 0;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; });
