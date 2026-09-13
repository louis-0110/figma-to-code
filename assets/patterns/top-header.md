# top-header.md — 顶栏模式

## IR 签名
- 顶部横条(高 60~100),`row` 布局:标题块(column 双行)/搜索框/图标组(通知·分隔线·用户)

## 语义结构
```html
<header class="app-header">
  <div class="page-title"><h1>标题</h1><p>副标题</p></div>
  <search class="search-box">
    <img><input type="search" :placeholder><kbd>⌘K</kbd>
  </search>
  <div class="right-group">
    <button class="icon-btn" aria-label="…"><img><i class="dot"/></button> ×2
    <span class="divider"/>
    <button class="profile"><img/><span 双行/></button>
  </div>
</header>
```

## 布局与交互
- 标题 h1/p margin 归零;搜索框聚焦描边(focus-within);icon 按钮圆形 hover
- 通知点(渐变小圆)是**绝对定位白名单**成员
- 搜索 input 是真输入(v-model),占位文字禁止 span 模拟

## 陷阱
- 标题块与搜索框间距、右组间距:逐个实测(手摆不均)
- 分隔线若与相邻元素同色系,注意别在 hover 时被按钮底色吞掉
