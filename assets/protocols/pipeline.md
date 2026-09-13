# pipeline.md — 七步还原管线详解(每步:工具 → 输入 → 输出 → 规则)

> 本文档是"当前正确做法"。历史演变与被修正的结论见 lessons.md。

## 步 0:环境自检与配置约定

`node <skill>/assets/doctor.mjs <项目根>` — 一键体检:node ≥18 / REST token 三级查找链验真 / TalkToFigma MCP 注册扫描(全局 ~/.claude.json + 项目 .mcp.json)/ 3055 桥接 TCP 探测 / 工具池齐全性。✗ 项按提示修复,全过再开工。

**配置约定(秘密不进 Skill)**:
- token 查找链:`FIGMA_TOKEN` 环境变量 → `~/.secrets/figma`(机器级)→ 项目 `.secrets/env`;`.secrets/` 必须 .gitignore;明文出现过的 token 要 revoke 轮换
- MCP 注册:模板 `assets/figma-mcp.example.json`(clone 变体 / npx 变体);配套 `start-mcp.cmd` 已路径自适应,幂等(重复运行只拉一次桥接)
- 注册正确但命令超时 = 插件没开/掉线,重开插件重新 join_channel

## 步 0.5:IR 与 Token(分析固化)

- `build-ir.mjs <node-info.json> [--hidden hidden.json] [--tokens design-tokens.json] [--out analysis.json]`:融合布局树、文本规格、素材清单、滚动候选、隐藏线索 → 生成阶段唯一输入
- `extract-tokens.mjs <node-info.json> --out design-tokens.json --css tokens.css`:色板按 text/fill/border 三类分频次排序;字体组合含样例;⚠️ JSDoc 注释内避免写 `*/` 序列(会提前闭合块注释)

**Token 纪律**:生成代码中每个颜色/字体值必须能在 design-tokens.json 找到对应频次项;新值出现 = 设计理解有误,回查 IR。

## 步 1:拉树

- **MCP `get_node_info <frameId>`**:全量节点树(含隐藏节点;超长自动落盘到 tool-results/)。注意:
  - `fills.color` 是 `"#rrggbb"` 字符串,不是 {r,g,b}
  - **INSTANCE 子节点的 bbox 是源组件坐标**(与摆放位置整体偏移可达 ~168px);TEXT 节点坐标可信
- **可选 `fetch-visible.mjs <fileKey>`**(REST,token 在 `.secrets/env` 或 `~/.secrets/figma`):输出顶层隐藏清单。file key 从 Figma URL 取:`figma.com/design/<fileKey>/<名称>?node-id=...`

## 步 2:扫描

`node scan-tree.mjs <node-info.json> [--text]` → 紧凑树 + 信号统计(instance/矢量/柱序列/大数字/日期文本/命名线索)。

- 信号给方向,**agent 按 feature-map.md 判据终审**(如柱序列信号被星期头文本证伪 = 月历)。
- 输出功能清单并**先向用户汇总**("检测到 N 个:…"),再走〇节库推荐。

## 步 3:隐藏检测(三重信号 + 仲裁)

**背景**:节点级 `visible` 全 MCP 不序列化 → 隐藏元素会被无脑还原。Figma 的"语义可见性"(visible 字段)与"渲染可见性"(导出)是两套数据,**渲染导出图是唯一裁判**。

管线:
1. `detect-hidden.mjs <node-info.json> <scan落盘.txt> <design.png>`:`scan_nodes_by_types` 会跳过隐藏的**顶层**节点 → 与全量树差集 = 候选;墨迹验证只对顶层可靠(instance 子节点树坐标偏移会失真)
2. `fetch-visible.mjs` 清单交叉比对(REST 顶层节点级较可靠;instance 子节点级有误报,见 lessons.md §6)
3. **干净区域墨迹实测**:区域墨迹扫描必须避开邻卡/相邻区块(踩实案例:金额列扫描区被 Attendance 日历格与 Performance 标题污染,误判"部分行可见")
4. 疑难(全遮挡/画布外/信号冲突)→ 请用户在 Figma 选中,`get_selection`(唯一返回 visible 的接口)

规则:
- 父级隐藏 → **子树整棵不渲染**,与子节点自身状态无关
- 隐藏是**逐 instance override** 的(同列 13 行可仅 2 行可见)→ data 用 `showXxx` 字段逐行控制,不能整列一刀切
- 同一坐标可能叠「隐藏变体 + 可见行」→ data 取可见行内容
- 剔除隐藏子树时,**数据字段与图标资产同步清理**(不用的 png 不进 public/)
- 最终验收靠**单向墨迹 diff**(verification.md 门 2)兜底

## 步 4:布局

`node layout-infer.mjs <node-info.json>` → 布局意图树(row/column/grid-repeat/xy-split/abs-overlay + gap 中位数)。

- **列位仲裁优先级**:像素实测 > `scan_nodes_by_types` 的摆放系坐标 > get_node_info 的 TEXT 坐标 > ❌ instance 子树坐标
- GROUP 包围盒 ≠ 卡片边界(矢量溢出撑大 bbox),边界用横向白底扫描探针验证
- 推导算法与代码映射 → protocols/layout.md

## 步 5:素材

- **导出通道**:① 插件 `export_node_as_image`(主通道);② 插件超时时降级 REST:`GET /v1/images/:fileKey?ids=<nodeId>&format=png&scale=1`(返回 JSON 内含图片 URL,下载即可)——两通道互为备份
- **核对资产齐全再生成**:Vue3+Vite 下 SFC 静态 `src="/assets/..."` 文件缺失直接 500(严格模块解析),逐个核对图标已落盘
- 无分号 ID 节点直接导(scale=2 图标够用;SVG 参数无效始终 PNG);分号 ID(`I5:x;y`)导出报错 → 走整帧裁剪
- 整帧 1x PNG + `crop-assets.mjs` 裁剪(@2x 大图会被重编码为 JPEG 且 ~2000px 上限);小图标/头像从 @1x 按 1:1 裁最干净;脚本按魔数判格式(有 .png 扩名的 JPEG),采样系数从实际尺寸推导
- ⚠️ 导出 URL **逐字使用**,手改 Expires/Signature 即失效
- 纯渐变节点读 JSON `gradientStops` 写 CSS,不导图
- 复用组件逐行 override(各行照片/偏移不同)→ 逐行裁剪 + data 字段覆盖
- 复杂装饰(渐变+光斑+文字)整体烘焙最保真(实测 9.3% vs CSS 重绘 39%),交互部分叠透明热区
- 带圆角 Frame 导出四角是**不透明白** → body 白底 + 舞台 border-radius 复刻
- 字体:捆绑包(Outfit/Urbanist/ionicons)> `get-fonts.mjs`;商业字体(TT Hoves 等)用近似体并在 config 记录

> 注:scan-tree / layout-infer / detect-hidden / fetch-visible 均已内置宽容加载器(裸 JSON 与 `[{type,text}]` 包装均可直读),落盘文件无需预处理。

## 步 6:生成

- 按〇节 config + 布局树 + patterns/ 模式实现;颜色/字体引用 tokens
- 先冒烟(Vue2:Button+{{1+1}} 跑 0 报错)再铺组件
- 环境:node 不在 PATH → fnm 目录(`~/AppData/Roaming/fnm/node-versions/vx/installation`);Git Bash `/tmp` 与 node 不互通,用项目内路径;静态服务用零依赖 `serve.mjs`(no-store 头)

## 步 7:验收 → protocols/verification.md(四门)
