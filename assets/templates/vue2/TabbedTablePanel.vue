<template>
  <PanelShell
    :title="title"
    :variant="variant"
    :value="value"
    :tabs="rowsByTab"
    :labels="labels"
    @input="changeTab"
  >
    <BaseDataTable :columns="currentColumns" :rows="currentRows" />
  </PanelShell>
</template>

<script>
import PanelShell from '../common/PanelShell.vue';
import BaseDataTable from '../base/BaseDataTable.vue';

export default {
  name: 'TabbedTablePanel',
  components: { PanelShell, BaseDataTable },
  model: {
    prop: 'value',
    event: 'change'
  },
  props: {
    title: { type: String, required: true },
    variant: { type: String, required: true },
    value: { type: String, required: true },
    labels: { type: Object, required: true },
    columnSets: { type: Object, required: true },
    rowsByTab: { type: Object, required: true }
  },
  computed: {
    currentColumns() {
      return this.columnSets[this.value] || [];
    },
    currentRows() {
      return this.rowsByTab[this.value] || [];
    }
  },
  methods: {
    changeTab(key) {
      this.$emit('change', key);
    }
  }
};
</script>
