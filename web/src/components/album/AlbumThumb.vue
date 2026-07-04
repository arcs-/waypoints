<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useThumbnails } from '@/composables/useThumbnails';

const props = defineProps<{ nodeUid: string; alt?: string }>();
const { thumbUrl } = useThumbnails();
const url = ref<string | null>(null);
const loaded = ref(false);
const el = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

async function load() {
  if (url.value) return;
  url.value = await thumbUrl(props.nodeUid);
}

onMounted(() => {
  // Only decrypt/load when the tile is near the viewport (avoids fetching the whole album at once).
  observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { load(); observer?.disconnect(); }
  }, { rootMargin: '200px 0px' });
  if (el.value) observer.observe(el.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <!-- Consumer supplies sizing (e.g. aspect-square / aspect-[4/3]). -->
  <div
    ref="el"
    class="
      relative overflow-hidden rounded-sm bg-neutral-200
      dark:bg-neutral-800
    "
  >
    <img
      v-if="url"
      :src="url"
      :alt="alt || ''"
      decoding="async"
      class="
        block size-full object-cover opacity-0 transition duration-500
        group-hover:scale-[1.04]
      "
      :class="{ 'opacity-100': loaded }"
      @load="loaded = true"
    >
    <slot />
  </div>
</template>
