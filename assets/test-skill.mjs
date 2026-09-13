#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import { validateConfig } from './validate-config.mjs';

const skillAssets = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(skillAssets, 'package.json'));

const checks = [];
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const skipBrowser = args.includes('--skip-browser');

function check(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}\n`);
}

function runNode(scriptPath, scriptArgs = [], env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: process.cwd(),
      env: { ...process.env, ...env }
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${scriptPath} exited with ${code}`));
    });
  });
}

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) {
    return import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  }
  try {
    return await import('playwright');
  } catch {
    return import(pathToFileURL(require.resolve('playwright')).href);
  }
}

function startServer(fixture) {
  const server = http.createServer((request, response) => {
    if (request.url === '/fixture.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(fixture);
      return;
    }
    if (request.url === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const FIXTURE = [
  '<!doctype html>',
  '<html><head><meta charset="utf-8"><style>',
  'html,body{margin:0;width:100%;height:100%}',
  '[data-qa=scale-viewport]{width:100%;height:400px;overflow-x:hidden;overflow-y:auto;box-sizing:border-box}',
  '[data-qa=stage]{width:100%;height:800px;background:#f3f5f9;padding:10px;box-sizing:border-box}',
  '[data-qa=panel-tabs]{display:flex;gap:4px;margin-bottom:8px}',
  '[data-qa=panel-tabs] button{padding:4px 12px;cursor:pointer;border:1px solid #ccc;background:#fff}',
  '[data-qa=panel-tabs] button.on{background:#1867ff;color:#fff;border-color:#1867ff}',
  '[data-qa=search-input]{padding:4px 8px;width:200px;margin-bottom:8px}',
  '[data-qa=table-scroll]{height:200px;overflow-y:auto;overflow-x:hidden}',
  'table{width:100%;height:100%;border-collapse:collapse}',
  'th{position:sticky;top:0;background:#fff;height:40px}',
  'td{height:60px}',
  '[data-qa=chart]{display:block;margin-top:8px}',
  '</style></head><body>',
  '<div data-qa="scale-viewport"><div data-qa="stage">',
  '<input data-qa="search-input" type="text" placeholder="search">',
  '<div data-qa="panel-tabs">',
  '<button data-tab="a" class="on">Tab A</button>',
  '<button data-tab="b">Tab B</button>',
  '</div>',
  '<div data-qa="table-scroll"><table><thead><tr id="th-row"></tr></thead><tbody id="tb-body"></tbody></table></div>',
  '<canvas data-qa="chart" width="200" height="150"></canvas>',
  '</div></div>',
  '<script>',
  "var activeTab='a',searchText='';",
  'var data=[',
  "{name:'alpha',a:10,b:20},{name:'beta',a:30,b:40},{name:'gamma',a:50,b:60},",
  "{name:'delta',a:70,b:80},{name:'epsilon',a:90,b:100},{name:'zeta',a:110,b:120},",
  "{name:'eta',a:130,b:140},{name:'theta',a:150,b:160},{name:'iota',a:170,b:180},",
  "{name:'kappa',a:190,b:200},{name:'lambda',a:210,b:220},{name:'mu',a:230,b:240}",
  '];',
  'function render(){',
  "var thRow=document.getElementById('th-row');",
  "var tb=document.getElementById('tb-body');",
  "var cols=activeTab==='a'?['name','a']:['name','b'];",
  "thRow.innerHTML=cols.map(function(c,i){",
  "return '<th'+(i===0?' data-qa=\"table-head\"':'')+'>'+c+'</th>';",
  '}).join("");',
  'var filtered=data.filter(function(r){',
  'return !searchText||r.name.indexOf(searchText)>=0;',
  '});',
  'tb.innerHTML=filtered.map(function(r){',
  "return '<tr>'+cols.map(function(c){return \'<td>\'+r[c]+\'</td>\';}).join(\'\')+\'</tr>\';",
  '}).join("");',
  '}',
  "document.querySelectorAll('[data-qa=panel-tabs] button').forEach(function(btn){",
  "btn.addEventListener('click',function(){",
  "document.querySelectorAll('[data-qa=panel-tabs] button').forEach(function(b){b.classList.remove('on')});",
  "btn.classList.add('on');",
  "activeTab=btn.getAttribute('data-tab');",
  'render();',
  '});',
  '});',
  "document.querySelector('[data-qa=search-input]').addEventListener('input',function(e){",
  'searchText=e.target.value.toLowerCase();',
  'render();',
  '});',
  "var canvas=document.querySelector('[data-qa=chart]');",
  "var ctx=canvas.getContext('2d');",
  "ctx.fillStyle='#1867ff';",
  'ctx.fillRect(10,10,180,130);',
  "ctx.fillStyle='#fff';",
  "ctx.font='24px sans-serif';",
  "ctx.fillText('Chart',60,80);",
  'render();',
  '</script>',
  '</body></html>'
].join('\n');

async function browserSmoke() {
  await loadPlaywright();
  const server = await startServer(FIXTURE);
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/fixture.html`;
  try {
    const output = await runNode(join(skillAssets, 'verify-ui.mjs'), [
      '--url', url,
      '--viewport', '800x500',
      '--wait', '100'
    ]);
    const result = JSON.parse(output.slice(output.indexOf('{')));
    const failed = result.checks.filter((item) => !item.pass).map((item) => item.id);
    check('browser-ui-contract', result.pass === true, failed.join(', ') || 'all assertions passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function interactionSmoke() {
  await loadPlaywright();
  const server = await startServer(FIXTURE);
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/fixture.html`;
  try {
    const output = await runNode(join(skillAssets, 'verify-ui.mjs'), [
      '--url', url,
      '--viewport', '800x500',
      '--wait', '100',
      '--check-tabs',
      '--check-search', 'alpha',
      '--check-chart'
    ]);
    const result = JSON.parse(output.slice(output.indexOf('{')));
    const failed = result.checks.filter((item) => !item.pass).map((item) => item.id);
    check('interaction-probes', result.pass === true, failed.join(', ') || 'tabs + search + chart all passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const configPath = join(skillAssets, 'codegen.config.example.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const configErrors = validateConfig(config);
  check('config-contract', configErrors.length === 0, configErrors.join(' | ') || 'contractVersion=1 validated');

  for (const script of ['scaffold-vue2.mjs', 'validate-config.mjs', 'verify-ui.mjs']) {
    try {
      await runNode('--check', [join(skillAssets, script)]);
      check(`syntax-${script}`, true);
    } catch (error) {
      check(`syntax-${script}`, false, error.message);
    }
  }

  const tempRoot = await mkdtemp(join(tmpdir(), 'figma-to-code-selftest-'));
  await writeFile(join(tempRoot, 'codegen.config.json'), JSON.stringify(config, null, 2), 'utf8');
  try {
    await runNode(join(skillAssets, 'scaffold-vue2.mjs'), [tempRoot]);

    const expected = [
      'index.html',
      'src/main.js',
      'src/App.vue',
      'src/styles/base.css',
      'src/data/demo.js',
      'src/components/layout/ScaleStage.vue',
      'src/components/common/PanelShell.vue',
      'src/components/common/TopHeader.vue',
      'src/components/cards/StatCard.vue',
      'src/components/cards/RankList.vue',
      'src/components/base/BaseDataTable.vue',
      'src/components/base/BaseChart.vue',
      'lib/screen-scale.js'
    ];
    const missing = [];
    for (const path of expected) {
      try {
        await readFile(join(tempRoot, path), 'utf8');
      } catch {
        missing.push(path);
      }
    }
    check('scaffold-files', missing.length === 0, missing.join(', ') || `${expected.length} files present`);

    const scaleSource = await readFile(join(tempRoot, 'src/components/layout/ScaleStage.vue'), 'utf8');
    const tableSource = await readFile(join(tempRoot, 'src/components/base/BaseDataTable.vue'), 'utf8');
    const selectors = [
      scaleSource.includes('data-qa="scale-viewport"'),
      scaleSource.includes('data-qa="stage"'),
      tableSource.includes('data-qa="table-scroll"'),
      (tableSource.includes('data-qa="table-head"') || tableSource.includes("'table-head'"))
    ];
    check('selector-contract', selectors.every(Boolean), selectors.every(Boolean) ? 'scale and table hooks present' : 'missing data-qa hooks');

    if (!skipBrowser) {
      try {
        await browserSmoke();
      } catch (error) {
        check('browser-ui-contract', false, error.message);
      }
      try {
        await interactionSmoke();
      } catch (error) {
        check('interaction-probes', false, error.message);
      }
    } else {
      check('browser-ui-contract', true, 'skipped by --skip-browser');
      check('interaction-probes', true, 'skipped by --skip-browser');
    }
  } finally {
    if (keep) {
      process.stdout.write(`kept temp project: ${tempRoot}\n`);
    } else {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  const failed = checks.filter((item) => !item.pass);
  process.stdout.write(`\nSkill self-test: ${checks.length - failed.length}/${checks.length} passed\n`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
