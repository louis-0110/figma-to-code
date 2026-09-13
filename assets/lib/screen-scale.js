/* ScreenScale v1.4 (sizer mode) — self-hosted big-screen scale library.
 * Structure: scroll container (flex) > sizer (set width/height) > stage (scale, origin left top)
 * mode: width-adapt (default), fit, actual, fill-height, stretch, custom(setZoom)
 * Dispatches window 'screen-scale' event with { scale, mode, width, height }.
 */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { window.ScreenScale = factory(); }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var DEFAULTS = { mode: 'width-adapt', zoom: 1, minScale: 0.05, maxScale: 10, delay: 200, transition: false, onScale: null };
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function create(options) {
    var o = Object.assign({}, DEFAULTS, options || {});
    var target = typeof o.target === 'string' ? document.querySelector(o.target) : o.target;
    var sizer = typeof o.sizer === 'string' ? document.querySelector(o.sizer) : o.sizer;
    var stage = typeof o.stage === 'string' ? document.querySelector(o.stage) : o.stage;
    if (!target || !sizer || !stage) throw new Error('ScreenScale: target/sizer/stage required');
    var W = Number(o.width) || 1920;
    var H = Number(o.height) || 1080;
    var raf = null, timer = null;
    var last = { scale: 1, w: W, h: H };
    function apply(s, layout) {
      var w = W * s, h = H * s;
      var bw = target.clientWidth, bh = target.clientHeight;
      var left = layout.cx ? Math.max(0, (bw - w) / 2) : 0;
      var top = layout.cy ? Math.max(0, (bh - h) / 2) : 0;
      sizer.style.width = w + 'px';
      sizer.style.height = h + 'px';
      sizer.style.marginLeft = left + 'px';
      sizer.style.marginRight = '0';
      sizer.style.marginTop = top + 'px';
      sizer.style.marginBottom = '0';
      stage.style.transformOrigin = 'left top';
      stage.style.transform = (layout.sx && layout.sy) ? ('scale(' + layout.sx + ',' + layout.sy + ')') : ('scale(' + s + ')');
      last = { scale: s, w: w, h: h };
      if (o.onScale) try { o.onScale(s); } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('screen-scale', { detail: { scale: s, mode: o.mode, width: w, height: h } })); } catch (e) {}
    }
    function compute() {
      raf = null;
      var bw = target.clientWidth, bh = target.clientHeight;
      if (!bw || !bh) return;
      var vw = window.innerWidth || bw;
      var vh = window.innerHeight || bh;
      var s = 1, layout = { cx: false, cy: false, sx: null, sy: null };
      switch (o.mode) {
        case 'fit': s = Math.min(vw / W, vh / H); layout.cx = true; layout.cy = true; break;
        case 'actual': s = 1; layout.cx = true; layout.cy = true; break;
        case 'fill-height': s = vh / H; layout.cx = true; layout.cy = true; break;
        case 'stretch':
          sizer.style.width = bw + 'px'; sizer.style.height = bh + 'px'; sizer.style.margin = '0';
          layout.sx = bw / W; layout.sy = bh / H;
          apply(1, layout); return;
        case 'width-adapt':
        default: {
          s = bw / W;
          break;
        }
        case 'custom': s = o.zoom || 1; layout.cx = true; layout.cy = true; break;
      }
      if (o.mode !== 'stretch') {
        s = clamp(s * (o.zoom || 1), o.minScale, o.maxScale);
        apply(s, layout);
      }
      if (o.transition) stage.style.transition = 'transform 180ms ease';
    }
    function requestResize() { if (!raf) raf = window.requestAnimationFrame(compute); }
    function debounced() { if (timer) window.clearTimeout(timer); timer = window.setTimeout(requestResize, o.delay); }
    function onResize() { debounced(); }
    var sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(requestResize) : null;
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (sizeObserver) sizeObserver.observe(target);
    requestResize();
    return {
      resize: requestResize,
      setZoom: function (z) { o.zoom = z; requestResize(); },
      getScale: function () { return last.scale; },
      getSize: function () { return { width: last.w, height: last.h, scale: last.scale }; },
      destroy: function () {
        if (sizeObserver) sizeObserver.disconnect();
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
        if (timer) window.clearTimeout(timer);
        if (raf) window.cancelAnimationFrame(raf);
      }
    };
  }
  return { create: create };
});
