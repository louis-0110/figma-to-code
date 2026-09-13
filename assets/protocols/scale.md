# scale.md — screen-scale.js 缩放库 v1.4(sizer 模式,自研)

> SKILL.md 只保留一行"缩放详见 scale.md";接口、模式、陷阱在这里。

## API

```js
ScreenScale.create({
  target,       // 滚动容器(外部 flex 容器)
  sizer,        // 尺寸占位元素(库设置宽高)
  width,        // 设计稿宽(px)
  height,       // 设计稿高(px)
  mode,         // 缩放模式
  zoom,         // 手动缩放倍率(custom 模式用)
  minScale,     // 最小缩放比
  maxScale,     // 最大缩放比
  delay,        // resize 防抖(ms)
  transition,   // CSS transition(s)
  onScale,      // 缩放回调
})
```

## DOM 结构

```
滚动容器(flex, 100%宽高)
└── sizer(库设 width × height)
    └── 舞台(scale, transform: scale(s), origin: left top)
```

- 滚动容器负责 `overflow-x / overflow-y`
- sizer 的宽高决定是否出现滚动条
- 舞台是实际渲染内容,sizer 是占位尺寸

## 缩放模式

| 模式 | 行为 | 适用场景 |
|---|---|---|
| **width-adapt**(默认) | 宽度永远铺满容器,高度等比,超高由滚动容器显示竖向滚动条 | 宽度优先大屏 |
| fit | 等比缩放到完整显示(不裁切) | 需要完整预览 |
| actual | 原尺寸不缩放,双向滚动 | 网页式浏览 |
| fill-height | 高度铺满,宽度等比,超宽显示横向滚动 | 高度优先 |
| stretch | 非等比拉伸铺满(一般不用) | 特殊需求 |
| custom | 使用传入 zoom 值 | 手动缩放工具栏 |

## v1.4 关键经验

- **width-adapt 永远按 `target.clientWidth / 设计宽` 计算**,不要让高度接近时切回 fit 造成双吸引子
- 目标滚动容器负责 `overflow-x:hidden; overflow-y:auto`
- 缩放库必须 `ResizeObserver(target)`,因为滚动条出现会反向改变 target 宽度
- **不要用 `window.innerWidth` 替代实际容器宽度**
- 派发 `window` 事件 `screen-scale`(携带 scale 值),工具栏可以监听
- 工具栏放舞台外(transform 内 `position:fixed` 失效)
- 容器用 `width:100%; height:100%`,不用 `100vw/100vh`(会含滚动条宽度)

## 跨框架复用

IIFE 挂 `window.ScreenScale`。

- Vue2:App.vue `mounted()` 用 `this.$el` 作为 target
- Vue3:`import` 后用 `window.ScreenScale.create`,target 用 `document.querySelector('.stage')`

## Bundled 实现

Vue2 脚手架会从 `assets/lib/screen-scale.js` 复制到项目 `lib/screen-scale.js`；不要手改项目里的副本，修复应回到 bundled 源后再同步。
