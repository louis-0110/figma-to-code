# vue2-dashboard-architecture.md — Vue2 无构建驾驶舱组件分层

适用范围:Vue2 + vue2-sfc-loader + iView 的驾驶舱、多卡片后台或大屏页面。普通单表单页不需要整套分层;Vue3 工程化项目参考本地组件习惯,不要照搬无构建目录。

这份契约是生成阶段的组件规划接口。先用 IR 判断页面分区,再把 Figma 语义映射到下面的层;不要为了"看起来像组件"把每个 DOM 块都拆成文件。

## 目录契约

```text
src/
  App.vue                     页面唯一装配层:数据注入、跨卡状态、页面分区
  main.js                     Vue/iView/vue2-sfc-loader 启动
  styles/base.css             全局 token、reset、通用字体和滚动条
  data/*.js                   静态数据、页签数据、列集输入、压测数据工厂
  components/
    layout/ScaleStage.vue     1920×1080 整帧缩放,不含业务
    cards/KpiCard.vue          小颗粒展示卡;一屏多张时 v-for
    panels/*.vue               业务面板,按 Figma 卡片边界建模
    common/PanelShell.vue      卡片壳:标题、页签、body 弹性布局
    base/BaseDataTable.vue     原生表格技术底座
    base/BaseChart.vue         ECharts 生命周期技术底座
    charts/*.vue               具体业务图表,只把 source 转成 option
```

命名即角色:`Base*` 不含业务文案;`Panel*` 是业务卡片;`*Chart` 只维护图表配置;`cards/*` 与 `panels/*` 不要塞进同一网格容器。

## 公共组件接口

### ScaleStage

```vue
<ScaleStage ref="screenStage" mode="width-adapt" :width="1920" :height="1080">
  <div class="screen-content"><!-- 流式页面 --></div>
</ScaleStage>
```

- Props:`mode`(默认 `width-adapt`)、`width`、`height`。
- 内部三件套固定为 viewport(滚动容器)> sizer(设计尺寸)> stage(transform 舞台);组件 mounted 创建 `window.ScreenScale`,beforeDestroy 销毁。
- 舞台内部仍必须用 flex/grid 和 `minmax(0, 1fr)`;缩放组件不能成为绝对定位骨架的借口。
- App 的跨卡状态、页面标题、全局筛选放在 stage 内;不要放进 ScaleStage。

### PanelShell

```vue
<PanelShell
  title="外委人员门禁记录"
  variant="access"
  v-model="activeTab"
  :tabs="records"
  :labels="labels"
>
  <BaseDataTable :columns="columns" :rows="currentRows" />
</PanelShell>
```

- Props:`title`(必填)、`variant`(必填,映射卡片背景/主题类)、`tabs`、`labels`、`value`;`v-model` 负责页签状态。
- `tabs` 是 `{ tabKey: rows }`;`labels` 是 `{ tabKey: 显示文案 }`。没有页签时只传标题和 variant。
- Head 是 `flex:0 0 auto`,body 是 `flex:1 1 auto; min-height:0; display:flex; flex-direction:column`。业务面板靠这个契约把剩余高度交给表格/图表。
- 卡片背景、圆角、阴影、标题、页签激活态都在壳内;每个 Panel 实例不得重复写这些规则。

### BaseDataTable

```js
columns: [
  { key: 'project', label: '标段名称', width: 171, ellipsis: true },
  { key: 'photo', label: '照片', width: 91, type: 'photo', altKey: 'name', altSuffix: '通行照片' }
]
```

- Props:`columns`、`rows`。组件不认识业务页签名,也不保存列集;列集和 `activeTab -> columns/rows` 的计算留在 Panel。
- 列配置使用 `key/label/width/ellipsis`;特殊单元格用 `type` 和辅助字段,例如 `type:'photo' + altKey + altSuffix`。新增单元格类型前先确认它在多个页面可复用。
- 探针契约固定:`table-scroll` 在滚动 wrapper 上,`table-head` 在首个 sticky `<th>` 上;不要把 `table-head` 挂到 `<thead>`。
- 行优先用稳定 `id` 作为 key;结构不同页签的数据不要强行合成一套行对象,按页签分组成 `records.today` / `records.inactive`。
- 滚动职责固定:wrapper `flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden`,`thead th` sticky 且有不透明背景,`table` 高度 100% 保证行数不足也撑满容器。

### BaseChart

```vue
<BaseChart :option="option" :label="安全生产趋势" />
```

- Props:`option`、`label`。mounted 初始化 ECharts,`option` 深度 watch 后 `setOption`,监听 `resize` 与 `screen-scale`,beforeDestroy 移除监听并 dispose。
- `charts/*.vue` 接收业务 `source` prop,用 computed 生成 option;不调用 `echarts.init`,不接触 canvas/DOM。
- 图表容器尺寸由父级面板和 flex/grid 决定;避免把一处设计的 579×275 写成通用组件常量。

## App 与数据层

- `App.vue` 是唯一页面装配层:引入一个 data 模块,按分区传 props;跨卡片状态(如全局单位筛选)放在这里。
- 页面骨架推荐两个语义容器:`kpi-row`(同构 KPI 卡)和 `dashboard-grid`(同构或固定命名的业务面板区)。同一 grid 轨道必须语义、层级和尺寸策略一致。
- `data/*.js` 承载示例值、单位、KPI、页签行、图表序列和 `?tableStress=1` 压测工厂。组件接后端时只改 data 或请求层。
- 压测工厂必须遍历所有页签状态,为每个状态的列字段生成超长文本、日期、照片和稳定 id;只压测默认页签会在切页签后漏掉横向溢出和字段缺失。
- 资源路径使用 `/assets/...`;生成前逐个核对 SFC/data 中引用的 PNG 已落盘。

## 生成流程接入

1. IR 识别页面分区后,先标注哪些区是 KPI 行、业务面板、图表、表格、公共筛选器。
2. Vue2 驾驶舱按本契约列组件清单,再逐个从 normalized IR 映射 props 和数据形状。
3. 无构建新项目先运行 `scaffold-vue2.mjs`;它的组件来源是 skill 内 `assets/templates/vue2/`,生成后再替换业务内容,不复制旧项目散落 HTML。
4. `App.vue` 装配完成即可先冒烟;随后按 PanelShell + base 组件扩展,避免先生成散落 HTML 再返工。
5. 验收时断言组件关系与架构一致:`viewport > sizer > stage`、panel body 有剩余高度、表格滚动区可滚、图表随缩放 resize、页签切换精确列集。具体探针见 `assets/protocols/verification.md`。
