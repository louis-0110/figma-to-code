# data-table.md — 数据表格模式

## IR 签名
- `grid-repeat`(y 向)行容器 ×N,每行内 `row`/grid 列结构一致
- 行内含可变数据(头像图片/多行文本/数值/操作按钮);列起点对齐
- 通常伴随:顶部搜索/筛选工具栏、表头行(列标签 + 排序图标)、行分隔线

## 语义结构
```html
<section aria-label="XX列表">
  <div class="hd"><h2>标题</h2><a/button>次操作</a></div>
  <div class="toolbar">…搜索 input + 筛选…</div>
  <div class="table-scroll" data-qa="table-scroll">
    <table>
      <colgroup><col>…按实测列宽…</colgroup>
      <thead>
        <tr>
          <th scope="col" data-qa="table-head">…含排序 button + aria-sort…</th>
        </tr>
      </thead>
      <tbody data-qa="table-body"><tr v-for>…td…</tr></tbody>
    </table>
  </div>
</section>
```

浏览器探针契约:`table-scroll` 在滚动 wrapper 上;`table-head` 在首个实际 sticky 的 `<th>` 上,不要挂 `<thead>`。sticky `<th>` 吸顶时,外层 `<thead>` 仍可能随滚动移动;挂在错误宿主会造成验收误判。

## 页签驱动列集
- Figma 同一面板的多个页签状态要逐状态读:页签可能换字段、列宽、列数和单元格类型,不是只换数据。用各状态的表头文本 + 首行单元格判断映射。
- 组件里维护 `columnSets`,由 `activeTab` 计算 `columns`;行数据也按同一 `activeTab` 读取。不要用 `v-show` 放多套表格,也不要把所有状态字段塞进一套列。
- 特殊单元格进列配置,例如 `{ key:'photo', type:'photo', altKey:'name', altSuffix:'通行照片' }`;没有该列的状态自然不渲染。
- 压测/测试数据工厂要覆盖每个页签需要的字段:同一批记录可同时携带默认态字段(`time/point/photo`)与历史态字段(`lastTime/project`),按当前列集取用。

## 布局
- **优先用弹性容器撑满面板**,不要猜固定表格高度:面板体 `display:flex; flex-direction:column`;标题/工具栏 `flex:0 0 auto`;滚动包裹层 `flex:1 1 auto; min-height:0; overflow-y:auto`;`table { height:100% }` 让数据不足时也撑满容器
- `table-layout:fixed` + colgroup 实测列宽;`width:100%`
- 列位以像素实测为准(INSTANCE 子树坐标不可信);工具栏与表格的 padding 可能不对称(工具栏 24、表格通铺 → 负边距)
- 分隔线:`tbody tr { border-bottom }`(collapse 不占高,行距 = 行高);divider 独占行会累积漂移

## 交互基线
- 排序:表头 button,asc→desc→none 三态循环;`aria-sort` 同步;**行序必须真实变化**(断言双验:aria + 首行内容)
- ⚠️ 排序比较器必须传 `row[key]` 字段给解析函数——传整行对象会 NaN→0→恒等,aria 变了但行序不动
- 全选/行选 checkbox:半选 `:indeterminate.prop`;选中行底色
- 搜索 input:v-model 过滤行;空态提示行

## 滚动
- 默认滚动区 = 表格 wrapper 的**弹性剩余高度**:`flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden`;`thead th { position:sticky; top:0; background:表头色; z-index:1 }`
- 静态稿只能估出"初始行数";固定 `max-height` 仅限真正独立于面板高度的例外。多数面板表格应随容器变高/变矮,而不是写死 275px/552px
- ⚠️ Vue3+Vite:静态 `src="/assets/..."` 图标缺失 → 500(生成前核对资产)

## 行身份
- 行字段(avatar 等)进数据随行走,排序/筛选后不串位;勿按显示序号推算
