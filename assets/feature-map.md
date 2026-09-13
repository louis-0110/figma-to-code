# feature-map.md — 设计稿功能识别与工具库推荐矩阵

**用法**:agent 读 Figma 节点树 + 整帧导出图后,按「判据速查」识别功能意图;**仅对检测到的功能**发起库推荐(未检测不问,零打扰);每题推荐项放第一位并附一句理由;「保持设计稿原样(烘焙导图)」永远是备选——装饰性图形烘焙常比库实现更保真。

**标注**:✅ 无构建单文件可引入(script 标签直接用)/ ⚠️ 需构建链、体积大或有在线依赖。
**换栈规则**:本矩阵默认无构建语境;若用户选了 Vue3/React 工程化,同功能候选按对应生态平移(如 iview-tree→el-tree/antd-tree),判据与协议不变。

---

## 判据速查(设计稿特征 → 功能意图)

| 设计稿特征 | 功能意图 |
|---|---|
| 坐标轴线 + 刻度文本、扇形/环形闭合矢量、等宽柱序列、折线 path | charts 图表 |
| 扇形带透视感(层叠椭圆/命名含 3D/alpha 视角)、有厚度的饼 | charts3d 三维图表 |
| 地理轮廓 path 群、省市名称标签、飞线/涟漪 | map 地图 |
| 大画布 + 光源渐变 + 材质球体、命名含 render/3D/scene | scene3d 三维场景 |
| 等距行网格 + 表头分隔线 + 分页控件痕迹 | table 表格 |
| 递归缩进文本 + 折线/chevron 连接、父子 checkbox | tree 树 |
| 横向时间条 + 日期刻度行 + 左侧任务名/进度列 | gantt 甘特图 |
| 多列卡片墙 + 拖拽把手 icon + 列头计数 | kanban 看板/拖拽 |
| 网格磁吸占位虚线框 + 可停靠面板 | drag-layout 拖拽布局 |
| 节点框 + 箭头连线、关系网络(点+边) | graph 流程图/图谱 |
| 同尺寸帧横向并排 + 指示圆点/箭头 | carousel 轮播 |
| 单列信息条持续上滚/底部新增 | scroll-list 滚动列表 |
| 命名含 spin/pulse/float、AE 痕迹、循环帧序列 | motion 动效 |
| 大数字 + 单位 + 对比小箭头,多处出现 | counter 数字翻牌 |
| 工具栏(B/I/U/颜色)+ 可编辑文本区 | editor 富文本 |
| 月历网格(7 列)+ 日程点/条、周视图切换 | calendar 日历 |
| icons 页或组件库中大量 ≤48px 同源 instance,多处复用 | icons 图标体系 |
| 时间轴竖线 + 节点圆点 + 交替卡片 | timeline 时间线 |
| 播放器控件(进度条/音量/全屏)或视频封面帧 | video 视频播放 |

---

## 功能矩阵(候选库按无构建语境推荐排序)

### 1. charts — 2D 图表
| 候选 | 引入 | 说明 |
|---|---|---|
| **ECharts 5**(推荐) | ✅ echarts.min.js 单文件 | 图表类型最全,配置即样式,与设计稿映射直观 |
| Highcharts 11 | ✅ 单文件 | 商用需授权;某些交互更细腻 |
| Chart.js 4 | ✅ 单文件 | 轻量,动画好看,复杂图弱 |
| 烘焙导图 | — | 纯装饰、无交互、数据不变的图 |

### 2. charts3d — 三维图表
| 候选 | 引入 | 说明 |
|---|---|---|
| **Highcharts-3d**(推荐) | ✅ highcharts.js + highcharts-3d.js | 3D 饼/柱开箱即用;压扁用外层 scaleY,别调 alpha |
| ECharts-GL | ✅ 单文件但 ~800KB | 地球/散点 3D 强,普通 3D 饼杀鸡用牛刀 |
| Three.js 自绘 | ✅ 单文件 | 自由度最高,成本最高,仅特殊需求 |

### 3. map — 地图
| 候选 | 引入 | 说明 |
|---|---|---|
| **ECharts geo/map**(推荐) | ✅ + geojson | 中国/省份轮廓、飞线、涟漪、热力一站式 |
| Leaflet | ✅ 单文件 | 街道瓦片地图;内网需自备瓦片 |
| Cesium | ⚠️ 体积大 | 真 3D 地球/GIS 场景再上 |
| 高德/百度 JS API | ⚠️ 在线 | 内网禁用,公网项目可用

### 4. scene3d — 三维场景(模型/展厅/设备)
| 候选 | 引入 | 说明 |
|---|---|---|
| **Three.js**(推荐) | ✅ 单文件 | 生态最大,示例最多 |
| model-viewer | ✅ web component 一行标签 | 只要展示 glb 模型时最省 |
| Babylon.js | ✅ 体积大 | 游戏/物理引擎需求

### 5. table — 表格
| 候选 | 引入 | 说明 |
|---|---|---|
| **iView Table**(栈内推荐) | ✅ 已在依赖 | 常规列表足够;末列不设 width 防超宽 |
| vxe-table | ✅ umd | 编辑/虚拟滚动/合并单元格等重需求 |
| ag-grid | ⚠️ 重 | 超大数据量再考虑 |

### 6. tree — 树结构
| 候选 | 引入 | 说明 |
|---|---|---|
| **iView Tree**(栈内推荐) | ✅ 已在依赖 | 常规树够用 |
| el-tree(element-ui) | ✅ umd | Vue2 生态最常用树 |
| 自绘 CSS 树 | 零依赖 | ≤3 层静态树,还原度最高 |

### 7. gantt — 甘特图
| 候选 | 引入 | 说明 |
|---|---|---|
| **ECharts custom 系列**(推荐) | ✅ 已在依赖 | 免费无授权,样式完全贴设计稿 |
| dhtmlx-gantt | ✅ 单文件 | 功能最全(拖拽改期/依赖线),GPL/商业双授权 |
| frappe-gantt | ✅ 轻量 | 样式定制弱,快糙 |

### 8. kanban/dnd — 看板与拖拽排序
| 候选 | 引入 | 说明 |
|---|---|---|
| **SortableJS + VueDraggable**(推荐) | ✅ 单文件 | 排序/跨列表移动标准解 |
| 原生 HTML5 DnD | 零依赖 | 简单场景,代码量可控时 |
| muuri | ✅ | 磁吸网格重排炫但重 |

### 9. drag-layout — 拖拽布局(大屏配置化)
| 候选 | 引入 | 说明 |
|---|---|---|
| **vue-grid-layout**(推荐) | ✅ umd | Vue2 经典栅格拖拽,大屏编辑器标配 |
| gridstack.js | ✅ | 与框架无关 |

### 10. graph — 流程图/关系图谱
| 候选 | 引入 | 说明 |
|---|---|---|
| **AntV G6**(推荐) | ✅ umd | 图谱/关系网/流程展示全覆盖 |
| jsPlumb | ✅ | 连线编辑器老牌 |
| AntV X6 | ⚠️ | 流程图**编辑器**(可拖节点连线)再上 |
| mermaid | ✅ | 文本定义渲染,适合简单流程 |

### 11. carousel / scroll-list — 轮播与滚动列表
| 候选 | 引入 | 说明 |
|---|---|---|
| **Swiper**(轮播推荐) | ✅ 单文件 | 全场景 |
| vue-seamless-scroll | ✅ | 无缝上滚列表(大屏榜单) |
| CSS animation 自研 | 零依赖 | 简单淡入/上滚 |

### 12. motion / counter — 动效与数字翻牌
| 候选 | 引入 | 说明 |
|---|---|---|
| **lottie-web** | ✅ 单文件 | 设计稿有 AE 动画时让设计师导 JSON |
| GSAP | ✅ | 复杂时间线编排 |
| animate.css | ✅ | 进场/强调类简单动效 |
| countup.js / 自研 | ✅ | 大屏数字滚动几乎是标配,~20 行自研也行 |

### 13. editor — 富文本
| 候选 | 引入 | 说明 |
|---|---|---|
| **wangeditor** | ✅ umd | 中文生态,无构建可用 |
| Quill | ✅ 单文件 | 国际主流 |
| 仅展示:烘焙/v-html | 零依赖 | 不需要编辑就别上编辑器 |

### 14. calendar — 日程/日历
| 候选 | 引入 | 说明 |
|---|---|---|
| **FullCalendar** | ✅ | 日/周/月视图+事件,事实标准 |
| 组件库 DatePicker | ✅ 栈内 | 只是选日期 |
| 自绘月历 | 零依赖 | 纯展示月历,7×6 网格 ~50 行 |

### 15. icons — 图标体系
| 候选 | 引入 | 说明 |
|---|---|---|
| **Figma 逐个导出**(像素还原推荐) | — | scale=2 PNG/SVG,与设计稿 1:1,无版权风险 |
| ionicons(iview 内置) | ✅ 栈内 | 新增图标风格一致时 |
| iconify 离线集 | ✅ | 海量图标;内网需预下载 svg 集合 |

## 长尾(检测到再问,不预置)
虚拟滚动长列表(vue-virtual-scroller)、PDF 预览(pdf.js)、图片查看器(viewer.js)、
Excel 导出(xlsx/exceljs)、页面截图(html2canvas)、WebSocket 实时推送、
视频播放(video.js)、右键菜单(自研)、水印(自研 canvas)、
打印样式(window.print + @media print)、i18n(vue-i18n)、主题切换(CSS variables)。

---

## 落盘 schema(codegen.config.json 的 features 段)

```json
{
  "features": {
    "charts":  { "detected": true, "lib": "echarts@5.5.1",        "nodes": ["5:12400"] },
    "charts3d":{ "detected": true, "lib": "highcharts-3d@11.4.8", "nodes": ["5:12871"] },
    "gantt":   { "detected": false },
    "icons":   { "detected": true, "lib": "figma-export",         "nodes": ["icons 页"] }
  }
}
```
- `nodes` 记设计稿来源节点,生成时可回溯坐标/样式
- 同项目二次运行:检测到 config 已有且 `detected:true` 的功能不再重问;
  新出现的功能类型才追加提问
