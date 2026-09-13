<template>
  <div class="scale-viewport" ref="viewport" data-qa="scale-viewport">
    <div class="scale-sizer" ref="sizer">
      <div
        class="scale-stage"
        ref="stage"
        data-qa="stage"
        :style="{ width: width + 'px', height: height + 'px' }"
      >
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ScaleStage',
  props: {
    mode: { type: String, default: 'width-adapt' },
    width: { type: Number, default: 1920 },
    height: { type: Number, default: 1080 }
  },
  mounted() {
    this.scaleInstance = window.ScreenScale.create({
      target: this.$refs.viewport,
      sizer: this.$refs.sizer,
      stage: this.$refs.stage,
      mode: this.mode,
      width: this.width,
      height: this.height
    });
  },
  beforeDestroy() {
    if (this.scaleInstance) this.scaleInstance.destroy();
    this.scaleInstance = null;
  }
};
</script>

<style>
.scale-viewport {
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  align-items: flex-start;
}

.scale-sizer {
  position: relative;
  flex: 0 0 auto;
}

.scale-stage {
  position: relative;
  transform-origin: left top;
  background: var(--page-bg, #f3f5f9);
}
</style>
