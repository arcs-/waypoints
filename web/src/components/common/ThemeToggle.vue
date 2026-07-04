<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useTheme } from '@/composables/useTheme';
import IconSun from '@/components/icons/IconSun.vue';
import IconMoon from '@/components/icons/IconMoon.vue';

const { t } = useI18n();
const { theme, toggle } = useTheme();
</script>

<template>
  <button
    :aria-label="theme === 'dark' ? t('controls.switchToLight') : t('controls.switchToDark')"
    :title="theme === 'dark' ? t('controls.lightMode') : t('controls.darkMode')"
    class="
      flex items-center border-0 p-1 text-neutral-500 transition-colors
      hover:text-accent
    "
    @click="toggle"
  >
    <IconSun
      v-if="theme === 'dark'"
      class="size-5"
    />
    <IconMoon
      v-else
      class="size-5"
    />
  </button>
</template>
