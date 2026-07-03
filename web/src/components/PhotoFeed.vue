<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import Logo from './Logo.vue';
import Lightbox from './Lightbox.vue';
import Thumb from './Thumb.vue';
import { fmtDistance, haversineM } from '@/lib/geo';
import type { Manifest, Photo, Stop } from '@/lib/types';

const props = defineProps<{ manifest: Manifest; protonUrl?: string | null }>();
const emit = defineEmits<{
  (e: 'save-description', key: string, text: string): void;
  (e: 'save-title', key: string, text: string): void;
  (e: 'hover-photo', photo: Photo | null): void;
}>();

const flat = computed<Photo[]>(() => props.manifest.stops.flatMap((s) => s.photos));
const lightbox = ref<number | null>(null);
const editing = reactive(new Set<string>());
const titleEditing = reactive(new Set<string>());

const displayTitle = (stop: Stop) => stop.title || stop.place || 'Unknown location';
function commitTitle(stop: Stop, e: Event) {
  emit('save-title', stop.key, (e.target as HTMLInputElement).value);
  titleEditing.delete(stop.key);
}

const dayOf = (t: string | null) => (t ? t.slice(0, 10) : null);

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
  return dayOf(stops[i].startTime) !== dayOf(stops[i - 1].startTime);
}
function dayNum(i: number): number | null {
  const first = dayOf(props.manifest.stops[0]?.startTime);
  const d = dayOf(props.manifest.stops[i].startTime);
  return first && d ? Math.round((+new Date(d) - +new Date(first)) / 86400000) + 1 : null;
}
function dateTag(i: number): string {
  const t = props.manifest.stops[i].startTime;
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
  parts.push(`${stop.photos.length} photos`);
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
    if (a.lat != null && b.lat != null) meters += haversineM(a.lat, a.lng!, b.lat, b.lng!);
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
  <div class="p-4 sm:p-6 lg:p-8 min-w-0">
    <header class="flex items-center gap-4 mb-8">
      <a href="#/" aria-label="All trips" class="shrink-0 hover:text-accent transition-colors -mt-4"><Logo class="w-7 h-7" /></a>
      <div class="min-w-0">
        <h1 class="text-2xl font-bold tracking-tight truncate">{{ manifest.title }}</h1>
        <div class="mt-0.5 text-sm text-neutral-500">{{ summary }}</div>
      </div>
      <a
        v-if="protonUrl" :href="protonUrl" target="_blank" rel="noopener"
        class="ml-auto shrink-0 text-neutral-400 hover:text-accent transition-colors" aria-label="Open this album in Proton (opens in a new tab)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
      </a>
    </header>

    <ol class="list-none p-0 m-0">
     <li v-for="(stop, i) in manifest.stops" :key="stop.key">
      <!-- start of the timeline: an origin node + accent "Day 1" tag, line flows down into card 1 -->
      <div v-if="i === 0" class="flex items-stretch gap-3">
        <div class="ml-10 w-2 shrink-0 flex flex-col items-center">
          <span class="w-3.5 h-3.5 rounded-full bg-accent ring-4 ring-white dark:ring-neutral-900 shrink-0"></span>
          <div class="w-px flex-1 bg-neutral-300 dark:bg-neutral-700"></div>
        </div>
        <div class="flex items-center py-5">
          <span class="rounded-full bg-accent text-black text-xs font-bold uppercase tracking-wider px-2.5 py-1">{{ dateTag(0) }}</span>
        </div>
      </div>

      <!-- mid-timeline connector; the line stretches flush so it touches both cards -->
      <div v-else class="flex items-stretch gap-3">
        <div class="ml-10 w-2 shrink-0 flex justify-center">
          <div class="w-px bg-neutral-300 dark:bg-neutral-700"></div>
        </div>
        <div class="flex items-center gap-2.5 flex-wrap py-14">
          <span v-if="isNewDay(i)" class="rounded-full bg-accent text-black text-xs font-bold uppercase tracking-wider px-2.5 py-1">
            {{ dateTag(i) }}
          </span>
          <span v-if="legDist[i]" class="text-xs text-neutral-500">↓ {{ legDist[i] }}</span>
        </div>
      </div>

      <!-- full-width stop card -->
      <section
        :id="`stop-${i}`"
        class="ml-card group/stop scroll-mt-6 rounded-2xl border border-neutral-300 dark:border-neutral-700 p-4 sm:p-5"
      >
        <div class="flex items-center gap-1.5">
          <input
            v-if="titleEditing.has(stop.key)" :value="displayTitle(stop)"
            :ref="(el) => (el as HTMLInputElement | null)?.focus()" aria-label="Stop title"
            @blur="commitTitle(stop, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"
            class="font-bold text-xl tracking-tight bg-transparent outline-none border-b border-accent w-full"
          />
          <template v-else>
            <h2
              class="font-bold text-xl tracking-tight truncate cursor-text hover:text-accent transition-colors"
              @click="titleEditing.add(stop.key)"
            >{{ displayTitle(stop) }}</h2>
            <button
              class="shrink-0 text-neutral-400 opacity-0 group-hover/stop:opacity-100 focus-visible:opacity-100 transition hover:text-accent"
              :aria-label="`Rename ${displayTitle(stop)}`" @click="titleEditing.add(stop.key)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
          </template>
        </div>
        <p class="mt-1 text-[11px] uppercase tracking-wider text-neutral-500">{{ metaLine(stop) }}</p>

        <textarea
          v-if="stop.description || editing.has(stop.key)"
          :value="stop.description" aria-label="Note for this stop"
          @input="emit('save-description', stop.key, ($event.target as HTMLTextAreaElement).value)"
          @blur="!($event.target as HTMLTextAreaElement).value && editing.delete(stop.key)"
          rows="1"
          class="mt-2 w-full resize-none bg-transparent outline-none text-[0.95rem] leading-relaxed text-neutral-700 dark:text-neutral-300 [field-sizing:content]"
        />
        <button
          v-else class="mt-1 text-xs text-neutral-500 opacity-0 group-hover/stop:opacity-100 focus-visible:opacity-100 transition hover:text-accent"
          @click="editing.add(stop.key)"
        >+ note</button>

        <div class="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 [grid-auto-flow:dense] [grid-auto-rows:9rem] sm:[grid-auto-rows:12rem] lg:[grid-auto-rows:14rem]">
          <Thumb
            v-for="(p, j) in stop.photos" :key="p.id" :node-uid="p.nodeUid"
            role="button" tabindex="0" :aria-label="`View ${p.isVideo ? 'video' : 'photo'} ${j + 1} of ${stop.photos.length}`"
            :class="['group cursor-zoom-in h-full', tileSpan(j)]"
            @click="lightbox = flat.indexOf(p)"
            @keydown.enter.prevent="lightbox = flat.indexOf(p)"
            @keydown.space.prevent="lightbox = flat.indexOf(p)"
            @mouseenter="emit('hover-photo', p)" @mouseleave="emit('hover-photo', null)"
          >
            <span v-if="p.isVideo" class="absolute inset-0 grid place-items-center pointer-events-none">
              <span class="grid place-items-center w-11 h-11 rounded-full bg-black/45 text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
          </Thumb>
        </div>
      </section>
     </li>
    </ol>

    <Lightbox v-model="lightbox" :photos="flat" />
  </div>
</template>
