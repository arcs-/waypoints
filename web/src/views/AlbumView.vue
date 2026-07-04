<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PhotoFeed from '@/components/album/PhotoFeed.vue';
import RouteMap from '@/components/album/RouteMap.vue';
import LoadingRoute from '@/components/common/LoadingRoute.vue';
import AppLogo from '@/components/common/AppLogo.vue';
import IconExternalLink from '@/components/icons/IconExternalLink.vue';
import NotFoundView from '@/views/NotFoundView.vue';
import { useAlbums } from '@/composables/useAlbums';
import { useAlbumManifest } from '@/composables/useAlbumManifest';
import { albumProtonUrl, PROTON_PHOTOS_URL } from '@/lib/protonLink';
import { APP_NAME } from '@/lib/app';
import type { Photo } from '@/lib/types';

const props = defineProps<{ slug: string }>();
const { t } = useI18n();
const { bySlug, albums } = useAlbums();
const { manifest, loading, building, progress, total, error, ensure, saveDescription, saveTitle } = useAlbumManifest();
const protonUrl = ref<string | null>(null);
const hovered = ref<Photo | null>(null);
const activeStop = ref<number>(0);

const album = computed(() => bySlug(props.slug));
const isEmpty = computed(() => !!manifest.value && !manifest.value.stops.some((s) => s.photos.length));
watch([album], () => {
  document.title = album.value ? `${album.value.name} · ${APP_NAME}` : APP_NAME;
  if (!album.value) return;
  ensure(album.value);
  protonUrl.value = albumProtonUrl(album.value.uid);
}, { immediate: true });

// Reading photo metadata is expensive and not resumable — guard against leaving mid-build.
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
onBeforeRouteLeave(() => (building.value ? window.confirm(t('album.leaveWarning')) : true));
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
    :label="t('album.readingMetadata')"
  />

  <!-- Cache-file probe (usually a hit): neutral spinner, no misleading 0/N metadata count. -->
  <LoadingRoute
    v-else-if="loading"
    class="min-h-dvh justify-center"
    :progress="0"
    :total="0"
  />

  <div
    v-else-if="error"
    class="p-6 text-neutral-500"
  >
    {{ error }}
  </div>

  <!-- Album exists but holds no photos yet — same shape as the overview's no-albums state. -->
  <div
    v-else-if="isEmpty"
    class="
      flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center
    "
  >
    <AppLogo
      class="
        size-10 text-neutral-300
        dark:text-neutral-700
      "
    />
    <p class="mt-2 text-xl font-medium tracking-tight">
      {{ t('album.emptyTitle') }}
    </p>
    <p class="max-w-sm text-sm text-neutral-500">
      {{ t('album.emptyBody') }}
    </p>
    <a
      :href="protonUrl ?? PROTON_PHOTOS_URL"
      target="_blank"
      rel="noopener noreferrer"
      class="
        mt-3 inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-2.5
        text-sm font-medium text-black transition
        hover:bg-accent/90
      "
    >
      {{ t('controls.openInProton') }}
      <IconExternalLink class="size-4" />
    </a>
    <RouterLink
      :to="{ name: 'overview' }"
      class="
        mt-1 text-sm text-neutral-500
        hover:text-accent
      "
    >
      {{ t('notFound.back') }}
    </RouterLink>
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
