# charts.md — 图表配置速查

> SKILL.md 只保留一行"图表详见 charts.md";每种图表的具体参数和踩坑在这里。

## 环形进度

```js
series: [{
  type: 'pie',
  radius: ['63%', '83%'],
  startAngle: 90,
  label: { show: false },
  data: [{ value, itemStyle: { color } }, ...]
}]
```

中心数字用绝对定位 `div` 叠加(不要用 ECharts label)。

## 椭圆环

ECharts radius 基于 `min(w, h) / 2`,椭圆环需要:

1. 容器取长边正方形
2. 外层 `transform: scaleY(短/长)`、`origin: 50% 0`
3. 参数用径向 + 角向双向扫描反推

```css
.ellipse-wrap { transform: scaleY(0.6); transform-origin: 50% 0; }
```

## 3D 饼(Highcharts)

```js
chart: { type: 'pie', options3d: { enabled: true, alpha: 55, beta: 0 } }
```

- alpha 55~62 只作厚度视角
- 压扁用外层 `scaleY`,不要用 alpha
- `accessibility` 和 `credits` 关闭
- 必须引入 `highcharts-3d.js`

## 柱/折线

常规配置。自定义 HTML 图例:

```js
legend: { show: false, data: ['系列A', '系列B'] }
```

点击 HTML 图例触发:

```js
chart.dispatchAction({ type: 'legendToggleSelect', name: '系列A' })
```

## 图表生命周期

- Vue2: `mounted()` init, `beforeDestroy()` dispose
- Vue3: `onMounted()` init, `onBeforeUnmount()` dispose
- canvas 容器:初始化用 `devicePixelRatio` 设置实际像素,避免高分屏模糊
- resize:用 `ResizeObserver` 而不是 `window.resize`,因为 flex 布局下容器宽度变化与窗口不同步
