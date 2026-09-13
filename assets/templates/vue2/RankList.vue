<template>
  <div class="rank-list" :data-qa="'rank-' + id">
    <div class="rank-row" v-for="(r, i) in rows" :key="r.id || i">
      <span class="rank-badge num" :class="{ 'rank-badge-top': i < 3 }">{{ i + 1 }}</span>
      <span class="rank-name">{{ r.name }}</span>
      <span class="rank-bar"><span class="rank-fill" :style="{ width: fillWidth(r.value) }"></span></span>
      <span class="rank-val num">{{ r.value }}</span>
    </div>
  </div>
</template>
<script>
export default {
  name: 'RankList',
  props: {
    id: { type: String, default: 'list' },
    rows: { type: Array, required: true }
  },
  methods: {
    fillWidth: function (v) {
      var max = Math.max.apply(null, this.rows.map(function (r) { return Number(r.value) || 0; }));
      if (!max) return '6%';
      return Math.max(6, Math.round((Number(v) / max) * 100)) + '%';
    }
  }
};
</script>
<style>
.rank-list { height:100%; padding:6px 16px 10px; display:flex; flex-direction:column; justify-content:space-around; }
.rank-row { display:flex; align-items:center; gap:10px; }
.rank-badge { width:20px; height:20px; flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; background:#8fa8c8; color:#fff; font-size:13px; font-weight:700; border-radius:50%; }
.rank-badge-top { background:linear-gradient(135deg,#2d81f3,#1867ff); }
.rank-name { flex:1; font-size:14px; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rank-bar { flex:1; height:8px; border-radius:5px; background:#e8ecf1; overflow:hidden; position:relative; }
.rank-fill { position:absolute; left:0; top:0; height:100%; border-radius:5px; background:linear-gradient(90deg,#2d81f3,#1867ff); }
.rank-val { width:40px; text-align:right; font-size:18px; font-weight:700; color:#1867ff; }
</style>
