<template>
  <div class="table-wrapper" data-qa="table-scroll">
    <table class="data-table">
      <colgroup>
        <col v-for="column in columns" :key="column.key" :style="columnStyle(column)">
      </colgroup>
      <thead>
        <tr>
          <th
            v-for="(column, index) in columns"
            :key="'head-' + column.key"
            scope="col"
            :data-qa="index === 0 ? 'table-head' : null"
          >{{ column.label }}</th>
        </tr>
      </thead>
      <tbody data-qa="table-body">
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
  background: var(--table-head, #f7f8fa);
  color: #515a6e;
  font-weight: 500;
}

.data-table td {
  height: 38px;
  border-bottom: 1px solid var(--line, #eef0f4);
  color: var(--body-text, #333);
}
</style>
