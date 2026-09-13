# patterns/ — 模式模板库（参数化实现配方）

**定位**：每个模式 = 「IR 签名（如何识别）→ 结构重点（怎么写）→ 陷阱」。模板吃 analysis.json（IR）+ design-tokens.json，输出实现；识别置信度低或高度定制的区域仍走手写逐元素还原。

**使用**：生成前按 IR 树自顶向下匹配模式；一个节点可由多个模式组合（卡片 = 滚动卡 + 数据表）。

| 模式 | IR 签名要点 | 结构重点与陷阱 |
|---|---|---|
| `sidebar-nav.md` | aside 定宽 + column 菜单 + 等距 item + 激活胶囊 | 主区用 `flex:1; min-width:0`，菜单项高度和图标间距 token 化 |
| `top-header.md` | header 横条 + 标题块 / 搜索 / 图标组 / 用户 | 固定带 `flex:0 0 auto`，右侧操作组允许收缩但不得挤压标题语义 |
| `data-table.md` | grid-repeat×N 行 + 表头列 + 可变行数 | wrapper 撑满父容器；只让 tbody 所在 wrapper 纵向滚动；thead sticky |
| `scroll-card.md` | 定高卡 + column 列表内容恰满 / 被裁 | 卡片是 flex column；head 固定、body `min-height:0`，滚动留在内容区 |
| `vue2-dashboard-architecture.md` | 元模式：Vue2 无构建驾驶舱整页分层、公共组件接口与数据 / 压测契约 | ScaleStage / PanelShell / BaseDataTable / BaseChart 的职责边界和组件拆分参考 |

通用规则（SKILL 第二节）优先于模式；模式只补充该类组件的特有结构、交互和陷阱。
