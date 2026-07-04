<script setup lang="ts">
import { computed } from 'vue';
import AlbumThumb from './AlbumThumb.vue';
import type { AlbumRef } from '@/composables/useAlbums';

const props = defineProps<{ album: AlbumRef }>();
const when = computed(() =>
  props.album.date
    ? new Date(props.album.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '',
);
</script>

<template>
  <RouterLink
    :to="{ name: 'album', params: { slug: album.slug } }"
    class="
      group relative block aspect-3/2 overflow-hidden rounded-lg bg-neutral-200
      dark:bg-neutral-800
    "
  >
    <AlbumThumb
      v-if="album.coverNodeUid"
      :node-uid="album.coverNodeUid"
      class="size-full rounded-none"
    />
    <div
      class="
        pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t
        from-black/80 via-black/30 to-transparent p-3 pt-10
      "
    >
      <div class="text-lg/tight font-bold text-white">
        {{ album.name }}
      </div>
      <div class="mt-0.5 text-xs text-white/75">
        {{ [when, album.photoCount ? album.photoCount + ' photos' : ''].filter(Boolean).join(' · ') }}
      </div>
    </div>
  </RouterLink>
</template>
