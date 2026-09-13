# lessons.md — 实战编年史

> 本文档记录演变过程与被修正的结论(含修正过程本身)。"当前正确做法"以 SKILL.md 主文档与 pipeline/layout/verification 三个协议为准;当两者冲突,以协议为准。

## 第一轮:edu-dashboard-vue2(教育培训驾驶舱,Vue2 无构建)

- 全页像素对比 13.5%;顶栏(渐变+光斑+文字)整体烘焙后 9.3%,确立"复杂装饰烘焙 + 交互热区"路线
- 建立主力栈:Vue 2.7 + vue2-sfc-loader + iView 3.5.4 + ECharts + Highcharts 3D + 自研 screen-scale(sizer 模式)
- 该成品后被用户清理;经验沉淀进本 Skill

## 第二轮:导出图陷阱(驾驶舱返工)

- Figma 导出 ~2000px 上限且 JPG 重编码:采样系数必须从**实际尺寸**推导,按请求 scale 假设 → 右/下侧探针全打钳位边缘 → 据此把四张白卡误改成蓝面板
- GROUP 包围盒 ≠ 卡片白底边界(矢量溢出撑大 bbox)→ 边界探针逐卡校准
- 数据模块 `.mjs` 标记、半透明导出图垫底色等基础坑在此轮定型

## 第三轮:细节还原 + 防御性布局

- 素材清单覆盖"功能性小组件"(统计框底图/pill/装饰环);纯渐变节点读 gradientStops 写 CSS
- iView Table 列宽和 < 表宽、末列不设 width;防御式 nowrap/ellipsis;DIN 窄字体栈
- 标准视口截图纪律(缩放态截图 31% 假警报);图表选型按稿实际(环形进度/柱/折线→ECharts;3D 饼→Highcharts;平面环+底图→pie 双值+导图叠底)

## 第四轮:Repair tracker(Vue2,0.43%)

- Vue2 根实例 template 替换挂载元素 → 缩放初始化进 App.vue mounted 用 `this.$el`
- 手摆稿卡片文字内偏移逐个不同(18/17/16px)→ 逐元素坐标进 data
- screen-scale v1.1→v1.3:width-adapt 双吸引子振荡(滚动条出现/消失循环)→ 基于无滚动条尺寸一次性决策
- TalkToFigma 导出三坑:SVG 参数无效;分号 ID 报错;圆角 Frame 四角不透明白
- 逐行墨迹分布法确立(区分整体错位 vs 字形抗锯齿);可变字体本地化(单文件全权重)

## 第五轮:Vue3 工程化 + 开工协议(figma-vue3-customers 初版,2.59%)

- 协议全流程(问卷→扫描→落盘→生成)首次实测;iView Vue3 版包名 = **view-ui-plus**(view-design@4 peer 是 Vue2;view-design-plus 不存在)
- 组件内坐标必须用父卡内坐标;HMR 混合态 DOM 不可信
- inline-block strut 撑行距 → flex;ECharts 椭圆环 = 长边正方形容器 + scaleY;环参数双向扫描反推
- 字重逐项对表(500/900/换字体);TT Hoves 商业字体近似 = irreducible diff
- 素材裁剪源选 1x PNG;复用组件逐行 override

## 第六轮:流式布局 + 隐藏元素(2.59% → 2.67%,布局正确性大升)

- 用户指出绝对定位泛滥 → layout-infer.mjs 布局推导 + 全页流式重构(骨架 flex/行 grid/列表 v-for);**双验收**确立(像素 + 弹性测试)
- 流式重构曾到 4.9% 再逐项校准回来:主区 -2px 重叠、行文字列顶对齐、月历 strut、渲染 settle 等待
- **隐藏元素 saga(重点,含误判与修正)**:
  1. 用户选中 28:1320 → 首次发现节点级 visible 全 MCP 不序列化,隐藏变体行被还原 → 剔除
  2. 用户问"能否自动" → 实测 scan_nodes_by_types 跳过隐藏顶层节点 → detect-hidden.mjs 差集管线
  3. 用户提供 REST token → fetch-visible.mjs 拉到"+509 隐藏节点"(每行 Button/PayPal/Check/more)→ 与导出图 0.00% 一致 → 当时误判"REST 不可信,渲染图为裁判"
  4. 用户再次指认按钮/more 确实隐藏 → 干净区域墨迹实测(按钮区 0px 墨迹)证实 **REST 是对的** → 全部剔除
  - 两个误判教训:①"两导出一致"只证明导出稳定,不证明元素可见;② 区域墨迹扫描被邻卡(日历格/Performance 标题)污染,误判"金额部分行可见"做出 showAmount 又回滚
- 顺带挖出:日历星期对位 bug(2022-03-01 周二,红细胞 14/15);`scan_nodes_by_types` 的摆放系坐标可作为列位可靠数据源
- 最终 2.67%,剩余 diff = TT Hoves 近似 + 字形抗锯齿(irreducible)

## 第七轮:全管线联调(帧 10 Orders 表格页,2026-09-03)

- **七步管线首跑全通**:doctor → 拉树 → 扫描(table 判定)→ 隐藏(无)→ 布局(表头列宽直接可用)→ 素材(9 项裁剪)→ 生成 → 验收(1.98%,全场最佳;弹性测试过)
- 测试暴露并修复的工具问题:
  1. MCP 落盘格式不固定(裸 JSON / `[{type,text}]` 包装)→ scan-tree / layout-infer / detect-hidden 内置宽容加载器 loadJson
  2. Skill 脚本 ESM 依赖按脚本路径解析(cd 无效)→ detect-hidden 改 createRequire 链(脚本目录 → cwd)
  3. Vue3+Vite:SFC 静态 `src="/assets/..."` 文件缺失直接 500(严格模块解析)→ 生成前核对资产齐全;已入坑表 15
  4. 插件导出超时 → REST `GET /v1/images/:key` 降级成功,两通道互为备份;坑表 16
- 生成侧新坑:① 表格分隔线是 0 高线,行距恰 80,divider 占 1px 会使行体 79+1=80(占位独占则累积漂移);② 卡内 padding 不对称(工具栏 24、表格通铺)→ 负边距全宽;③ 头像-名字间距逐列实测(16px 非 12px)
- `?page=` 双页切换落地:SideNav 激活项改为可覆盖 prop,数据双文件(customers.js / customersOrders.js)

## 第八轮:语义化 + 交互 + 滚动区域(figma-vue3-customers 双页,2026-09-04)

- **语义化标签全面落地**:aside/nav/ul/li/a(侧栏)、header/h1/p(顶栏)、main(内容)、section+aria-label(卡片)、h2(卡标题)、table/thead/tbody/th[scope]+colgroup(数据表)、search+真实 input(搜索)、button(一切可点击);占位文字禁止用 span 模拟
- **交互基线落地**:搜索过滤(v-model)、排序三态循环 + aria-sort、全选/行选联动(indeterminate)、dropdown 开合+点外关闭、hover/active/focus-visible;考勤格 title tooltip;Month 弹出菜单
- **滚动区域**:订单表 wrapper max-height 552(表头 72+6 行恰满)+ thead 吸顶;员工列表 max-height 916(13 行恰满);细滚动条样式
- 交互冒烟新坑(**门 4 由本轮确立**):排序比较器把**整行对象**传给数值解析函数(`val(a)` 应传 `a[key]`)→ NaN||0 → 恒 0 → aria-sort 变了但行序不动。教训:交互断言必须"aria 变化 + 行序真实变化"双验,只验 aria 会漏
- 原生表格三坑:① td 默认 inline 布局,头像-文字用 `vertical-align:middle` 对齐(td 内勿改 flex);② 分隔线用 `tbody tr{border-bottom}`(collapse 不占高),divider 行会累积漂移;③ `<search>` 元素 Vue 视为未知组件 → vite `isCustomElement` 或退 `div role="search"`
- 双页改造:`?page=` 切换 + SideNav 激活项可覆盖 prop;行身份字段(avatar)进数据,排序后不串位

## 第九轮:通用化基建(Token/IR/模式/评分卡,2026-09-04)

按用户选定路径 2→1→4→3→5 落地通用页面生成基建:

- **Token 提取**(`extract-tokens.mjs`):色板分 text/fill/border 三类按频次排序、字体组合含样例、圆角/间距统计;tokens.css 骨架变量按频次序命名,语义重命名交给 agent。⚠️ JSDoc 注释里写 `*/` 序列(如 `text-*/fill-*`)会提前闭合块注释
- **IR 固化**(`build-ir.mjs`):融合布局树/文本/素材/滚动候选/隐藏 → analysis.json,生成阶段唯一输入;layout-infer 重构导出 `layoutTree()` 供复用(CLI 行为保留)
- **模式模板库**(`patterns/`):README 索引 + sidebar-nav / top-header / data-table / scroll-card 四篇(IR 签名→语义结构→交互基线→陷阱),其余模式指向参考实现
- **评分卡回归**(`scorecard.mjs` + 项目 `regression.json`):门1/门2 自动量化对比基线(容差 ±0.5pp),门3/门4 输出断言清单;`--update` 播种基线。金样本:profile 2.9% / orders 2.08%
- **第九轮踩出的新坑**:
  1. `normalize` 持有 bbox **对象引用**遍历——根节点归一化把原点改成 0,子孙全部失效;必须先取原点"值"
  2. 排序比较器把**整行对象**传给数值解析函数(`val(a)` 应传 `a[key]`)→ NaN||0 → 恒 0 → aria-sort 变了但行序不动——交互断言必须"aria + 行序"双验
  3. `overflow-y:auto` 连带 overflow-x 变 auto:行内容横向溢出 4px → 横向滚动条占 10px 高 → flex-shrink 压缩行高 → 行距累积漂移;修 = `overflow-x:hidden` + 行 `flex:none`
  4. 卡内 padding 不对称:工具栏 x326(24 padding)、表格 x302 通铺、分页条通铺——逐区块实测,负边距处理
  5. **先完整看基准图再动手**:帧 10 的底部分页条("Show result" + 页码胶囊)直到回归对比才发现缺失——多轮像素迭代掩盖了整块区域的缺失
  6. 分页模式:激活页码黑胶囊 + 强调色文字;页码窗口 ±2 + 首尾;`?page=` 双页切换

### 阶段 3 异构验证结论(教育培育文件,1920×1080 驾驶舱)

- 管线七步在异构文件上**全部工作**:doctor/拉树/Token/扫描/布局/隐藏/导出/评分卡零修改跑通
- Token 提取自动切换到新设计系统:微软雅黑 + DIN 数字栈(正确识别为系统字体,无需下载)、蓝色系 #2b6ddf/#488cff/#1764e8
- 布局推导正确识别:顶栏 split(y@67) + 三列卡网格(gap 16/22)+ 背景层过滤
- 隐藏检测:REST 仅 1 个装饰矢量隐藏(干净设计)
- **首轮 13.23%**(对齐当年教育稿首轮 13.5% 的规律):高密度驾驶舱(12 卡 7 图 3 环)首轮起点天然低;单表格页(Orders)首轮即 2.15%
- 泛化发现:①装饰性等分环(白隔分段、图例承载数据)vs 数据绑定环(进度弧)是两类组件,EduDonut 已支持 even 模式;②满意度环是 **Highcharts 3D**(厚度+透视),EduDonut3D 组件新增;③Highcharts 11 的 3d 模块是**副作用导入**(无 default 导出);④卡片渐变底 #deecff→白 需逐设计系统采样
- 迭代项(冲 3% 需做):满意度 3D 环配色/转角校准、图例列对位、背景光效对位、卡片渐变精确取值——均为已知方法的重复应用,无未知盲区

## 第十轮:大屏驾驶舱流式重构返工(liems 2,2026-09-12)

- 用户先指出整体背景和卡片背景未还原,随后要求 Vue2 + iView 组件化;发现缩放测试四视口全绿,但页面内部仍是旧坐标骨架——**缩放通过 ≠ 布局协议通过**
- 旧 `position:absolute/left/top/width/height` 规则留在基础 CSS,后加载 flow CSS 只能盖掉表象,源码继续误导修复;正确做法是直接删除迁移残留
- 把不同语义层塞进同一 grid 是错误抽象:5 张 KPI 卡和 6 张业务面板尺寸与职责不同,必须拆成 KPI 行和业务面板网格
- 大屏推荐结构:`scale-stage` 只负责 1920×1080 整帧缩放;stage 内部是纵向 flex,固定带放主轴定高(`flex: 0 0 64px/133px`),网格用 `minmax(0, 1fr)` + `min-height/min-width: 0`
- 重构后 Playwright 在 1920×1080、1366×768、1440×900、2560×1395 全部通过,6 面板 + 2 图表正常,console/page error 为 0;1920 像素差异从错误结构的 28.566% 恢复到 7.38%
- 验收缺口因此确立:像素门前先做结构审计,断言关键容器关系、grid 语义和骨架 CSS 无旧坐标残留

## 第十一轮:页签表格与压力收口(liems 2,2026-09-13)

- **页签驱动表格必须逐状态读 Figma**:同一卡片的“长期未开工项目 / 外委人员门禁记录”等页签不只是改标题,表头、字段和特殊列都可能整体变化。不能用第一个状态的列配置套到第二个状态
- 落地形态是把每个页签的列集和示例行拆成 `columnSets`,渲染层用 `columns(activeTab)` 取当前配置;照片/附件等特殊列按各自 render 或作用域插槽处理,激活态、行数和滚动状态归组件状态机管理
- **压测字段要覆盖所有页签**,不是只造第一页签的长数据:每个状态补充超长编号/名称/日期/照片等边界值,再在 Playwright 里断言行数、纵向滚动、无横向溢出、面板内容区撑满和表头吸顶;本轮压测从 6 行克隆到 24 行,验证结果全部通过
- 页签冒烟要用 Playwright 点击真实页签,断言精确表头顺序、首行关键字段、特殊列出现/消失和激活高亮;只检查文案或手动改组件状态会漏掉列集切换配置
- 验收收尾要清理 `.figma-selected.json`、`qa/` 截图/指标和一次性 Playwright 脚本;skill 交付只保留项目必需的 `.vue` 组件、入口、资产、静态服务和最小回归入口

## 第十二轮:Vue2 驾驶舱组件架构沉淀(liems 2,2026-09-13)

- liems 2 拆成 `layout/ScaleStage`、`common/PanelShell`、`base/BaseDataTable`、`base/BaseChart`、业务 `panels/charts/cards` 和纯 `data/*.js` 后,页签、表格滚动和图表缩放回归可定位;组件边界比逐页 HTML 更稳定
- 边界结论:App 只做装配和跨卡状态;ScaleStage 不含业务;PanelShell 管卡片头/body 高度契约;表格不认识页签名,`activeTab -> columns/rows` 留在业务 Panel;业务图表只把 source 转成 option,不触碰 ECharts 实例
- 已沉淀为 `assets/patterns/vue2-dashboard-architecture.md`,作为 Vue2 无构建驾驶舱生成前按需读取的元模式;不把项目源码复制进 skill
## 环境备忘(跨轮次)

- node 不在 PATH → fnm 目录 `~/AppData/Roaming/fnm/node-versions/vx/installation`
- Git Bash `/tmp` 与 node 不互通(node 解析为当前盘 `\tmp`)→ 跨工具传文件用项目内路径
- 静态服务:零依赖 serve.mjs(no-store 头),替代 http-server -c-1
- Figma REST token 存 `.secrets/env`(不入库);出现过的 token 建议 revoke 轮换

