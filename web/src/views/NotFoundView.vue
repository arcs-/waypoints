<script setup lang="ts">
import { onMounted } from 'vue';
import AppLogo from '@/components/common/AppLogo.vue';
import { APP_NAME } from '@/lib/app';

onMounted(() => (document.title = `Not found · ${APP_NAME}`));
</script>

<template>
  <div
    class="
      flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center
    "
  >
    <AppLogo class="size-10 text-accent" />
    <div class="text-6xl font-bold tracking-tight tabular-nums">
      404
    </div>
    <p
      class="
        max-w-sm text-neutral-500
        dark:text-neutral-400
      "
    >
      This trip took a wrong turn — the page you're looking for doesn't exist.
    </p>
    <RouterLink
      :to="{ name: 'overview' }"
      class="
        rounded-sm border-[1.5px] border-current px-4 py-2 font-bold
        transition-colors
        hover:border-accent hover:bg-accent hover:text-black
      "
    >
      Back to all trips
    </RouterLink>
  </div>
</template>
