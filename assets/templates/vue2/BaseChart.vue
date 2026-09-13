<template>
  <div class="chart" role="img" :aria-label="label" ref="chart" data-qa="chart"></div>
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
