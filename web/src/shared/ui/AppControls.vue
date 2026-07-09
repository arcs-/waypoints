<script setup lang="ts">
import { hasRefreshButton, hasFullscreenToggle, hasLanguageSwitcher } from '@/shared/host';
import RefreshButton from './RefreshButton.vue';
import FullscreenToggle from './FullscreenToggle.vue';
import ThemeToggle from './ThemeToggle.vue';
import LanguageSwitcher from './LanguageSwitcher.vue';

// The pill of app-level controls shown in every header. Host capability flags decide which
// buttons render (desktop gets native menus instead — see host/). Page-specific extras
// (Proton links, sign-out) slot in after the shared set.
defineProps<{ label: string }>();
</script>

<template>
  <nav
    :aria-label="label"
    class="
      flex shrink-0 items-center gap-1 rounded-full border border-neutral-200
      bg-white/70 px-1.5 py-1 backdrop-blur-sm
      dark:border-neutral-800 dark:bg-neutral-900/70
    "
  >
    <RefreshButton v-if="hasRefreshButton" />
    <FullscreenToggle v-if="hasFullscreenToggle" />
    <ThemeToggle />
    <LanguageSwitcher v-if="hasLanguageSwitcher" />
    <slot />
  </nav>
</template>
