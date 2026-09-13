(() => {
  'use strict';

  window.addEventListener('DOMContentLoaded', () => {
    if (!window.Vue || !window.iview || !window.ScreenScale || !window['vue2-sfc-loader']) {
      throw new Error('Vue2 scaffold requires local vue.min.js, vue2-sfc-loader.js, screen-scale.js and iview.min.js in lib/');
    }

    Vue.config.productionTip = false;
    Vue.use(window.iview);

    const { loadModule } = window['vue2-sfc-loader'];
    const sfcOptions = {
      moduleCache: { vue: Vue },
      async getFile(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(response.statusText + ' ' + url);
        return {
          type: url.endsWith('.js') ? '.mjs' : '.vue',
          getContentData: () => response.text()
        };
      },
      addStyle(text) {
        const style = document.createElement('style');
        style.textContent = text;
        document.head.appendChild(style);
      }
    };

    new Vue({
      el: '#app',
      template: '<App />',
      components: {
        App: () => loadModule('src/App.vue', sfcOptions)
      }
    });
  });
})();
