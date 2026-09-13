#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { validateConfig } from './validate-config.mjs';

const DIRECTORIES = [
  'src/components/layout',
  'src/components/cards',
  'src/components/panels',
  'src/components/common',
  'src/components/base',
  'src/components/charts',
  'src/data',
  'src/styles',
  'assets',
  'lib'
];

const TEMPLATE_FILES = [
  { source: 'index.html', target: 'index.html' },
  { source: 'main.js', target: 'src/main.js' },
  { source: 'App.vue', target: 'src/App.vue' },
  { source: 'base.css', target: 'src/styles/base.css' },
  { source: 'demo.js', target: 'src/data/demo.js' },
  { source: 'ScaleStage.vue', target: 'src/components/layout/ScaleStage.vue' },
  { source: 'PanelShell.vue', target: 'src/components/common/PanelShell.vue' },
  { source: 'BaseDataTable.vue', target: 'src/components/base/BaseDataTable.vue' },
  { source: 'BaseChart.vue', target: 'src/components/base/BaseChart.vue' }
];

function renderTemplate(content, config) {
  return content
    .split('__TITLE__').join(config.title || 'Figma Dashboard')
    .split('__SCALE_MODE__').join(config.scale || 'width-adapt');
}

async function loadFiles(config) {
  const files = [];
  for (const item of TEMPLATE_FILES) {
    const sourcePath = new URL(`./templates/vue2/${item.source}`, import.meta.url);
    const content = await readFile(sourcePath, 'utf8');
    files.push({ path: item.target, content: renderTemplate(content, config) });
  }
  return files;
}

async function readConfig(target) {
  const configPath = join(target, 'codegen.config.json');
  try {
    return JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${configPath}: ${error.message}`);
  }
}

function usage() {
  process.stdout.write('Usage: node scaffold-vue2.mjs <target-root> [--dry-run]\n');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const targetArg = args.find((arg) => arg !== '--dry-run');
  if (!targetArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const target = isAbsolute(targetArg) ? targetArg : resolve(process.cwd(), targetArg);
  const config = await readConfig(target);
  const errors = validateConfig(config);
  if (errors.length) {
    process.stderr.write(`INVALID codegen.config.json\n${errors.map((error) => `- ${error}\n`).join('')}`);
    process.exitCode = 1;
    return;
  }
  if (config.framework !== 'vue2-nobuild') {
    process.stderr.write(`scaffold-vue2.mjs supports only vue2-nobuild, got ${config.framework}\n`);
    process.exitCode = 1;
    return;
  }

  const warnings = [];
  if (!['width-adapt', 'actual', 'fit', 'fill-height', 'stretch'].includes(config.scale)) {
    warnings.push(`unknown scale ${config.scale}; templates fall back to width-adapt`);
  }
  if (config.scale === 'custom') {
    warnings.push('custom scale needs project-specific zoom controls; ScaleStage uses width-adapt until implemented');
  }

  const files = await loadFiles(config);
  const conflicts = [];
  for (const item of files) {
    const path = join(target, item.path);
    if (await readFile(path).then(() => true, () => false)) conflicts.push(item.path);
  }
  if (conflicts.length) {
    process.stderr.write(`Refusing to overwrite existing files:\n${conflicts.map((path) => `- ${path}\n`).join('')}`);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    process.stdout.write(`DRY RUN scaffold vue2-nobuild in ${target}\n`);
    for (const item of files) process.stdout.write(`create ${item.path}\n`);
    process.stdout.write('copy lib/screen-scale.js\n');
  } else {
    for (const directory of DIRECTORIES) await mkdir(join(target, directory), { recursive: true });
    for (const item of files) {
      const path = join(target, item.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, item.content, 'utf8');
      process.stdout.write(`create ${item.path}\n`);
    }
    const bundledScale = new URL('./lib/screen-scale.js', import.meta.url);
    await writeFile(join(target, 'lib', 'screen-scale.js'), await readFile(bundledScale));
    process.stdout.write('copy lib/screen-scale.js\n');
  }

  const requiredLibs = ['vue.min.js', 'vue2-sfc-loader.js', 'iview.min.js', 'iview.css'];
  const targetLib = join(target, 'lib');
  let available = [];
  try {
    available = (await readdir(targetLib)).map((name) => name.toLowerCase());
  } catch {}
  const missing = requiredLibs.filter((name) => !available.includes(name.toLowerCase()));
  if (missing.length) {
    warnings.push(`copy these local libraries into lib/: ${missing.join(', ')}`);
  }
  if (config.ui && config.ui.includes('echarts') && !available.includes('echarts.min.js')) {
    warnings.push('copy echarts.min.js into lib/ because BaseChart requires window.echarts');
  }
  for (const warning of warnings) process.stderr.write(`WARN ${warning}\n`);
  process.stdout.write(`${dryRun ? 'Scaffold plan' : 'Scaffold complete'}: ${files.length + 1} files\n`);
}

if (process.argv[1] && process.argv[1].endsWith('scaffold-vue2.mjs')) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
