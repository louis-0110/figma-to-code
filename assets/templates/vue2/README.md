# Vue2 参考模板

这个目录是 `scaffold-vue2.mjs` 的唯一组件模板来源，不是"另一套示例代码"。修改脚手架时先改这里的 SFC，再通过 skill 自测验证生成、结构和浏览器行为。

## 自测

在 skill 根目录执行：

```bash
node assets/test-skill.mjs
```

本地 Chrome 离线验证时，显式提供 `PLAYWRIGHT_MODULE` 与 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`。不要因为缺少全局 Playwright 安装而跳过浏览器验收。

## 契约

- `scale-viewport`：整帧滚动容器；`width-adapt` 模式下宽度 100%，高度超出时纵向滚动。
- `stage`：transform 缩放舞台；内部内容仍然用 flex/grid 流式布局。
- `panel-body`：卡片剩余高度导出点；子组件从这里拿到可收缩的 flex 高度。
- `panel-tabs`：页签按钮组；交互冒烟必须点击这里的真实按钮。
- `table-scroll`：表格滚动容器；只允许纵向滚动。
- `table-head`：首个实际 sticky 的 `<th>`；不要挂在外层 `<thead>`。`table-body` 是 tbody 滚动探针。
- `chart`：ECharts canvas 容器；验收时可检查尺寸和实例状态。

## 文件

- `ScaleStage.vue`：viewport > sizer > stage 三层结构，只负责整帧缩放。
- `PanelShell.vue`：标题、页签和卡片 body 的通用壳。
- `TopHeader.vue`：仪表盘顶部导航栏；logo/title 槽 + 页签按钮组 + 右侧内容槽；`data-qa="top-header-{id}"` 和 `data-qa="th-tab-{key}"`。
- `StatCard.vue`：KPI 指标行；icon + label + value + sub，flex 均分 + 分隔线；`data-qa="stat-{id}"`。
- `RankList.vue`：排行列表；排名徽标 + 名称 + 进度条 + 数值，按最大值自动归一化宽度；`data-qa="rank-{id}"`。
- `BaseDataTable.vue`：原生表格底座，首个表头单元格吸顶，tbody 在 wrapper 内滚动。
- `BaseChart.vue`：ECharts 初始化、更新、resize 和销毁底座。
- `TabbedTablePanel.vue`：`columnSets` + `rowsByTab` 的业务面板参考，演示页签驱动列集。
- `assets-manifest.json`：由脚手架从 `assets-manifest.example.json` 生成；记录每个 Figma 视觉节点对应的导出文件、CSS 重建或审议后的忽略原因。

## 交付门

生成页面后，把四门结果保存到项目 `qa/`：`scorecard.json`、`verify-ui.json`、`elasticity.json`、`interaction.json`。先运行素材、运行时和占位符静态检查，再运行 `completion-gate.mjs`；总闸通过前不要把页面标记为完成。

## 占位符

脚手架只替换 `__TITLE__` 与缩放模式入口所需的少量内容；组件模板保持可直接复用的普通 SFC，不使用构建期语法。
