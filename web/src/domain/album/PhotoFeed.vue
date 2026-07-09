<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import AppLogo from '@/shared/ui/AppLogo.vue';
import AppControls from '@/shared/ui/AppControls.vue';
import IconExternalLink from '@/shared/ui/icons/IconExternalLink.vue';
import PhotoLightbox from './PhotoLightbox.vue';
import StopSection from './StopSection.vue';
import { fmtDistance, haversineM } from '@/shared/lib/geo';
import type { Manifest, Photo } from './types';

const props = defineProps<{
  manifest: Manifest;
  protonUrl?: string | null;
  removePhoto?: (p: Photo, trash: boolean) => Promise<void>;
}>();
const emit = defineEmits<{
  (e: 'save-description', key: string, text: string): void;
  (e: 'save-title', key: string, text: string): void;
  (e: 'hover-photo', photo: Photo | null): void;
  (e: 'active-stop', index: number | null): void;
}>();

const { t, locale } = useI18n();

// Scroll-spy: tell the map which stop is currently in view. `null` means "at the top of the
// page" — the map shows the whole-trip overview only there; as soon as the reader scrolls into
// the feed, the current stop (including the first) is zoomed in.
const rootEl = ref<HTMLElement | null>(null);
let spy: IntersectionObserver | null = null;
let spyIdx = 0;
let lastActive: number | null = null;
const TOP_PX = 64; // small allowance so rubber-banding doesn't count as scrolling
function emitActive() {
  const v = window.scrollY < TOP_PX ? null : spyIdx;
  if (v !== lastActive) { lastActive = v; emit('active-stop', v); }
}
onMounted(() => {
  const sections = rootEl.value?.querySelectorAll<HTMLElement>('section[id^="stop-"]');
  if (!sections?.length) return;
  spy = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).id.slice(5)));
    if (!visible.length) return;
    spyIdx = Math.min(...visible);
    emitActive();
  }, { rootMargin: '-25% 0px -65% 0px', threshold: 0 });
  sections.forEach((s) => spy!.observe(s));
  window.addEventListener('scroll', emitActive, { passive: true });
});
onBeforeUnmount(() => {
  spy?.disconnect();
  window.removeEventListener('scroll', emitActive);
});

const flat = computed<Photo[]>(() => props.manifest.stops.flatMap((s) => s.photos));
const lightbox = ref<number | null>(null);

// Photo removal (lightbox): run the SDK+manifest work, then clamp the index to the shrunk list.
async function onRemovePhoto(p: Photo, trash: boolean) {
  await props.removePhoto?.(p, trash);
  if (lightbox.value != null) {
    const n = flat.value.length;
    lightbox.value = n ? Math.min(lightbox.value, n - 1) : null;
  }
}

const dayOf = (t: string | null | undefined) => (t ? t.slice(0, 10) : null);

// distance from the previous stop (the "location changed" label)
const legDist = computed<(string | null)[]>(() =>
  props.manifest.stops.map((s, i) => {
    const prev = props.manifest.stops[i - 1];
    if (!prev || s.lat == null || prev.lat == null) return null;
    return fmtDistance(haversineM(prev.lat, prev.lng!, s.lat, s.lng!));
  }),
);

function isNewDay(i: number): boolean {
  const stops = props.manifest.stops;
  if (i === 0) return true;
  return dayOf(stops[i]?.startTime) !== dayOf(stops[i - 1]?.startTime);
}
function dayNum(i: number): number | null {
  const first = dayOf(props.manifest.stops[0]?.startTime);
  const d = dayOf(props.manifest.stops[i]?.startTime);
  return first && d ? Math.round((+new Date(d) - +new Date(first)) / 86400000) + 1 : null;
}
function dateTag(i: number): string {
  const start = props.manifest.stops[i]?.startTime;
  if (!start) return '';
  const d = new Date(start).toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const n = dayNum(i);
  return n ? `${t('album.day', { n })} · ${d}` : d;
}

// album summary: photos · days · total distance
const summary = computed(() => {
  const stops = props.manifest.stops;
  const parts = [t('album.photos', { n: flat.value.length }, flat.value.length)];
  const days = new Set(stops.map((s) => dayOf(s.startTime)).filter(Boolean)).size;
  if (days) parts.push(t('album.days', { n: days }, days));
  let meters = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (a && b && a.lat != null && b.lat != null) meters += haversineM(a.lat, a.lng!, b.lat, b.lng!);
  }
  if (meters > 0) parts.push(`${fmtDistance(meters)}`);
  return parts.join(' · ');
});
</script>

<template>
  <div
    ref="rootEl"
    class="
      min-w-0 p-4
      sm:p-6
      lg:p-8
    "
  >
    <header class="mb-8 flex items-center gap-4">
      <RouterLink
        :to="{ name: 'overview' }"
        :aria-label="t('controls.allTrips')"
        class="
          -mt-4 shrink-0 transition-colors
          hover:text-accent
        "
      >
        <AppLogo
          class="size-7"
        />
      </RouterLink>
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-medium tracking-tight">
          {{ manifest.title }}
        </h1>
        <div class="mt-0.5 text-sm text-neutral-500">
          {{ summary }}
        </div>
      </div>
      <AppControls
        :label="t('controls.albumControls')"
        class="ml-auto"
      >
        <a
          v-if="protonUrl"
          :href="protonUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="
            flex items-center border-0 p-1 text-neutral-500 transition-colors
            hover:text-accent
          "
          :aria-label="t('controls.openAlbumProton')"
          :title="t('controls.openInProton')"
        >
          <IconExternalLink class="size-5" />
        </a>
      </AppControls>
    </header>

    <ol class="m-0 list-none p-0">
      <li
        v-for="(stop, i) in manifest.stops"
        :key="stop.key"
      >
        <StopSection
          :stop="stop"
          :index="i"
          :date-tag="dateTag(i)"
          :is-new-day="isNewDay(i)"
          :leg-dist="legDist[i] ?? null"
          @open-photo="lightbox = flat.indexOf($event)"
          @hover-photo="emit('hover-photo', $event)"
          @save-description="(key, text) => emit('save-description', key, text)"
          @save-title="(key, text) => emit('save-title', key, text)"
        />
      </li>
    </ol>

    <!-- end of the timeline: the line runs down from the last stop into a terminal node,
         mirroring the origin, with an "End" badge beside it -->
    <div
      v-if="manifest.stops.length"
      class="relative flex items-center py-9 pl-14"
    >
      <span
        class="
          absolute top-0 bottom-1/2 left-10 w-px -translate-x-1/2 bg-neutral-300
          dark:bg-neutral-700
        "
        aria-hidden="true"
      />
      <span
        class="
          absolute top-1/2 left-10 size-3.5 -translate-1/2 rounded-full
          bg-accent ring-4 ring-white
          dark:ring-neutral-900
        "
        aria-hidden="true"
      />
      <RouterLink
        :to="{ name: 'overview' }"
        :aria-label="t('controls.allTrips')"
        class="
          rounded-full bg-accent/25 px-2.5 py-1 text-sm font-medium
          tracking-wider text-neutral-700 transition
          hover:bg-accent/40
          dark:bg-accent/15 dark:text-accent
          dark:hover:bg-accent/25
        "
      >
        {{ t('album.end') }}
      </RouterLink>
    </div>

    <PhotoLightbox
      v-model="lightbox"
      :photos="flat"
      :remove="removePhoto ? onRemovePhoto : undefined"
    />
  </div>
</template>
