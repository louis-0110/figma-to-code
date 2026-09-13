# AGENTS-snippet.md — 复制进 Codex/Cursor 等项目的 AGENTS.md(或等价指令文件)

以下协议与 Claude Code 侧 Skill `figma-to-code` 共享同一份
`codegen.config.json` 契约和 `feature-map.md` 矩阵,两边的项目可互相接续。

---

## 设计稿还原开工协议(工具无关)

1. **栈问卷**:项目根无 `codegen.config.json` 时,先向用户提出五问(纯文本即可):
   ①代码类型(无构建 Vue2 / Vue3+Vite / React / 纯 HTML)
   ②UI 组件库(iView / Element / Ant Design / 不用)
   ③图表深度(无图表 / 2D / 2D+3D)
   ④交付深度(pixel 静态还原 / +基础交互 / +mock 数据层)
   ⑤缩放模式(width-adapt 宽度铺满+高度超出竖向滚动 / actual 原尺寸+双向滚动 / fit 完整显示)
   答案写入项目根 `codegen.config.json`(schema 见 skill 的 assets/codegen.config.example.json)。
   已存在 config → 直接读,不重复问;用户要求重选 → 删文件重问。

2. **功能扫描**:读设计稿(Figma MCP 节点树 + 整帧导出图)后,按
   `feature-map.md` 的「判据速查」识别可组件化功能,只识别不实施,
   先向用户汇总检测结果。

3. **库推荐**:仅对检测到的功能逐个询问用哪个库(候选见 feature-map.md
   对应小节,推荐项已排第一并附理由),「保持设计稿原样(烘焙导图)」
   永远是备选。选择写入 `codegen.config.json` 的 `features` 段(带节点 ID)。

4. **生成**:严格按 config 实施;装饰烘焙 + 数据可视化用库混排是常态。

规则:未检测到的功能不问;config 已记录的功能不重问;用户说"都按推荐来"
→ 全部采用矩阵默认推荐并落盘。
