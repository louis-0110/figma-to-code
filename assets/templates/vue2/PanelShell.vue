<template>
  <section class="panel" :class="'panel-' + variant" :aria-label="title">
    <div class="panel-head">
      <h2>{{ title }}</h2>
      <div
        v-if="tabKeys.length"
        class="panel-tabs"
        role="tablist"
        data-qa="panel-tabs"
      >
        <button
          v-for="key in tabKeys"
          :key="key"
          type="button"
          role="tab"
          :data-qa="'panel-tab-' + key"
          :aria-selected="key === value"
          :class="{ active: key === value }"
          @click="$emit('input', key)"
        >{{ labels[key] || key }}</button>
      </div>
    </div>
    <div class="panel-body" data-qa="panel-body">
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
  color: var(--title, #17233d);
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
