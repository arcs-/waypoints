<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PhotoFeed from '@/components/PhotoFeed.vue';
import RouteMap from '@/components/RouteMap.vue';
import LoadingRoute from '@/components/LoadingRoute.vue';
import { useAlbums } from '@/composables/useAlbums';
import { useAlbumManifest } from '@/composables/useAlbumManifest';
import { albumProtonUrl } from '@/lib/protonLink';
import type { Photo } from '@/lib/types';

const props = defineProps<{ slug: string }>();
const { bySlug, albums } = useAlbums();
const { manifest, building, progress, total, error, ensure, saveDescription, saveTitle } = useAlbumManifest();
const protonUrl = ref<string | null>(null);
const hovered = ref<Photo | null>(null);

const album = computed(() => bySlug(props.slug));
watch([album], () => {
  if (!album.value) return;
  ensure(album.value);
  protonUrl.value = albumProtonUrl(album.value.uid);
}, { immediate: true });
</script>

<template>
  <LoadingRoute v-if="!albums.length" class="min-h-[100dvh] justify-center" :progress="0" :total="0" />
  <div v-else-if="!album" class="text-neutral-500 p-6">Album not found.</div>

  <LoadingRoute v-else-if="building" class="min-h-[100dvh] justify-center" :progress="progress" :total="total" label="Reading photo metadata…" />

  <div v-else-if="error" class="text-neutral-500 p-6">{{ error }}</div>

  <!-- Body scrolls the whole page. Mobile: map on top; Desktop: map sticky beside the feed. -->
  <div
    v-else-if="manifest"
    class="flex flex-col-reverse md:grid md:grid-cols-[1.7fr_1fr] lg:grid-cols-[1.6fr_1fr] md:items-start"
  >
    <PhotoFeed
      :manifest="manifest" :proton-url="protonUrl"
      @save-description="(key, text) => album && saveDescription(album, key, text)"
      @save-title="(key, text) => album && saveTitle(album, key, text)"
      @hover-photo="hovered = $event"
    />
    <div class="shrink-0 h-[42vh] md:h-screen md:sticky md:top-0 border-t md:border-t-0 md:border-l border-neutral-200 dark:border-neutral-800">
      <RouteMap :manifest="manifest" :highlight="hovered" />
    </div>
  </div>
</template>
