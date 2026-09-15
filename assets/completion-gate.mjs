#!/usr/bin/env node
/**
 * completion-gate.mjs — the single machine-readable definition of "done".
 *
 * Usage:
 *   node completion-gate.mjs <project-root> [--json]
 *     [--scorecard qa/scorecard.json] [--ui qa/verify-ui.json]
 *     [--elasticity qa/elasticity.json] [--interaction qa/interaction.json]
 *     [--out qa/gate-report.json]
 *
 * It runs static audits and requires all four persisted QA reports. A direct
 * browser screenshot or a manually written “all pass” message is not enough.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const skillAssets = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : process.cwd());
const jsonOutput = args.includes('--json');
const reportPaths = {
  scorecard: valueAfter('--scorecard') || 'qa/scorecard.json',
  ui: valueAfter('--ui') || 'qa/verify-ui.json',
  elasticity: valueAfter('--elasticity') || 'qa/elasticity.json',
  interaction: valueAfter('--interaction') || 'qa/interaction.json'
};
const outputPath = valueAfter('--out') || 'qa/gate-report.json';

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

function insideProject(raw) {
  const absolute = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(projectRoot, raw);
  const relative = path.relative(projectRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`路径必须位于项目内: ${raw}`);
  return { absolute, relative: relative.replaceAll('\\', '/') };
}

function runNode(script, scriptArgs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(skillAssets, script), ...scriptArgs], {
      cwd: projectRoot,
      env: process.env,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function parseJsonOutput(result, name) {
  try { return JSON.parse(result.stdout); }
  catch (error) {
    return { pass: false, errors: [`${name} 没有输出合法 JSON: ${error.message}`, result.stderr].filter(Boolean) };
  }
}

async function readReport(name, rawPath, passPredicate) {
  const file = insideProject(rawPath);
  try {
    const value = JSON.parse(await fs.readFile(file.absolute, 'utf8'));
    return { name, path: file.relative, pass: passPredicate(value), report: value };
  } catch (error) {
    return { name, path: file.relative, pass: false, errors: [`缺少或无法读取 ${file.relative}: ${error.message}`] };
  }
}

async function main() {
  const checks = [];
  const scripts = [
    ['runtime', 'verify-runtime.mjs', ['--strict', '--json']],
    ['assets', 'verify-assets.mjs', ['--strict', '--json']],
    ['placeholders', 'detect-placeholders.mjs', ['--strict-icons', '--json']]
  ];
  for (const [name, script, scriptArgs] of scripts) {
    const result = await runNode(script, [projectRoot, ...scriptArgs]);
    const report = parseJsonOutput(result, name);
    checks.push({ name, pass: result.code === 0 && report.pass === true, exitCode: result.code, report });
  }

  checks.push(await readReport('scorecard', reportPaths.scorecard, (value) => value.verdict === 'PASS' || value.pass === true));
  checks.push(await readReport('ui', reportPaths.ui, (value) => value.pass === true));
  checks.push(await readReport('elasticity', reportPaths.elasticity, (value) => value.pass === true));
  checks.push(await readReport('interaction', reportPaths.interaction, (value) => value.pass === true));

  const report = {
    pass: checks.every((check) => check.pass),
    projectRoot,
    generatedAt: new Date().toISOString(),
    checks: checks.map(({ name, pass, path: reportPath, exitCode, errors }) => ({ name, pass, path: reportPath, exitCode, errors })),
    requiredReports: reportPaths
  };
  const output = insideProject(outputPath);
  await fs.mkdir(path.dirname(output.absolute), { recursive: true });
  await fs.writeFile(output.absolute, JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`完成总闸: ${report.pass ? 'PASS' : 'FAIL'}`);
    for (const check of report.checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
    console.log(`报告: ${output.relative}`);
  }
  process.exitCode = report.pass ? 0 : 1;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; });
