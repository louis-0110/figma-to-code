---
name: figma-to-code
description: Figma MCP 读取设计稿,生成高还原度结构化前端页面(Vue2 无构建 / Vue3+Vite)。含七步管线、自研缩放库、组件架构与踩坑清单。触发:按 Figma 还原页面、大屏缩放、运行时 SFC、驾驶舱。
---

# Figma 设计稿 → 高还原度、结构化前端页面(Vue2 无构建 / Vue3+Vite 双栈)

适用于:内网/离线、禁止构建链(Vue2 栈),或标准工程化(Vue3 栈)的 Figma 还原需求。
成品参考(在 `d:\Projects\figma_demo` 工作区):`edu-dashboard/`(Vue2 无构建,7.28%,2026-09-07)。

## 任务路由(按当前问题进入,不通读)

| 任务 | 先读 | 再执行 |
|---|---|---|
| 新项目开工 | `protocols/environment.md` → `feature-map.md` → `codegen.config.example.json` | doctor → 五问落盘 → 功能扫描 |
| 生成整页 | `protocols/layout.md` → `patterns/vue2-dashboard-architecture.md` | 七步管线 + 模式匹配 + tokens |
| 生成表格/滚动区 | `patterns/data-table.md` → `patterns/scroll-card.md` | columnSets + 独立 tbody 滚动 |
| 缩放异常 | `protocols/scale.md` | 用 `verify-ui.mjs` 验宽度/滚动 |
| 交付前验收 | `protocols/verification.md` | scorecard + verify-ui + 交互冒烟 |
| MCP 掉线 | `protocols/environment.md` | 诊断顺序,不猜频道 |
| 生成前排雷 | `protocols/pitfalls.md` | 只应用最终规则,案例看 lessons |

## 捆绑资源

字体/管线工具/素材工具/验收工具/MCP 运行时全部在 `assets/` 下,新项目直接拷,免下载。完整清单见 `assets/tools.md`。

关键入口:

| 用途 | 工具/文件 |
|---|---|
| 环境自检 | `node <skill>/assets/doctor.mjs <项目根>` |
| 开工问卷 schema | `assets/codegen.config.example.json` |
| 配置校验 | `node <skill>/assets/validate-config.mjs <项目根>/codegen.config.json` |
| 功能判据 | `assets/feature-map.md` |
| 模式模板 | `assets/patterns/`(data-table / scroll-card / vue2-dashboard-architecture 等) |
| Vue2 无构建栈 | `assets/protocols/vue2-stack.md`(依赖 + main.js + 冒烟) |
| Vue2 脚手架 | `node <skill>/assets/scaffold-vue2.mjs <项目根>` |
| 缩放库 | `assets/protocols/scale.md` |
| UI 探针 | `node <skill>/assets/verify-ui.mjs --url <URL> ...` |
| 图表 | `assets/protocols/charts.md` |

## 环境配置

MCP / REST token / 运行时诊断详见 `assets/protocols/environment.md`。新项目第一步:跑 `doctor.mjs`。

## 〇、开工协议:选栈 → 扫功能 → 选库(落盘,跨工具契约)

契约版本 `contractVersion: 1`;新建 config 必写。已有 config 先用 `validate-config.mjs` 校验,通过后直接读不重问。

1. **栈问卷**:项目根无 `codegen.config.json` 时问五项(代码类型 / UI 库 / 图表深度 / 交付深度 / **缩放模式**:width-adapt 宽度铺满+高度超出竖向滚动 / actual 原尺寸+双向滚动 / fit 完整显示),写入 config;**已有 config 直接读不重问**,用户说"重新选"→ 删文件重问。
2. **功能扫描**:按 `feature-map.md` 判据识别可组件化功能,**只识别不实施**,先向用户汇总。
3. **库推荐**:仅对检测到的功能发问(每批 ≤4 题);推荐项放第一位附上下文理由;「保持设计稿原样(烘焙)」必为备选;选择写入 `config.features`(带节点 ID)。已记录的功能不重问。
4. **生成**:严格按 config 实施;装饰烘焙 + 数据可视化用库混排。

人性化:未检测到不问;记住上次选择;长尾功能遇到再问;用户说"都按推荐"→ 矩阵默认落盘。

## 一、标准管线(七步;详解见 `assets/protocols/pipeline.md`)

| 步 | 动作 | 工具/来源 | 产物 |
|---|---|---|---|
| 0 | 自检 | `doctor.mjs <项目根>` | 环境 ✓ |
| 1 | 拉树 | MCP `get_node_info`(全量,含隐藏) | node-info.json |
| 2 | 扫描 | `scan-tree.mjs` → 按 feature-map 判据定功能 | 功能清单 |
| 3 | 隐藏 | `detect-hidden.mjs` + 墨迹验证 | 隐藏剔除清单 |
| 4 | 布局 | `layout-infer.mjs`;**列位以像素实测为准** | 布局树 |
| 4.5 | IR+Token | `build-ir.mjs` + `extract-tokens.mjs` | analysis.json + design-tokens.json |
| 4.6 | 规范化 | `normalize-ir.mjs` → 语义组件树 + 页面栅格 | normalized.json |
| 5 | 素材 | 直接 export 或 `crop-assets.mjs` / `extract-card-assets.mjs` | 项目 assets/ |
| 6 | 生成 | Vue2 可用 `scaffold-vue2.mjs` 起骨架;再按模式模板 + 流式规则 + tokens | 页面代码 |
| 7 | 验收 | 四门全过 + `scorecard.mjs` + `verify-ui.mjs` | 达标或返工 |

## 二、生成规则(硬性)

- **布局与缩放**:骨架 flex/grid,组件内 flex+gap;等距重复 ≥3 用 v-for/grid;绝对定位只用于装饰白名单。旧坐标骨架必须删除,不用后加载样式补救;`scale-stage` 只缩放整帧,内部仍流式。详见 `assets/protocols/layout.md`
- **Token**:颜色/字体值必须来自 `design-tokens.json`;出现新值先回查设计稿,不要现场发明。
- **复杂背景**:多层渐变/描边/弧形/光效优先导出或裁切;低 alpha 渐变必须按 fills 的 8 位 alpha 重建,不能按导出图颜色猜。详见 `assets/protocols/pipeline.md`
- **语义与交互**:使用 `aside/header/main/section/nav/h1~h2/table+thead+tbody+th[scope]+td/search/button/真实 input`;可点元素必有 hover/active/focus-visible。搜索、排序、选择、dropdown 按交互基线实现。
- **表格与滚动**:定高内容区内部滚动;表头 sticky 且不透明。面板体 `flex column`,滚动包裹层 `flex:1 1 auto; min-height:0`;页签是列集状态机,用 `columnSets` 驱动。详见 `assets/patterns/data-table.md`
- **数据与图表**:数据全放 `src/data/*.js`,组件只展示;手摆差异逐项写进 data。图表 mounted init、beforeDestroy dispose,canvas 按 `devicePixelRatio` 初始化。
- **库与字体**:iView 定制只用非 scoped 的 `.ivu-xxx` CSS 覆写,不魔改库;Table 末列不设固定 width。字体优先捆绑包或 `get-fonts.mjs`,近似替代要在项目里记录。
- **防御式文字**:标题、标签和数值用 flex 行流式排列;长文本 `nowrap + ellipsis`,数字用窄字体栈。

## 三、验收门(四门全过才算完;详解 `assets/protocols/verification.md`)

1. **像素**:标准视口截图 vs 导出图,显著差异占比达标,无结构错位
2. **单向墨迹**:design 空白 && shot 有内容的连通块 >60px = 多渲染,逐块归零
3. **结构 + 弹性 + 滚动**:无旧坐标残留;超长文本/增删行不溢出;定高内容区内部滚动 + 表头吸顶。`verify-ui.mjs` 验缩放舞台宽度、短视口滚动、表头稳定
4. **交互冒烟**:搜索过滤 / 排序 / 全选-行选 / dropdown / 页签切列集,逐项断言

截图前 navigate 后等 1~1.5s(settle)。

## 四、Vue2 无构建栈

依赖矩阵、main.js 骨架、冒烟流程详见 `assets/protocols/vue2-stack.md`。新项目优先用 `scaffold-vue2.mjs` 生成统一骨架,再进入页面还原。Vue3 栈用 vue@3.4 + Vite + view-ui-plus。

## 五、缩放与图表

- 缩放库 screen-scale.js 接口、模式选型、陷阱详见 `assets/protocols/scale.md`
- 图表配置速查(环形/椭圆环/3D 饼/柱折线)详见 `assets/protocols/charts.md`

## 六、坑速查(top 5;完整分类清单见 `assets/protocols/pitfalls.md`)

1. **可见性陷阱**:节点级 `visible` 不进 MCP 序列化,隐藏元素会被无脑还原。
2. **坐标系陷阱**:INSTANCE 子节点 bbox 可能是源组件坐标,列位以像素实测为准。
3. **低 alpha 渐变**:导出图是深色原色,不是渲染浅色;读 fills 的 8 位 alpha 重建。
4. **装饰宿主**:absolute 伪元素的宿主必须有 `position:relative`。
5. **页签状态机**:不同状态可能换列集和字段;逐状态读表头/首行,Playwright 真实点击。

生成前先扫 `assets/protocols/pitfalls.md` 的「生成前必查」。

## 索引(渐进详情)

### 协议

- `assets/protocols/pipeline.md` — 七步管线详解 + 隐藏节点仲裁 + 素材规则
- `assets/protocols/layout.md` — 流式布局协议(推导管线 + 代码映射 + 陷阱)
- `assets/protocols/verification.md` — 四门验收详解(工具/阈值/探针手法)
- `assets/protocols/pitfalls.md` — 最终坑规则;`lessons.md` 只补案例
- `assets/protocols/lessons.md` — 实战编年史(含被修正的结论)
- `assets/protocols/environment.md` — MCP / REST token / 运行时诊断
- `assets/protocols/vue2-stack.md` — Vue2 无构建栈(依赖 + 骨架 + 冒烟)
- `assets/protocols/scale.md` — 缩放库接口 + 模式 + 陷阱
- `assets/protocols/charts.md` — 图表配置速查

### 模式与工具

- `assets/feature-map.md` — 功能判据与候选库矩阵
- `assets/tools.md` — 捆绑资源完整清单
- `assets/patterns/vue2-dashboard-architecture.md` — Vue2 组件分层;生成前读取
- `assets/patterns/data-table.md` — 数据表模式(结构 + 交互 + 陷阱)
- `assets/codegen.config.schema.json` — config JSON Schema
- `assets/validate-config.mjs` — config 校验器
- `assets/scaffold-vue2.mjs` — Vue2 无构建骨架生成器
- `assets/verify-ui.mjs` — Playwright 结构/缩放/表头探针
