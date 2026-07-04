<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import PhotoFeed from '@/components/album/PhotoFeed.vue';
import RouteMap from '@/components/album/RouteMap.vue';
import LoadingRoute from '@/components/common/LoadingRoute.vue';
import NotFoundView from '@/views/NotFoundView.vue';
import { useAlbums } from '@/composables/useAlbums';
import { useAlbumManifest } from '@/composables/useAlbumManifest';
import { albumProtonUrl } from '@/lib/protonLink';
import { APP_NAME } from '@/lib/app';
import type { Photo } from '@/lib/types';

const props = defineProps<{ slug: string }>();
const { bySlug, albums } = useAlbums();
const { manifest, building, progress, total, error, ensure, saveDescription, saveTitle } = useAlbumManifest();
const protonUrl = ref<string | null>(null);
const hovered = ref<Photo | null>(null);
const activeStop = ref<number>(0);

const album = computed(() => bySlug(props.slug));
watch([album], () => {
  document.title = album.value ? `${album.value.name} · ${APP_NAME}` : APP_NAME;
  if (!album.value) return;
  ensure(album.value);
  protonUrl.value = albumProtonUrl(album.value.uid);
}, { immediate: true });

// Reading photo metadata is expensive and not resumable — guard against leaving mid-build.
const LEAVE_MSG = 'Still reading photo metadata — leave now and this album will need to rebuild.';
function beforeUnload(e: BeforeUnloadEvent) {
  if (!building.value) return;
  e.preventDefault();
  e.returnValue = ''; // required for the browser's native prompt
}
watch(building, (b) => {
  if (b) window.addEventListener('beforeunload', beforeUnload);
  else window.removeEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
// In-app navigation (e.g. back to the overview) while building → confirm first.
onBeforeRouteLeave(() => (building.value ? window.confirm(LEAVE_MSG) : true));
</script>

<template>
  <LoadingRoute
    v-if="!albums.length"
    class="min-h-dvh justify-center"
    :progress="0"
    :total="0"
  />
  <NotFoundView v-else-if="!album" />

  <LoadingRoute
    v-else-if="building"
    class="min-h-dvh justify-center"
    :progress="progress"
    :total="total"
    label="Reading photo metadata…"
  />

  <div
    v-else-if="error"
    class="p-6 text-neutral-500"
  >
    {{ error }}
  </div>

  <!-- Body scrolls the whole page. Mobile: map on top; Desktop: map sticky beside the feed. -->
  <div
    v-else-if="manifest"
    class="
      flex flex-col-reverse
      md:grid md:grid-cols-[1.7fr_1fr] md:items-start
      lg:grid-cols-[1.6fr_1fr]
    "
  >
    <PhotoFeed
      :manifest="manifest"
      :proton-url="protonUrl"
      @save-description="(key, text) => album && saveDescription(album, key, text)"
      @save-title="(key, text) => album && saveTitle(album, key, text)"
      @hover-photo="hovered = $event"
      @active-stop="activeStop = $event"
    />
    <div
      class="
        h-[42vh] shrink-0 border-t border-neutral-200
        md:sticky md:top-0 md:h-screen md:border-t-0 md:border-l
        dark:border-neutral-800
      "
    >
      <RouteMap
        :manifest="manifest"
        :highlight="hovered"
        :active-stop="activeStop"
      />
    </div>
  </div>
</template>
