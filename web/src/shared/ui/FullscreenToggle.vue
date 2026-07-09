<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useFullscreen } from './useFullscreen';
import IconExpand from './icons/IconExpand.vue';
import IconCompress from './icons/IconCompress.vue';

const { t } = useI18n();
const { isFullscreen, toggle } = useFullscreen();
</script>

<template>
  <button
    :aria-label="isFullscreen ? t('controls.exitFullscreen') : t('controls.enterFullscreen')"
    :title="isFullscreen ? t('controls.exitFullscreen') : t('controls.fullscreen')"
    class="
      flex items-center border-0 p-1 text-neutral-500 transition-colors
      hover:text-accent
    "
    @click="toggle"
  >
    <IconCompress
      v-if="isFullscreen"
      class="size-5"
    />
    <IconExpand
      v-else
      class="size-5"
    />
  </button>
</template>
