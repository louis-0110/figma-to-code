# verification.md — 四门验收

> 全部通过才算完成。工具:`diff-tool/diff.js`(pngjs;8×6 热力图 + 连通块质心)。

## 前置:截图纪律

- **标准视口**:视口 = 设计稿尺寸(如 1440×1024),缩放态截图按错误尺寸索引会全废(曾出 31% 假警报);diff 前先校验 shot 尺寸
- **settle 等待**:navigate 后等 1~1.5s 再截——transform 合成层文本在渲染未稳时会"整块浅灰中间态"(computed 全透明、像素 150-210 灰),爆假差异块
- HMR 期间 DOM 可能新旧混合:量 DOM 前先硬刷新(navigate),别信 HMR 中的截图

## 结构审计(进入像素门前)

缩放全绿、stage rect 正确、DOM transform 生效,都只证明外层尺寸映射成功,不证明卡片和分区符合流式协议。截图回归前先审计:

- **容器关系**:按生成源确定关键容器(如舞台 > 内容区 > 固定带/语义网格),断言父子关系、子项数量和顺序
- **grid 语义**:同一 grid 的子项必须同语义、同构、同尺寸;KPI 组和业务面板组不能混入同一轨道集合
- **流式断言**:根内容、固定带、自适应区、语义网格的 `display/flex/grid-template` 符合协议;容器有滚动/收缩保护时检查 `min-height/min-width`
- **旧坐标残留**:审计骨架 selector 的基础 CSS;若仍有 `position:absolute + left/top + 设计坐标`,先移除迁移残留再进像素门(背景层和装饰白名单除外)
- 用 Playwright 的 DOM/computed-style 断言记录结果;结构不通过时,像素差异只能定位表象,不能替代结构判断

## 门 1:像素回归

```
node diff.js <design.png> <shot.png>
```

- 指标:平均灰阶差 + 显著差异(>40 灰阶)占比 + 8×6 热力图 + 连通块 top8
- 经验阈值:浅色后台 ≤3%;>门限或出现 >500px 差异块 → 查结构
- 外框圆角的四角抗锯齿带是固有差异(每角 ~315px),可排除后复算
- 读图手法:
  - **逐行墨迹分布**(区域每行最暗像素序列):整段平移 = 错位;边缘多几行中间灰度 = 字形抗锯齿
  - **字重/字体对表**:成片字形差异时,脚本批量抽 TEXT 节点 fontWeight/fontFamily 对照(手摆稿字重随手改:姓名 500 / See All 900 / 标题可能换字体)
  - 商业字体(TT Hoves 等)用 Outfit 近似后,尾部宽度差是 irreducible——记录进 config,不再追
  - 图表参数(环半径/段角度)用**径向+角向双向扫描**反推,单方向会误判
  - 探针区域必须避开邻卡(踩实:金额列扫描被日历格/标题污染 → 误判 → 错误修复又回滚)

## 门 2:单向墨迹(多渲染检测)

设计导出图空白 && 实现截图有内容的连通块 = 实现多渲染(隐藏元素漏网/多余元素):

- 阈值:design 灰阶 >235 && shot <200;连通块 **>60px** 才看(字形差通常 <170px,隐藏元素是整块)
- 逐块归零;残留块采样 RGB 定性(白/白 = 抗锯齿残影;色彩差异 = 邻卡污染或真多渲染)

## 门 3:弹性 + 滚动区域

结构审计通过后才跑本门;本门不重新证明布局语义,只验证流式结构在压力下不崩。

- 注入超长文本(name/sub 等)+ 克隆增行(如 6→12 行、13→18 行)
- 截图验证:不重叠、不溢出、不崩(ellipsis/越列策略生效)
- **滚动断言**:定高容器内内容超出 → `.scroll-region` 的 `scrollHeight > clientHeight` 且区域内滚动(不撑破卡片/舞台);表头 `position:sticky` 生效;无横向溢出
- **Playwright 尺寸探针**:标准视口外再跑短视口(如 1920×800)。`width-adapt` 断言舞台 `width ≈ 滚动容器 clientWidth`,短视口只允许目标容器出现竖向滚动;若滚动条影响宽度,等待 ResizeObserver 后再量一次
- **表头探针**:先把表格 wrapper `scrollTop = scrollHeight`,再断言 `theadRect.top - scrollerRect.top` 在 ±2px 内;同时断言表格底边接近面板内容底边,证明它撑满容器而非固定高度
- **表格压测钩子**:支持 `?tableStress=1` 后把少量测试行克隆成压力行数(如 6→24),断言行数、`scrollHeight > clientHeight`、只出现纵向滚动、`overflow-x` 不可见滚动、表格/wrapper 撑满面板内容区、表头吸顶,且超长文本和特殊字段不破坏行高;页签型页面要覆盖每个页签的压测字段
- **console 冒烟**:页面加载、缩放、注入数据后收集 console errors;任何未捕获异常都算弹性门失败

## 门 4:交互冒烟(逐项断言)

- 搜索输入 → 行数过滤(`input` 事件后断言行数)
- 排序表头 → 点击后 `aria-sort` 变化 **且首行内容真实变化**(⚠️ 只验 aria 不够:曾踩"比较器把整行对象当字符串解析 → 恒返回 0 → aria 变了但行序不动"的坑——数值列解析函数必须传 `row[key]` 字段而非行对象)
- 全选 checkbox → 行选全勾;再点取消;行选部分勾 → 全选框 indeterminate
- dropdown → 开合 + 选项选择更新标签 + 点击外部关闭
- 页签切换 → 用 Playwright 点击真实页签按钮,不手动改组件状态;逐状态断言表头顺序、首行关键字段、特殊列出现/消失、当前页签高亮和数据表行数;涉及溢出时可复跑 `?tableStress=1`,防止某个页签的稀疏字段在压力下撑坏表格
- hover/active/focus-visible 反馈存在(菜单项/按钮/输入框)

## 达标后

- 更新 `codegen.config.json` 的 `quality` 段(diff 指标 + 修复履历)
- 剩余 irreducible diff 的构成写明(TT Hoves 近似 / 圆角抗锯齿带 / 字形渲染器差异)
- 清理一次性验收产物:`.figma-selected.json`、`qa/` 里的截图/指标、一次性 Playwright 脚本都不是交付物;保留项目必需的组件、入口、资产、静态服务和最小回归入口

## 自动 UI 探针

结构审计完成后，先用 bundled `verify-ui.mjs` 做浏览器断言，再进像素与弹性门；项目没有表格时加 `--skip-table`。它依赖目标项目或 `PLAYWRIGHT_MODULE` 可解析 Playwright。

```bash
node verify-ui.mjs --url http://127.0.0.1:8080 --viewport 1920x1080
node verify-ui.mjs --url http://127.0.0.1:8080 --viewport 1920x800
```

bundled Playwright 与本机浏览器 registry 不匹配时，不要联网下载；改用系统 Chrome/Edge：

```bash
node verify-ui.mjs --url http://127.0.0.1:8080 --viewport 1920x1080 \
  --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

等价环境变量是 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`；两个来源同时存在时 CLI 参数优先。

探针固定断言：

- 页面加载成功且 console errors 为 0
- `width-adapt` 下 stage 宽度等于 scroll container `clientWidth`（误差 <=2px）
- scroll container 无横向溢出；短视口超高时允许且要求纵向滚动
- 有表格时 `.table-wrapper` 只纵向滚动，`scrollWidth <= clientWidth + 1`
- 表头吸顶：把 wrapper 滚到底后，thead 相对 wrapper 的 offset 变化与绝对位置误差均 <=2px
