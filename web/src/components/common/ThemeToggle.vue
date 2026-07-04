<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';
import IconSun from '@/components/icons/IconSun.vue';
import IconMoon from '@/components/icons/IconMoon.vue';

const { theme, toggle } = useTheme();
</script>

<template>
  <button
    :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    :title="theme === 'dark' ? 'Light mode' : 'Dark mode'"
    class="
      flex items-center border-0 p-1 text-neutral-500 transition-colors
      hover:text-accent
    "
    @click="toggle"
  >
    <IconSun
      v-if="theme === 'dark'"
      class="size-[18px]"
    />
    <IconMoon
      v-else
      class="size-[18px]"
    />
  </button>
</template>
