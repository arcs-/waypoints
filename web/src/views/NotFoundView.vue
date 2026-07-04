<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import AppLogo from '@/components/common/AppLogo.vue';
import { APP_NAME } from '@/lib/app';

const { t } = useI18n();
onMounted(() => (document.title = `${t('notFound.title')} · ${APP_NAME}`));
</script>

<template>
  <div
    class="
      flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center
    "
  >
    <AppLogo class="size-10 text-accent" />
    <div class="text-6xl font-medium tracking-tight tabular-nums">
      404
    </div>
    <p
      class="
        max-w-sm text-neutral-500
        dark:text-neutral-400
      "
    >
      {{ t('notFound.message') }}
    </p>
    <RouterLink
      :to="{ name: 'overview' }"
      class="
        rounded-sm border-[1.5px] border-current px-4 py-2 font-medium
        transition-colors
        hover:border-accent hover:bg-accent hover:text-black
      "
    >
      {{ t('notFound.back') }}
    </RouterLink>
  </div>
</template>
