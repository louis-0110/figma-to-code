# layout.md — 流式布局协议

**原则**:绝对定位只用于装饰白名单(背景层/角标/通知点/叠加图形/图表中心容器/轮播叠层);页面骨架与组件一律流式(flex/grid/文档流)。

## 大屏缩放舞台 + 流式内容

`scale-stage`/ScreenScale 的职责止于把 1920×1080 设计帧映射到视口;它通过不等于内部布局正确。舞台内部仍按正常页面生成:

- 根内容用纵向 flex:筛选条、KPI 行等固定带用 `flex: 0 0 <设计高度>`,自适应区用 `flex: 1; min-height: 0`
- 网格轨道用 `repeat(n, minmax(0, 1fr))`,子项补 `min-width: 0; min-height: 0`,防止图表和长文本撑破轨道
- **grid 是重复语义的容器,不是坐标回收站**:只有同语义、同构、同尺寸的组共用一个 grid;KPI 卡和业务面板分属 `.kpi-row`、`.dashboard-grid` 这类不同容器
- 从 Figma 坐标稿迁移时,删除旧骨架的 `position:absolute/left/top/width/height` 基础 CSS,不要用后加载样式覆盖;残留规则会误导后续生成和修复
- 绝对定位只保留在覆盖层和装饰上;它不能成为页面分区、卡片行列或表单字段的排版手段
- `width-adapt` 的契约是**横向铺满、纵向溢出滚动**:滚动容器 `overflow-x:hidden; overflow-y:auto`,不要在高度接近时切回 fit;只有明确要求"完整显示"时才用 `fit`
- 绝对装饰的宿主显式 `position:relative`;否则 `.panel::before` 会以外层舞台为定位基准,看起来就是卡片背景丢失

## 推导管线(layout-infer.mjs 实现,agent 可人工复核)

1. **背景过滤**:面积 ≥ 父盒 90% 的实心矩形是背景,不参与布局
2. **row/column 判定**:兄弟按 x/y 排序后投影重叠 >60% 且相邻不重叠 → flex;gap 取**中位数**吸收手摆误差
3. **grid-repeat**:等尺寸(±2px)等距(±3px)且 ≥3 → v-for/grid
4. **xy-split**:找最大空白带(容忍 2px 手摆重叠)切一刀,两半递归
5. **残余** → abs-overlay 白名单

## 代码映射

| 层 | 实现 |
|---|---|
| 骨架(页面分区) | flex / grid |
| 组件内行列 | flex + gap(实测中位数) |
| 等距重复 | v-for + 数据驱动 |
| 文本 | nowrap + ellipsis 防崩 |
| 装饰(角标/通知点/中心容器) | absolute(白名单) |

- 双行文字块在混合行内 `align-self: flex-start`(设计为顶对齐;容器 center 会下移 ~2px)
- 设计稿"列重叠"悖论(文字越列压下一列、y 错开侥幸不撞):二选一——**同构允许越列绘制**(还原优先)或 **ellipsis**(防崩优先),逐例决策并注释
- 行内容跨卡溢出是设计稿常态(复用组件比卡宽):忠实还原 = 行按真实列位 + 卡 overflow:visible + 兄弟卡 DOM 靠后自然覆盖(与 Figma 渲染同构)
- **组件内坐标必须用「父卡内坐标」**:帧内绝对坐标写进挂在父卡内的子组件会整体偏移到卡外
- 手摆稿卡片文字内偏移逐个不同(实测 18/17/16px):逐元素实测坐标进 data,勿用统一偏移 + 下标推算

## 滚动区域识别与实现

**判据**:卡片/面板定高 + 内部列表或表格 + 数据条数可变 → 内容区是滚动区域(不是整页滚动)。
设计稿静态图无法直接"看出"滚动,靠两个信号推断:① 内容恰满或被画布裁切(最后一行/项被切半);② 同构页面数据量可变。

**实现模式**:
- 面板内表格优先用 flex 剩余高度:面板体 `flex column`,表格 wrapper `flex:1 1 auto; min-height:0; overflow-y:auto`,表格 `height:100%` 作为最小高度
- 滚动区 = **内容包裹层**(列表 ul/表格 wrapper);仅当该区域独立于父容器时用 `max-height` = 设计稿可见高度,否则用弹性剩余高度
- 表头吸顶:`thead th { position:sticky; top:0; background:表头不透明底色; z-index:1 }`;滚动到底后表头仍贴 wrapper 顶边
- "内容恰满"只用于估算初始行数和滚动阈值;不要把它写成固定高度来对抗视口变化
- 细滚动条:`::-webkit-scrollbar 8px + thumb 圆角灰`;Firefox `scrollbar-width:thin`
- ⚠️ 画布裁切 ≠ 滚动:被舞台外框裁掉的部分不属于卡片滚动区(如档案页列表被 1024 画布裁切,滚动阈值仍取"卡内恰满")

## 已踩实的布局陷阱

1. **inline-block strut**:v-for 元素间换行文本产生 strut,行距被撑大(32→38)。等距小方块网格一律 `display:flex; flex-wrap:wrap`
2. **日历星期对位**:必查 1 号是周几(如 2022-03-01 周二 → leadingOffset=1 前置空格;红细胞随之 14/15 而非 15/16)。格子区常是**不对称 padding**(实测左 19 右 14,格子区宽 326=7×26+6×24 恰好占满;对称 padding 会挤到换行)
3. **ECharts 椭圆环**:radius% 基于 min(w,h)/2,画不了水平满宽椭圆 → 容器取长边正方形 + `scaleY(短/长)`,`transform-origin:50% 0` 防下移;环参数用**径向+角向双向扫描**反推(单方向会把穿过扫描线的段误判成大圆)
4. **复杂装饰烘焙**:渐变+光斑+文字的顶栏整体导图最保真(9.3% vs CSS 重绘 39%),交互区叠透明热区
5. **工具栏放舞台外**:transform 内 fixed 失效
6. **卡内 padding 不对称**:同一卡片内不同区块起点不同(实测工具栏 x326=24 padding、表格 x302 通铺)→ 逐区块实测起点,负边距或分层 padding,勿统一
7. **0 高分隔线**:设计稿 LINE 分隔线占位 0px,行距恰为行高;DOM 里 divider 独占 1px 会使行距 +1 累积漂移 → 用 `tr { border-bottom }`(collapse 模式不占高)或行高减 1
8. **原生表格 vs 语义**:数据表格用真 `<table>`(语义+可访问性),布局用 `table-layout:fixed` + colgroup;行内头像-文字对齐用 `vertical-align:middle`(td 内勿改 display:flex)

## 组件结构约定

- 数据全部 `src/data/*.js`,组件只展示;接后端只改 data
- 图表组件 mounted init / beforeDestroy dispose
- Vue2 无构建:数据模块返回 `{ type:'.mjs' }`;静态资源绝对路径 `/assets/...`
