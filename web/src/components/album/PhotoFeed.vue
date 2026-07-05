<script setup lang="ts">
import { computed, reactive, ref, onMounted, onBeforeUnmount } from 'vue';
import AppLogo from '@/components/common/AppLogo.vue';
import PhotoLightbox from './PhotoLightbox.vue';
import AlbumThumb from './AlbumThumb.vue';
import FullscreenToggle from '@/components/common/FullscreenToggle.vue';
import ThemeToggle from '@/components/common/ThemeToggle.vue';
import IconExternalLink from '@/components/icons/IconExternalLink.vue';
import IconPlay from '@/components/icons/IconPlay.vue';
import IconLivePhoto from '@/components/icons/IconLivePhoto.vue';
import IconEdit from '@/components/icons/IconEdit.vue';
import IconNote from '@/components/icons/IconNote.vue';
import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue';
import RefreshButton from '@/components/common/RefreshButton.vue';
import { hasRefreshButton, hasFullscreenToggle, hasLanguageSwitcher } from '@/lib/host';
import { useI18n } from 'vue-i18n';
import { useMotion } from '@/composables/useMotion';
import { fmtDistance, haversineM } from '@/lib/geo';
import type { Manifest, Photo, Stop } from '@/lib/types';

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
const editing = reactive(new Set<string>());
const titleEditing = reactive(new Set<string>());

// Live Photo hover playback (one at a time).
const { motionUrl } = useMotion();
const motionHoverId = ref<string | null>(null);
const motionSrc = ref<string | null>(null);
async function onTileEnter(p: Photo) {
  emit('hover-photo', p);
  if (!p.motionUid) return;
  motionHoverId.value = p.id; motionSrc.value = null;
  const u = await motionUrl(p.motionUid);
  if (motionHoverId.value === p.id) motionSrc.value = u;
}
function onTileLeave(p: Photo) {
  emit('hover-photo', null);
  if (motionHoverId.value === p.id) { motionHoverId.value = null; motionSrc.value = null; }
}

const displayTitle = (stop: Stop) => stop.title || stop.place || t('album.unknownLocation');
function commitTitle(stop: Stop, e: Event) {
  emit('save-title', stop.key, (e.target as HTMLInputElement).value);
  titleEditing.delete(stop.key);
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

// mosaic: first photo leads as a hero, then large 2x2 features recur on an 11-tile rhythm with
// wide 2x1s staggered between (11 is coprime to the 2/3/4-column breakpoints, so the pattern
// never locks to the grid). No tall 1x2 tiles; dense flow backfills the gaps.
// Stops with 1–3 photos skip the mosaic — gridClass lays them out bespoke instead.
function tileSpan(i: number, n: number): string {
  if (n <= 2) return '';
  if (n === 3) return i === 0 ? 'sm:row-span-2' : ''; // hero left, two wide tiles stacked right
  if (i === 0) return 'col-span-2 row-span-2';
  const m = i % 11;
  if (m === 4 || m === 9) return 'col-span-2 row-span-2';
  if (m === 2 || m === 7) return 'col-span-2';
  return '';
}

// Small stops deserve big photos: a single photo spans the whole row as a wide hero, a pair
// splits the row into two large halves, a trio puts a tall hero beside two stacked wide tiles
// (all stacked full-width on phones). Only 4+ photos get the dense mosaic columns. Row heights
// stay in cqw so everything keeps scaling with the feed.
function gridClass(n: number): string {
  if (n === 1) return 'grid-cols-1 auto-rows-[68cqw] sm:auto-rows-[52cqw]';
  if (n === 2) return 'grid-cols-1 auto-rows-[60cqw] sm:grid-cols-2 sm:auto-rows-[38cqw]';
  if (n === 3) return 'grid-cols-1 auto-rows-[60cqw] sm:grid-cols-2 sm:auto-rows-[26cqw]';
  return 'grid-flow-dense grid-cols-2 auto-rows-[52cqw] sm:grid-cols-3 sm:auto-rows-[34cqw] lg:grid-cols-4 lg:auto-rows-[26cqw]';
}
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
      <nav
        :aria-label="t('controls.albumControls')"
        class="
          ml-auto flex shrink-0 items-center gap-1 rounded-full border
          border-neutral-200 bg-white/70 px-1.5 py-1 backdrop-blur-sm
          dark:border-neutral-800 dark:bg-neutral-900/70
        "
      >
        <RefreshButton v-if="hasRefreshButton" />
        <FullscreenToggle v-if="hasFullscreenToggle" />
        <ThemeToggle />
        <LanguageSwitcher v-if="hasLanguageSwitcher" />
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
      </nav>
    </header>

    <ol class="m-0 list-none p-0">
      <li
        v-for="(stop, i) in manifest.stops"
        :key="stop.key"
      >
        <!-- start of the timeline: an origin node sitting on the line, "Day 1" beside it -->
        <div
          v-if="i === 0"
          class="relative flex items-center py-9 pl-14"
        >
          <span
            class="
              absolute top-1/2 bottom-0 left-10 w-px -translate-x-1/2
              bg-neutral-300
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
          <span
            class="
              rounded-full bg-accent px-2.5 py-1 text-sm font-medium
              tracking-wider text-black
            "
          >{{ dateTag(0) }}</span>
        </div>

        <!-- mid-timeline connector: one continuous line; a new day gets an accent node with its
             date badge sitting on it, and the leg distance annotates the line -->
        <div
          v-else
          class="relative flex flex-wrap items-center gap-2.5 py-16 pl-14"
        >
          <span
            class="
              absolute inset-y-0 left-10 w-px -translate-x-1/2 bg-neutral-300
              dark:bg-neutral-700
            "
            aria-hidden="true"
          />
          <span
            v-if="isNewDay(i)"
            class="
              absolute top-1/2 left-10 size-3.5 -translate-1/2 rounded-full
              bg-accent ring-4 ring-white
              dark:ring-neutral-900
            "
            aria-hidden="true"
          />
          <span
            v-if="isNewDay(i)"
            class="
              rounded-full bg-accent px-2.5 py-1 text-sm font-medium
              tracking-wider text-black
            "
          >{{ dateTag(i) }}</span>
          <span
            v-if="legDist[i]"
            class="text-sm text-neutral-500"
          >↓ {{ legDist[i] }}</span>
        </div>

        <!-- full-width stop card -->
        <section
          :id="`stop-${i}`"
          class="
            group/stop relative scroll-mt-6 rounded-2xl border
            border-neutral-300 p-4
            sm:p-5
            dark:border-neutral-700
          "
        >
          <div class="flex items-center gap-1.5">
            <input
              v-if="titleEditing.has(stop.key)"
              :ref="(el) => (el as HTMLInputElement | null)?.focus()"
              :value="displayTitle(stop)"
              :aria-label="t('album.stopTitle')"
              class="
                w-full border-b border-accent bg-transparent text-xl font-medium
                tracking-tight outline-none
              "
              @blur="commitTitle(stop, $event)"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            >
            <h2
              v-else
              class="min-w-0 text-xl font-medium tracking-tight"
            >
              <button
                class="group/title flex min-w-0 items-center gap-1.5 text-left"
                :aria-label="t('album.rename', { title: displayTitle(stop) })"
                @click="titleEditing.add(stop.key)"
              >
                <span class="truncate">{{ displayTitle(stop) }}</span>
                <IconEdit
                  class="
                    size-3.5 shrink-0 text-neutral-400 opacity-0 transition
                    group-hover/stop:opacity-100
                    group-hover/title:text-accent
                    group-focus-visible/title:opacity-100
                  "
                />
              </button>
            </h2>
          </div>
          <textarea
            v-if="stop.description || editing.has(stop.key)"
            :ref="(el) => { if (editing.has(stop.key)) (el as HTMLTextAreaElement | null)?.focus(); }"
            :value="stop.description"
            :aria-label="t('album.note')"
            rows="1"
            class="
              mt-2 field-sizing-content w-full resize-none bg-transparent
              text-[0.95rem] leading-relaxed text-neutral-700 outline-none
              dark:text-neutral-300
            "
            @input="emit('save-description', stop.key, ($event.target as HTMLTextAreaElement).value)"
            @blur="!($event.target as HTMLTextAreaElement).value && editing.delete(stop.key)"
          />
          <button
            v-else
            class="
              absolute top-4 right-4 text-neutral-400 opacity-0 transition
              group-hover/stop:opacity-100
              hover:text-accent
              focus-visible:opacity-100
              sm:top-5 sm:right-5
            "
            :aria-label="t('album.addNote')"
            :title="t('album.addNote')"
            @click="editing.add(stop.key)"
          >
            <IconNote class="size-4" />
          </button>

          <!-- @container + cqw auto-rows: row height tracks the grid's width, so the mosaic
               tiles scale vertically as well as horizontally while spans still line up. -->
          <!-- mt matches the card's p-4/sm:p-5, so the gap above the grid equals the
               title's distance to the top edge -->
          <div
            class="
              @container mt-4
              sm:mt-5
            "
          >
            <div
              :class="[`
                grid gap-2
                sm:gap-3
              `, gridClass(stop.photos.length)]"
            >
              <AlbumThumb
                v-for="(p, j) in stop.photos"
                :key="p.id"
                :node-uid="p.nodeUid"
                role="button"
                tabindex="0"
                :aria-label="p.isVideo
                  ? t('album.viewVideo', { j: j + 1, n: stop.photos.length })
                  : t('album.viewPhoto', { j: j + 1, n: stop.photos.length })"
                :class="['group h-full cursor-zoom-in', tileSpan(j, stop.photos.length)]"
                @click="lightbox = flat.indexOf(p)"
                @keydown.enter.prevent="lightbox = flat.indexOf(p)"
                @keydown.space.prevent="lightbox = flat.indexOf(p)"
                @mouseenter="onTileEnter(p)"
                @mouseleave="onTileLeave(p)"
                @focus="onTileEnter(p)"
                @blur="onTileLeave(p)"
              >
                <!-- Live Photo motion, played on hover. pointer-events-none: the clip pops in
                     asynchronously — if it appeared between mousedown and mouseup, WebKit saw
                     different click targets and swallowed the click (tile wouldn't open). -->
                <video
                  v-if="p.motionUid && motionHoverId === p.id && motionSrc"
                  :src="motionSrc"
                  autoplay
                  muted
                  loop
                  playsinline
                  class="
                    pointer-events-none absolute inset-0 size-full object-cover
                  "
                  @canplay="($event.target as HTMLVideoElement).play().catch(() => {})"
                />
                <span
                  v-if="p.isVideo"
                  class="
                    pointer-events-none absolute inset-0 grid place-items-center
                  "
                >
                  <span
                    class="
                      grid size-11 place-items-center rounded-full bg-black/45
                      text-white
                    "
                  >
                    <IconPlay class="size-5" />
                  </span>
                </span>
                <span
                  v-else-if="p.motionUid"
                  class="
                    pointer-events-none absolute top-1.5 right-1.5 flex
                    items-center gap-1 rounded-full bg-black/45 p-0.5 text-xs
                    font-medium tracking-wide text-white uppercase
                  "
                >
                  <IconLivePhoto class="size-3" />
                </span>
              </AlbumThumb>
            </div>
          </div>
        </section>
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
          rounded-full bg-accent px-2.5 py-1 text-sm font-medium tracking-wider
          text-black transition
          hover:brightness-110
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
