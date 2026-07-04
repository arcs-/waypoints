<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import IconRefresh from '@/components/icons/IconRefresh.vue';

const { t } = useI18n();

// Reload the app. Mainly for the Tauri desktop shell, whose webview has no ⌘R by default.
function refresh() {
  window.location.reload();
}
</script>

<template>
  <button
    :aria-label="t('controls.refresh')"
    :title="t('controls.refresh')"
    class="
      flex items-center border-0 p-1 text-neutral-500 transition-colors
      hover:text-accent
    "
    @click="refresh"
  >
    <IconRefresh class="size-5" />
  </button>
</template>
