<script setup lang="ts">
import AppLogo from './AppLogo.vue';
import IconExternalLink from './icons/IconExternalLink.vue';

// Shared "nothing here yet" screen (no albums / empty album): muted logo, message, and an
// accent CTA that leads out to Proton. Extra links slot in below the CTA.
defineProps<{
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 text-center">
    <AppLogo
      class="
        size-10 text-neutral-300
        dark:text-neutral-700
      "
    />
    <p class="mt-2 text-xl font-medium tracking-tight">
      {{ title }}
    </p>
    <p class="max-w-sm text-sm text-neutral-500">
      {{ body }}
    </p>
    <a
      :href="ctaHref"
      target="_blank"
      rel="noopener noreferrer"
      class="
        mt-3 inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-2.5
        text-sm font-medium text-black transition
        hover:bg-accent/90
      "
    >
      {{ ctaLabel }}
      <IconExternalLink class="size-4" />
    </a>
    <slot />
  </div>
</template>
