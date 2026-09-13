<template>
  <div class="stat-card" :data-qa="'stat-' + id">
    <div class="stat-block" v-for="b in blocks" :key="b.key">
      <div class="stat-top">
        <span class="stat-icon" v-if="b.icon" v-html="b.icon"></span>
        <span class="stat-label">{{ b.label }}</span>
      </div>
      <div class="stat-value num">{{ b.value }}</div>
      <div class="stat-sub" v-if="b.sub">{{ b.sub }}</div>
    </div>
  </div>
</template>
<script>
export default {
  name: 'StatCard',
  props: {
    id: { type: String, default: 'card' },
    blocks: { type: Array, required: true }
  }
};
</script>
<style>
.stat-card { height:100%; padding:10px 20px 14px; display:flex; }
.stat-block { flex:1; display:flex; flex-direction:column; justify-content:center; padding:0 18px; position:relative; }
.stat-block + .stat-block::before { content:''; position:absolute; left:0; top:16%; height:68%; width:1px; background:#e6edf7; }
.stat-top { display:flex; align-items:center; gap:8px; }
.stat-icon { display:flex; align-items:center; }
.stat-label { font-size:16px; color:#333; }
.stat-value { margin-top:14px; font-size:30px; font-weight:700; color:#001045; }
.stat-sub { margin-top:8px; font-size:14px; color:#666; }
</style>
