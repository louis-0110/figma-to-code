<template>
  <ScaleStage mode="__SCALE_MODE__" :width="1920" :height="1080">
    <div class="screen-content">
      <header class="page-header">
        <h1>__TITLE__</h1>
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
  color: var(--title, #17233d);
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
