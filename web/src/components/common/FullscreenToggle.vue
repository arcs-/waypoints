<script setup lang="ts">
import { useFullscreen } from '@/composables/useFullscreen';
import IconExpand from '@/components/icons/IconExpand.vue';
import IconCompress from '@/components/icons/IconCompress.vue';

const { isFullscreen, toggle } = useFullscreen();
</script>

<template>
  <button
    :aria-label="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
    :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
    class="
      flex items-center border-0 p-1 text-neutral-500 transition-colors
      hover:text-accent
    "
    @click="toggle"
  >
    <IconCompress
      v-if="isFullscreen"
      class="size-[18px]"
    />
    <IconExpand
      v-else
      class="size-[18px]"
    />
  </button>
</template>
