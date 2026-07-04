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
import { useMotion } from '@/composables/useMotion';
import { fmtDistance, haversineM } from '@/lib/geo';
import type { Manifest, Photo, Stop } from '@/lib/types';

const props = defineProps<{ manifest: Manifest; protonUrl?: string | null }>();
const emit = defineEmits<{
  (e: 'save-description', key: string, text: string): void;
  (e: 'save-title', key: string, text: string): void;
  (e: 'hover-photo', photo: Photo | null): void;
  (e: 'active-stop', index: number): void;
}>();

// Scroll-spy: tell the map which stop is currently in view.
const rootEl = ref<HTMLElement | null>(null);
let spy: IntersectionObserver | null = null;
let lastActive = -1;
onMounted(() => {
  const sections = rootEl.value?.querySelectorAll<HTMLElement>('section[id^="stop-"]');
  if (!sections?.length) return;
  spy = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).id.slice(5)));
    if (!visible.length) return;
    const idx = Math.min(...visible);
    if (idx !== lastActive) { lastActive = idx; emit('active-stop', idx); }
  }, { rootMargin: '-25% 0px -65% 0px', threshold: 0 });
  sections.forEach((s) => spy!.observe(s));
});
onBeforeUnmount(() => spy?.disconnect());

const flat = computed<Photo[]>(() => props.manifest.stops.flatMap((s) => s.photos));
const lightbox = ref<number | null>(null);
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

const displayTitle = (stop: Stop) => stop.title || stop.place || 'Unknown location';
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
  const t = props.manifest.stops[i]?.startTime;
  if (!t) return '';
  const d = new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const n = dayNum(i);
  return n ? `Day ${n} · ${d}` : d;
}

function metaLine(stop: Stop): string {
  const parts: string[] = [];
  const s = stop.startTime ? new Date(stop.startTime) : null;
  const e = stop.endTime ? new Date(stop.endTime) : null;
  if (s) {
    const full: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    parts.push(!e || s.toDateString() === e.toDateString()
      ? s.toLocaleDateString(undefined, full)
      : `${s.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString(undefined, full)}`);
  }
  return parts.join(' · ');
}

// album summary: photos · days · total distance
const summary = computed(() => {
  const stops = props.manifest.stops;
  const parts = [`${flat.value.length} photos`];
  const days = new Set(stops.map((s) => dayOf(s.startTime)).filter(Boolean)).size;
  if (days) parts.push(`${days} ${days > 1 ? 'days' : 'day'}`);
  let meters = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (a && b && a.lat != null && b.lat != null) meters += haversineM(a.lat, a.lng!, b.lat, b.lng!);
  }
  if (meters > 0) parts.push(`${fmtDistance(meters)}`);
  return parts.join(' · ');
});

// mosaic: first photo leads as a hero, rest packed densely
function tileSpan(i: number): string {
  if (i === 0) return 'col-span-2 row-span-2';
  const m = i % 7;
  if (m === 3) return 'col-span-2';
  if (m === 5) return 'row-span-2';
  return '';
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
        aria-label="All trips"
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
        <h1 class="truncate text-2xl font-bold tracking-tight">
          {{ manifest.title }}
        </h1>
        <div class="mt-0.5 text-sm text-neutral-500">
          {{ summary }}
        </div>
      </div>
      <nav
        aria-label="Album controls"
        class="
          ml-auto flex shrink-0 items-center gap-1 rounded-full border
          border-neutral-200 bg-white/70 px-1.5 py-1 backdrop-blur-sm
          dark:border-neutral-800 dark:bg-neutral-900/70
        "
      >
        <FullscreenToggle />
        <ThemeToggle />
        <a
          v-if="protonUrl"
          :href="protonUrl"
          target="_blank"
          rel="noopener"
          class="
            flex items-center border-0 p-1 text-neutral-500 transition-colors
            hover:text-accent
          "
          aria-label="Open this album in Proton (opens in a new tab)"
          title="Open in Proton"
        >
          <IconExternalLink class="size-[18px]" />
        </a>
      </nav>
    </header>

    <ol class="m-0 list-none p-0">
      <li
        v-for="(stop, i) in manifest.stops"
        :key="stop.key"
      >
        <!-- start of the timeline: an origin node + accent "Day 1" tag, line flows down into card 1 -->
        <div
          v-if="i === 0"
          class="flex items-stretch gap-3"
        >
          <div class="ml-10 flex w-2 shrink-0 flex-col items-center">
            <span
              class="
                size-3.5 shrink-0 rounded-full bg-accent ring-4 ring-white
                dark:ring-neutral-900
              "
            />
            <div
              class="
                w-px flex-1 bg-neutral-300
                dark:bg-neutral-700
              "
            />
          </div>
          <div class="flex items-center py-5">
            <span
              class="
                rounded-full bg-accent px-2.5 py-1 text-xs font-bold
                tracking-wider text-black uppercase
              "
            >{{ dateTag(0) }}</span>
          </div>
        </div>

        <!-- mid-timeline connector; the line stretches flush so it touches both cards -->
        <div
          v-else
          class="flex items-stretch gap-3"
        >
          <div class="ml-10 flex w-2 shrink-0 justify-center">
            <div
              class="
                w-px bg-neutral-300
                dark:bg-neutral-700
              "
            />
          </div>
          <div class="flex flex-wrap items-center gap-2.5 py-14">
            <span
              v-if="isNewDay(i)"
              class="
                rounded-full bg-accent px-2.5 py-1 text-xs font-bold
                tracking-wider text-black uppercase
              "
            >
              {{ dateTag(i) }}
            </span>
            <span
              v-if="legDist[i]"
              class="text-xs text-neutral-500"
            >↓ {{ legDist[i] }}</span>
          </div>
        </div>

        <!-- full-width stop card -->
        <section
          :id="`stop-${i}`"
          class="
            group/stop scroll-mt-6 rounded-2xl border border-neutral-300 p-4
            sm:p-5
            dark:border-neutral-700
          "
        >
          <div class="flex items-center gap-1.5">
            <input
              v-if="titleEditing.has(stop.key)"
              :ref="(el) => (el as HTMLInputElement | null)?.focus()"
              :value="displayTitle(stop)"
              aria-label="Stop title"
              class="
                w-full border-b border-accent bg-transparent text-xl font-bold
                tracking-tight outline-none
              "
              @blur="commitTitle(stop, $event)"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            >
            <template v-else>
              <h2 class="truncate text-xl font-bold tracking-tight">
                {{ displayTitle(stop) }}
              </h2>
              <button
                class="
                  shrink-0 text-neutral-400 opacity-0 transition
                  group-hover/stop:opacity-100
                  hover:text-accent
                  focus-visible:opacity-100
                "
                :aria-label="`Rename ${displayTitle(stop)}`"
                @click="titleEditing.add(stop.key)"
              >
                <IconEdit class="size-3.5" />
              </button>
            </template>
          </div>
          <p class="mt-1 text-[11px] tracking-wider text-neutral-500 uppercase">
            {{ metaLine(stop) }}
          </p>

          <textarea
            v-if="stop.description || editing.has(stop.key)"
            :value="stop.description"
            aria-label="Note for this stop"
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
              mt-1 text-xs text-neutral-500 opacity-0 transition
              group-hover/stop:opacity-100
              hover:text-accent
              focus-visible:opacity-100
            "
            @click="editing.add(stop.key)"
          >
            + note
          </button>

          <div
            class="
              mt-4 grid grid-flow-dense auto-rows-36 grid-cols-2 gap-2
              sm:auto-rows-48 sm:grid-cols-3 sm:gap-3
              lg:auto-rows-56 lg:grid-cols-4
            "
          >
            <AlbumThumb
              v-for="(p, j) in stop.photos"
              :key="p.id"
              :node-uid="p.nodeUid"
              role="button"
              tabindex="0"
              :aria-label="`View ${p.isVideo ? 'video' : 'photo'} ${j + 1} of ${stop.photos.length}`"
              :class="['group h-full cursor-zoom-in', tileSpan(j)]"
              @click="lightbox = flat.indexOf(p)"
              @keydown.enter.prevent="lightbox = flat.indexOf(p)"
              @keydown.space.prevent="lightbox = flat.indexOf(p)"
              @mouseenter="onTileEnter(p)"
              @mouseleave="onTileLeave(p)"
              @focus="onTileEnter(p)"
              @blur="onTileLeave(p)"
            >
              <!-- Live Photo motion, played on hover -->
              <video
                v-if="p.motionUid && motionHoverId === p.id && motionSrc"
                :src="motionSrc"
                autoplay
                muted
                loop
                playsinline
                class="absolute inset-0 size-full object-cover"
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
                  <IconPlay class="size-[18px]" />
                </span>
              </span>
              <span
                v-else-if="p.motionUid"
                class="
                  pointer-events-none absolute top-1.5 left-1.5 flex
                  items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5
                  text-[10px] font-bold tracking-wide text-white uppercase
                "
              >
                <IconLivePhoto class="size-[11px]" />
                Live
              </span>
            </AlbumThumb>
          </div>
        </section>
      </li>
    </ol>

    <PhotoLightbox
      v-model="lightbox"
      :photos="flat"
    />
  </div>
</template>
