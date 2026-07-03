<script setup lang="ts">
import { computed } from 'vue';
import Thumb from './Thumb.vue';
import type { AlbumRef } from '@/composables/useAlbums';

const props = defineProps<{ album: AlbumRef }>();
const when = computed(() =>
  props.album.date
    ? new Date(props.album.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '',
);
</script>

<template>
  <a
    :href="`#/album/${album.slug}`"
    class="group block overflow-hidden rounded-lg"
  >
    <div class="relative">
      <Thumb v-if="album.coverNodeUid" :node-uid="album.coverNodeUid" class="aspect-[3/2] rounded-lg" />
      <div v-else class="aspect-[3/2] rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      <div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent rounded-b-lg">
        <div class="text-white font-bold text-lg leading-tight">{{ album.name }}</div>
        <div class="text-white/70 text-xs mt-0.5">{{ [when, album.photoCount ? album.photoCount + ' photos' : ''].filter(Boolean).join(' · ') }}</div>
      </div>
    </div>
  </a>
</template>
