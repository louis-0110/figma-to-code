# pitfalls.md — 实测坑速查(按阶段分组)

> 全部为实测结论;编年史与修正过程见 lessons.md。生成前先过「必查」,验收兜底在 verification.md。

## 生成前必查(Vue2 无构建 + Figma 树)

1. **vue2-sfc-loader 双构建**:Vue2 必须用 `dist/vue2-sfc-loader.js`,全局 `window['vue2-sfc-loader']`(不是 `window.vue2SfcLoader`)
2. **无构建 .js 模块**:getFile 返回 `{ type:'.mjs', getContentData }`,否则 sourceType 报错
3. **SFC 静态资源**:绝对路径 `/assets/a.png`(无资产管道,相对路径必 404);Vue3+Vite 下文件缺失直接 500,生成前逐个核对
4. **INSTANCE 子节点 bbox 是源组件坐标**(偏移可达 ~168px),TEXT 节点坐标可信;列位以像素实测或 scan_nodes_by_types 摆放系为准
5. **节点级 visible 全 MCP 不序列化**:隐藏元素会被无脑还原;检测管线见 pipeline.md;隐藏逐 instance override,逐行控制
6. **Vue2 根实例 template 替换挂载元素**:缩放初始化放 App.vue mounted 用 `this.$el`(Vue3 用 `document.querySelector('.stage')`)
7. **装饰 absolute 的宿主必须有 `position:relative`**:`.panel::before` 若宿主没有定位上下文,会以外层 `#stage` 为基准,视觉上表现为"卡片背景消失"

## 导出与素材

8. 导出:`format:"SVG"` 无效(始终 PNG);分号 ID(`I5:x;y`)导出报错;@2x 大图被重编码 JPEG(≤~2000px),采样系数从实际尺寸推导;签名 URL 逐字使用;圆角 Frame 四角不透明白
9. 半透明导出图垫接近色 CSS 渐变再叠,防与背景混色
10. **低 alpha fill 导出图是深色原色 ≠ 渲染浅色**:必须读 fills JSON 的 gradientStops 8 位 hex alpha 重建 CSS,不要导图;渐变圆角边框用 padding-box/border-box 双层背景
11. 插件导出超时降级:REST `GET /v1/images/:fileKey?ids=<id>&format=png&scale=1` 直接返回图片 URL,与插件通道互为备份;MCP 落盘格式不固定,工具已内置宽容加载器
12. **WS 桥接导出**(REST 限流兜底):直连 `ws://127.0.0.1:3055` 发命令收 base64;协议见 lessons.md §坑 20
13. Figma 椭圆 arcData 扇形/弧形节点导出边界=弧自身紧致 bbox 而非整圆框,逐层叠放会错位;多弧叠层宁用 ECharts 重绘

## 布局与样式

14. inline-block 网格被 strut 撑行距 → flex wrap;grid 行内文字列 `align-self:flex-start`(center 会下移 2px)
15. 日历类必查星期对位(如 2022-03-01 周二 → 前置 1 空格);格子区不对称 padding 实测
16. 同坐标常叠「隐藏变体 + 可见行」;行内容跨卡溢出是常态 → overflow:visible + 兄弟卡 DOM 靠后自然覆盖
17. 手摆稿卡片文字内偏移逐个不同,逐元素实测坐标进 data;手摆间距不均匀必须逐块实测
18. 缩放模式选型:宽度优先大屏=width-adapt(横向铺满+竖滚),完整显示=fit,网页式原尺寸+滚动=actual

## 组件库(iView)

19. iView Table 列文本水平 padding 挂在 `.ivu-table-cell`(不是 td/th),覆写 td 无效;行高才是 td 上
20. iView Table 列宽之和 < 表宽且末列不设 width

## 图表

21. 设计稿图表可按颜色从导出图描点取真实数据/角度;扇区角与图例数值不符 = 装饰性摆拍,按描点角度绘制、图例保留真值(数据层注明)

## 环境与工具

22. 本地服务禁缓存(serve.mjs 已带 no-store);污染缓存用 CDP 清
23. node 不在 PATH 用 fnm 目录;Git Bash `/tmp` 与 node 不互通,用项目内路径;截图前等 1.5s(settle)
24. ESM 工具脚本从**脚本自身位置**解析依赖,cwd/junction 无效——拷进项目跑
25. Skill 布局工具曾有双 bug(已修):layout-infer xy-split 序列化丢嵌套 groups;build-ir walk 不递归。历史项目 IR texts=0 即此症,重跑 build-ir 即得全量 IR

## 交互与验收

26. **卡片页签是状态机,不只是文案切换**:逐状态读列头和首行;压测数据覆盖每个状态字段;Playwright 真实点击断言列集
27. 一次性 `.figma-selected.json`、qa 截图和临时脚本不是交付物,验收后清理
