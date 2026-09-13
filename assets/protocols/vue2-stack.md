# vue2-stack.md — Vue2 无构建栈:依赖矩阵 + main.js 骨架 + 冒烟

> SKILL.md 只保留一句"Vue2 无构建栈先读本文件";版本、骨架代码、冒烟步骤在这里。

## 依赖矩阵

全部本地文件,不用 CDN 运行时。

| 包 | 版本 | 文件 | 要点 |
|---|---|---|---|
| vue | **2.7.16** | dist/vue.min.js | 完整构建含编译器 |
| vue3-sfc-loader | 0.9.5 | **dist/vue2-sfc-loader.js** | ⚠️ 注意路径含 "vue2",不是 vue3 |
| iview | 3.5.4 | iview.min.js + iview.css + fonts/(已捆绑) | Vue2 专用 |
| echarts | 5.5.1 | echarts.min.js | |
| highcharts | 11.4.8 | highcharts.js + highcharts-3d.js | 3D 饼必加 3d |

下载命令:

```bash
curl -o lib/xxx.js https://cdn.jsdelivr.net/npm/<pkg>@<ver>/<file>
```

**Vue3 栈**:vue@3.4 + vite + **view-ui-plus@1.3+**(iView 官方 Vue3 版;`view-design@4.x` peer 是 Vue2,`view-design-plus` 不存在)+ element-plus(备选)。

## main.js 骨架

```html
<script>
Vue.use(window.iview);
const { loadModule } = window['vue2-sfc-loader'];
const sfcOptions = {
  moduleCache: { vue: Vue },
  async getFile(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText + ' ' + url);
    return { type: url.endsWith('.js') ? '.mjs' : '.vue', getContentData: () => res.text() };
  },
  addStyle(t) { document.head.insertAdjacentHTML('beforeend', `<style>${t}</style>`); },
};
new Vue({ el: '#stage', template: '<App/>', components: { App: () => loadModule('src/App.vue', sfcOptions) } });
</script>
```

注意:
- `moduleCache: { vue: Vue }` 必须指向全局 Vue 2.7(不是 Vue 3)
- `getFile` 返回 `.mjs` 类型给 `.js` 模块,否则 sourceType 报错
- 静态资源用绝对路径 `/assets/a.png`(无资产管道,相对路径 404)

## 冒烟流程

1. index.html 引入 vue.min.js + vue2-sfc-loader.js + iview 三件套
2. App.vue 只含 `<Button>冒烟</Button>{{ 1 + 1 }}`
3. 浏览器打开,控制台 0 报错 + 页面显示"冒烟2"才继续
4. 确认通过后再铺业务组件

**根实例 template 替换挂载元素**:缩放初始化放 App.vue `mounted()` 用 `this.$el`(Vue3 用 `document.querySelector('.stage')`)。

## 结构脚手架

新项目先用 `node assets/scaffold-vue2.mjs <project-root> --dry-run` 预览，确认后再去掉 `--dry-run`。生成器要求根目录已有合法 `codegen.config.json`，只支持 `vue2-nobuild`，不覆盖已有文件；它会生成 `.vue` 分层结构和 bundled `lib/screen-scale.js`，并提示缺失的 Vue/iView/echarts 本地库。
