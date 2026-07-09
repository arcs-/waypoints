<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AlbumThumb from './AlbumThumb.vue';
import type { AlbumRef } from './useAlbums';

const props = defineProps<{ album: AlbumRef }>();
const { t, locale } = useI18n();

const when = computed(() =>
  props.album.date
    ? new Date(props.album.date).toLocaleDateString(locale.value, { month: 'short', year: 'numeric' })
    : '',
);
const meta = computed(() => {
  const count = props.album.photoCount;
  const parts = [when.value, count ? t('album.photos', { n: count }, count) : ''];
  return parts.filter(Boolean).join(' · ');
});
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
      <div class="text-lg/tight font-medium text-white">
        {{ album.name }}
      </div>
      <div class="mt-0.5 text-sm text-white/75">
        {{ meta }}
      </div>
    </div>
  </RouterLink>
</template>
