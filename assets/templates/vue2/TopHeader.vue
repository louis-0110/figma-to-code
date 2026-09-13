<template>
  <header class="top-header" :data-qa="'top-header-' + id">
    <div class="th-left">
      <slot name="logo">
        <span class="th-logo-box" aria-hidden="true"></span>
      </slot>
      <span class="th-title">{{ title }}</span>
    </div>
    <nav class="th-nav" v-if="tabs.length">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="th-tab"
        :class="{ 'th-tab-active': tab.key === active }"
        :data-qa="'th-tab-' + tab.key"
        @click="$emit('tab', tab.key)"
      >{{ tab.label }}</button>
    </nav>
    <div class="th-right"><slot name="right"></slot></div>
  </header>
</template>
<script>
export default {
  name: 'TopHeader',
  props: {
    id: { type: String, default: 'bar' },
    title: { type: String, default: '' },
    tabs: { type: Array, default: function () { return []; } },
    active: { type: String, default: '' }
  }
};
</script>
<style>
.top-header {
  position:relative; width:100%; height:59px; z-index:30;
  display:flex; align-items:center; padding:0 28px 0 16px;
  background:linear-gradient(95deg,#2a6cdd 0%,#4a8eff 48%,#1764e8 100%);
  box-shadow:0 4px 14px rgba(10,30,90,.18);
}
.th-left { display:flex; align-items:center; gap:10px; }
.th-logo-box { width:25px; height:25px; border-radius:4px; background:linear-gradient(135deg,#fff 40%,#bfe1ff); }
.th-title { color:#fff; font-size:25px; font-weight:700; letter-spacing:1px; text-shadow:0 1px 2px rgba(0,20,80,.25); }
.th-nav { display:flex; align-items:center; height:100%; margin-left:26px; }
.th-tab {
  height:100%; display:inline-flex; align-items:center; padding:0 30px;
  background:transparent; border:none; color:#eaf3ff; font-size:16px; cursor:pointer;
}
.th-tab-active { background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(255,255,255,.78)); color:#1764e8; font-weight:700; }
.th-tab:hover:not(.th-tab-active) { background:rgba(255,255,255,.1); }
.th-right { margin-left:auto; display:flex; align-items:center; gap:12px; }
</style>
