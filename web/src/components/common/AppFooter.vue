<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <footer
    class="
      flex items-center gap-2.5 text-sm text-neutral-400
      dark:text-neutral-500
    "
  >
    <a
      href="https://stillh.art"
      target="_blank"
      rel="noopener noreferrer"
      class="
        transition-colors
        hover:text-accent
      "
    >{{ t('footer.author') }}</a>
    <span aria-hidden="true">·</span>
    <a
      href="https://github.com/arcs-/memory-lane"
      target="_blank"
      rel="noopener noreferrer"
      class="
        transition-colors
        hover:text-accent
      "
    >{{ t('footer.source') }}</a>
  </footer>
</template>
