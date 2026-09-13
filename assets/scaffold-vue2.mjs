#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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

function file(relativePath, content) {
  return { path: relativePath, content };
}

function template(config, warnings) {
  const mode = ['width-adapt', 'actual', 'fit', 'fill-height', 'stretch']
    .includes(config.scale) ? config.scale : 'width-adapt';
  if (config.scale === 'custom') {
    warnings.push('custom scale needs project-specific zoom controls; ScaleStage uses width-adapt until implemented');
  }

  const index = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title || 'Figma Dashboard'}</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="lib/iview.css">
  <link rel="stylesheet" href="src/styles/base.css">
  <script src="lib/vue.min.js" defer><\/script>
  <script src="lib/vue2-sfc-loader.js" defer><\/script>
  <script src="lib/screen-scale.js" defer><\/script>
  <script src="lib/iview.min.js" defer><\/script>
  <script src="lib/echarts.min.js" defer><\/script>
  <script src="src/main.js" defer><\/script>
</head>
<body>
  <div id="app"></div>
</body>
</html>
`;

  const main = `(() => {
  'use strict';

  window.addEventListener('DOMContentLoaded', () => {
    if (!window.Vue || !window.iview || !window.ScreenScale || !window['vue2-sfc-loader']) {
      throw new Error('Vue2 scaffold requires local vue.min.js, vue2-sfc-loader.js, screen-scale.js and iview.min.js in lib/');
    }

    Vue.config.productionTip = false;
    Vue.use(window.iview);

    const { loadModule } = window['vue2-sfc-loader'];
    const sfcOptions = {
      moduleCache: { vue: Vue },
      async getFile(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(response.statusText + ' ' + url);
        return {
          type: url.endsWith('.js') ? '.mjs' : '.vue',
          getContentData: () => response.text()
        };
      },
      addStyle(text) {
        const style = document.createElement('style');
        style.textContent = text;
        document.head.appendChild(style);
      }
    };

    new Vue({
      el: '#app',
      template: '<App />',
      components: {
        App: () => loadModule('src/App.vue', sfcOptions)
      }
    });
  });
})();
`;

  const app = `<template>
  <ScaleStage mode="${mode}" :width="1920" :height="1080">
    <div class="screen-content">
      <header class="page-header">
        <h1>${config.title || 'Figma Dashboard'}</h1>
      </header>
      <main class="dashboard-grid">
        <PanelShell title="示例记录" variant="default">
          <BaseDataTable :columns="table.columns" :rows="table.rows" />
        </PanelShell>
        <PanelShell title="示例图表" variant="muted">
          <BaseChart :option="chartOption" label="示例图表" />
        </PanelShell>
      </main>
    </div>
  </ScaleStage>
</template>

<script>
import ScaleStage from './components/layout/ScaleStage.vue';
import PanelShell from './components/common/PanelShell.vue';
import BaseDataTable from './components/base/BaseDataTable.vue';
import BaseChart from './components/base/BaseChart.vue';
import demo from './data/demo.js';

export default {
  name: 'GeneratedApp',
  components: { ScaleStage, PanelShell, BaseDataTable, BaseChart },
  data() {
    return { table: demo.table, chartSource: demo.chart };
  },
  computed: {
    chartOption() {
      return {
        grid: { left: 42, right: 18, top: 24, bottom: 30 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: this.chartSource.labels },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: this.chartSource.values, smooth: true }]
      };
    }
  }
};
</script>

<style>
.screen-content {
  height: 100%;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  min-width: 0;
}

.page-header h1 {
  margin: 0;
  color: #17233d;
  font-size: 28px;
  line-height: 1.25;
}

.dashboard-grid {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
</style>
`;

  const scaleStage = `<template>
  <div class="scale-viewport" ref="viewport">
    <div class="scale-sizer" ref="sizer">
      <div
        class="scale-stage"
        ref="stage"
        :style="{ width: width + 'px', height: height + 'px' }"
      >
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ScaleStage',
  props: {
    mode: { type: String, default: 'width-adapt' },
    width: { type: Number, default: 1920 },
    height: { type: Number, default: 1080 }
  },
  mounted() {
    this.scaleInstance = window.ScreenScale.create({
      target: this.$refs.viewport,
      sizer: this.$refs.sizer,
      stage: this.$refs.stage,
      mode: this.mode,
      width: this.width,
      height: this.height
    });
  },
  beforeDestroy() {
    if (this.scaleInstance) this.scaleInstance.destroy();
    this.scaleInstance = null;
  }
};
</script>

<style>
.scale-viewport {
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  align-items: flex-start;
}

.scale-sizer {
  position: relative;
  flex: 0 0 auto;
}

.scale-stage {
  position: relative;
  transform-origin: left top;
  background: #f3f5f9;
}
</style>
`;

  const panelShell = `<template>
  <section class="panel" :class="'panel-' + variant" :aria-label="title">
    <div class="panel-head">
      <h2>{{ title }}</h2>
      <div v-if="tabKeys.length" class="panel-tabs" role="tablist">
        <button
          v-for="key in tabKeys"
          :key="key"
          type="button"
          role="tab"
          :aria-selected="key === value"
          :class="{ active: key === value }"
          @click="$emit('input', key)"
        >{{ labels[key] || key }}</button>
      </div>
    </div>
    <div class="panel-body">
      <slot></slot>
    </div>
  </section>
</template>

<script>
export default {
  name: 'PanelShell',
  props: {
    title: { type: String, required: true },
    variant: { type: String, required: true },
    value: { type: String, default: '' },
    tabs: { type: Object, default: () => ({}) },
    labels: { type: Object, default: () => ({}) }
  },
  computed: {
    tabKeys() {
      return Object.keys(this.tabs);
    }
  }
};
</script>

<style>
.panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e5e9f2;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(31, 45, 61, .06);
}

.panel-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
}

.panel-head h2 {
  margin: 0;
  color: #17233d;
  font-size: 18px;
  line-height: 1.3;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.panel-tabs {
  display: flex;
  gap: 4px;
}

.panel-tabs button {
  border: 0;
  padding: 6px 12px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}

.panel-tabs button.active,
.panel-tabs button:hover,
.panel-tabs button:focus-visible {
  color: #2d8cf0;
  background: rgba(45, 140, 240, .1);
}

.panel-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 4px 8px;
}
</style>
`;

  const dataTable = `<template>
  <div class="table-wrapper">
    <table class="data-table">
      <colgroup>
        <col v-for="column in columns" :key="column.key" :style="columnStyle(column)">
      </colgroup>
      <thead>
        <tr>
          <th v-for="column in columns" :key="'head-' + column.key" scope="col">{{ column.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td
            v-for="column in columns"
            :key="row.id + '-' + column.key"
            :title="column.ellipsis ? row[column.key] : null"
          >{{ row[column.key] }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
export default {
  name: 'BaseDataTable',
  props: {
    columns: { type: Array, required: true },
    rows: { type: Array, required: true }
  },
  methods: {
    columnStyle(column) {
      return column.width ? { width: column.width + 'px' } : null;
    }
  }
};
</script>

<style>
.table-wrapper {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.data-table {
  width: 100%;
  height: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 0 12px;
  text-align: left;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.data-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 40px;
  background: #f7f8fa;
  color: #515a6e;
  font-weight: 500;
}

.data-table td {
  height: 38px;
  border-bottom: 1px solid #eef0f4;
  color: #333;
}
</style>
`;

  const baseChart = `<template>
  <div class="chart" role="img" :aria-label="label" ref="chart"></div>
</template>

<script>
export default {
  name: 'BaseChart',
  props: {
    option: { type: Object, required: true },
    label: { type: String, default: 'chart' }
  },
  mounted() {
    if (!window.echarts) throw new Error('BaseChart requires local echarts.min.js');
    this.chart = window.echarts.init(this.$refs.chart, null, { renderer: 'canvas' });
    this.chart.setOption(this.option);
    this.resizeObserver = new ResizeObserver(() => this.chart && this.chart.resize());
    this.resizeObserver.observe(this.$refs.chart);
    window.addEventListener('screen-scale', this.handleScale);
  },
  watch: {
    option: {
      deep: true,
      handler(value) {
        if (this.chart) this.chart.setOption(value);
      }
    }
  },
  beforeDestroy() {
    window.removeEventListener('screen-scale', this.handleScale);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.chart) this.chart.dispose();
    this.resizeObserver = null;
    this.chart = null;
  },
  methods: {
    handleScale() {
      this.$nextTick(() => this.chart && this.chart.resize());
    }
  }
};
</script>

<style>
.chart {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
</style>
`;

  const demo = `export default {
  table: {
    columns: [
      { key: 'name', label: '名称', width: 180, ellipsis: true },
      { key: 'status', label: '状态', width: 120 },
      { key: 'time', label: '时间' }
    ],
    rows: [
      { id: 'row-1', name: '正常运行记录', status: '正常', time: '08:00' },
      { id: 'row-2', name: '巡检完成后的一条很长名称记录', status: '巡检', time: '10:30' },
      { id: 'row-3', name: '告警', status: '待处理', time: '13:45' }
    ]
  },
  chart: {
    labels: ['周一', '周二', '周三', '周四', '周五'],
    values: [12, 19, 8, 24, 17]
  }
};
`;

  const baseCss = `:root {
  --page-bg: #f3f5f9;
  --title: #17233d;
  --body-text: #333;
  --line: #eef0f4;
  --table-head: #f7f8fa;
}

* { box-sizing: border-box; }

html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  background: var(--page-bg);
  color: var(--body-text);
  font-family: "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
}

h1,
h2 {
  min-width: 0;
}

button,
input {
  font: inherit;
}

.scale-viewport::-webkit-scrollbar { width: 8px; height: 8px; }
.table-wrapper::-webkit-scrollbar { width: 6px; height: 6px; }
.scale-viewport::-webkit-scrollbar-thumb,
.table-wrapper::-webkit-scrollbar-thumb {
  background: rgba(81, 90, 110, .3);
  border-radius: 4px;
}
`;

  return [
    file('index.html', index),
    file('src/main.js', main),
    file('src/App.vue', app),
    file('src/styles/base.css', baseCss),
    file('src/data/demo.js', demo),
    file('src/components/layout/ScaleStage.vue', scaleStage),
    file('src/components/common/PanelShell.vue', panelShell),
    file('src/components/base/BaseDataTable.vue', dataTable),
    file('src/components/base/BaseChart.vue', baseChart)
  ];
}

async function readConfig(target) {
  const configPath = join(target, 'codegen.config.json');
  try {
    return JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${configPath}: ${error.message}`);
  }
}

async function existingFiles(dir, result = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await existingFiles(path, result);
    else result.push(path);
  }
  return result;
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
  const files = template(config, warnings);
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

if (process.argv[1] && process.argv[1].endsWith("scaffold-vue2.mjs")) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
