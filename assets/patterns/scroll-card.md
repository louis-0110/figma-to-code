# scroll-card.md — 定高滚动卡模式

## IR 签名
- 固定尺寸卡片(section)内:`column` 列表/grid-repeat 内容,内容恰满或被画布裁切
- build-ir 的 `scrollCandidates`(内容高 ≥ 父高 60%)即候选

## 语义结构
```html
<section aria-label="XX列表">
  <div class="hd"><h2>标题</h2><a>次操作</a></div>
  <ul class="rows" role="list">
    <li v-for class="row">…</li>
  </ul>
</section>
```

## 滚动实现
- `.rows { max-height: <内容恰满高度>; overflow-y:auto }` —— 初始无滚动条,增行即出
- 阈值 = 标题区以下到卡片底的**内容恰满**高度(行高×N + gap×(N-1))
- 细滚动条:webkit 8px 圆角灰 + Firefox `scrollbar-width:thin`
- ⚠️ 画布裁切 ≠ 卡内滚动:档案页列表被 1024 画布裁切的部分不参与阈值(阈值仍取卡内恰满)

## 陷阱
- 行 hover 底色要加圆角,否则贴边突兀
- 列表行内容若跨卡溢出(复用组件比卡宽)→ 卡 overflow:visible + 兄弟卡 DOM 靠后覆盖
- ul 默认 padding/margin/list-style 必须重置(语义化改造最常见的回归来源)
