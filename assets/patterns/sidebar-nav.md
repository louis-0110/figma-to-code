# sidebar-nav.md — 侧栏导航模式

## IR 签名
- 定宽(aspect:宽 200~300,高 = 帧高)的 `abs-overlay`/column 容器,含背景层 + logo + column 菜单
- 菜单项 = `row gap≈8~16`(图标 24 + 标签),等距(column gap 实测),其中一项带高亮胶囊(激活态)

## 语义结构
```html
<aside class="side-nav">
  <a class="logo" href="./"><img :src="logo"></a>
  <nav aria-label="主导航">
    <ul class="menu">
      <li v-for="it in items">
        <a class="item" :class="{active}" :href="hrefOf(it)" :aria-current="active?'page':undefined">
          <img class="ico" :src="it.icon" aria-hidden="true"><span>{{it.key}}</span>
        </a>
      </li>
    </ul>
  </nav>
</aside>
```

## 布局
- padding/column gap 用 IR 实测值;胶囊 = 激活项背景(常为强调色)+ 字重加重
- 菜单若含前置空位/分组,以 IR 顺序为准

## 交互基线
- hover 浅灰、active 微深、focus-visible 描边;激活态禁止 hover 变色过强
- 多页项目:激活项由路由/页面参数决定 → 激活项做成**可覆盖 prop**(缺省全局配置)
- 未实现页面用占位 href,点击不报错

## 陷阱
- 激活胶囊位置由设计稿坐标定(手摆稿可能与"语义激活项"不一致——以**字重 + 胶囊位置**为准,勿想当然放第一项)
- 图标颜色:激活=黑/深,未激活=强调色(从设计稿像素确认,别按通用惯例猜)
