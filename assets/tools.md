# tools.md — Skill 捆绑资源完整清单

> SKILL.md 只保留分组简表;每个工具的参数和用法细节在这里。

## 字体

| 资源 | 用法 |
|---|---|
| `fonts/` + `fonts-var.css`(536KB) | 拷进项目 `lib/`,`<link>` 引 CSS。outfit-var / urbanist-var(可变字体切片,单文件全权重 100–900)+ iView 必需 ionicons×3;许可见 `fonts/LICENSE-FONTS.txt` |
| `get-fonts.mjs` | 新字体本地化:`node get-fonts.mjs "Inter:400,700" --out <目录>`(⚠️ css2 多权重分隔符是**分号**;自动识别可变字体合并单文件) |

## 管线工具

| 资源 | 输入 → 输出 | 说明 |
|---|---|---|
| `scan-tree.mjs` | get_node_info JSON → 紧凑树 + 功能信号统计 | 步 2 |
| `detect-hidden.mjs` | 节点树 → 隐藏节点候选(scan 差集 + 墨迹验证) | 步 3;局限见文件头注释 |
| `fetch-visible.mjs` | Figma REST → visible 清单(token 放项目 `.secrets/env`;仅作线索) | 步 3 可选;仲裁见 pipeline.md |
| `layout-infer.mjs` | 节点树 → 布局意图树(row/column/grid-repeat/xy-split/abs-overlay) | 步 4 |
| `extract-tokens.mjs` | 节点树 → design-tokens.json + tokens.css | 步 4.5 |
| `build-ir.mjs` | 融合布局/文本/素材/隐藏/滚动 → analysis.json | 步 4.5;生成阶段唯一输入 |
| `normalize-ir.mjs` | IR → normalized.json(语义组件树 + 页面栅格 + 切图建议) | 步 4.6 |

## 素材工具

| 资源 | 说明 |
|---|---|
| `crop-assets.mjs` | 整帧导出图裁素材(分号 ID 导不出时的兜底;魔数判格式) |
| `extract-card-assets.mjs` | 从导出图按色块/圆角裁卡片背景等素材 |
| `diff.js` | 截图 vs 导出图 diff,支持 `--heat` 输出热力图 |

## 验收工具

| 资源 | 说明 |
|---|---|
| `scorecard.mjs` | 回归评分:门1 像素 + 门2 墨迹自动量化,对比 regression.json 基线 |
| `doctor.mjs` | 环境自检:`node doctor.mjs <项目根>`(node 版本 / REST token / MCP 注册 / 3055 桥接 / 工具池) |

## 配置与跨工具

| 资源 | 说明 |
|---|---|
| `feature-map.md` | 20 类设计稿功能判据 + 候选库矩阵(开工协议用) |
| `codegen.config.example.json` | 开工问卷落盘 schema(跨工具契约) |
| `AGENTS-snippet.md` | 复制进 Codex/Cursor 的 AGENTS.md,同一 config 两边接续 |
| `figma-mcp.example.json` | TalkToFigma MCP 注册模板(clone 变体 / npx 变体) |

## MCP 运行时

| 资源 | 说明 |
|---|---|
| `mcp/socket-node.cjs` | 3055 桥接(4.5K) |
| `mcp/dist/server.js` | MCP server 打包产物(80K) |
| `mcp/start-mcp.cmd` | 幂等拉起桥接的启动器 |
| `mcp/figma-plugin/` | Figma 插件(manifest.json / code.js / ui.html) |

共 ~86KB,零 node_modules(上游 tsup 全量打包)。详见 `protocols/environment.md`。
## 契约、脚手架与 UI 探针

| 资源 | 用法 | 说明 |
|---|---|---|
| `lib/screen-scale.js` | `<script src="lib/screen-scale.js">` 后调 `window.ScreenScale.create(...)` | 捆绑的自研缩放库 v1.4；模式、DOM 契约和陷阱见 `protocols/scale.md` |
| `validate-config.mjs` | `node validate-config.mjs <config.json-or-project-root>` | 零依赖校验 `contractVersion=1`、框架/缩放枚举和 features 契约；也可 `import { validateConfig }` |
| `scaffold-vue2.mjs` | `node scaffold-vue2.mjs <target-root>`；先 `--dry-run` 预览 | 仅支持 `vue2-nobuild`；不覆盖已有文件；生成 Vue2 SFC 结构并复制 bundled 缩放库；缺失本地 Vue/iView/echarts 时输出 WARN |
| `verify-ui.mjs` | `node verify-ui.mjs --url <URL> --viewport 1920x800` | Playwright/Chromium 探针；断言 stage 宽度、横向溢出、竖向滚动、表格只纵向滚动、thead 吸顶和 console errors。依赖项目或 `PLAYWRIGHT_MODULE` 可解析 Playwright |
| 同上 | 加 `--browser-executable <Chrome/Edge 路径>`，或设 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | bundled 浏览器版本不匹配时用系统 Chrome/Edge，不联网下载浏览器 |
| `codegen.config.schema.json` | 开工问卷契约的 JSON Schema；`contractVersion` 当前为 1 |
