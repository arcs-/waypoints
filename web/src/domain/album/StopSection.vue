<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMotion } from '@/domain/media/useMotion';
import AlbumThumb from './AlbumThumb.vue';
import IconPlay from '@/shared/ui/icons/IconPlay.vue';
import IconLivePhoto from '@/shared/ui/icons/IconLivePhoto.vue';
import IconEdit from '@/shared/ui/icons/IconEdit.vue';
import IconNote from '@/shared/ui/icons/IconNote.vue';
import type { Photo, Stop } from './types';

// One stop of the album feed: the timeline connector above it (origin node for the first
// stop, day badge / leg distance after that), the card with its editable title and note,
// and the photo mosaic. Cross-stop context (day numbering, leg distances) is computed by
// the feed and passed in; everything per-stop lives here.
const props = defineProps<{
  stop: Stop;
  index: number;
  dateTag: string; // "Day n · date" badge text
  isNewDay: boolean; // whether the connector shows a day node + badge
  legDist: string | null; // formatted distance from the previous stop
}>();
const emit = defineEmits<{
  (e: 'open-photo', photo: Photo): void;
  (e: 'hover-photo', photo: Photo | null): void;
  (e: 'save-description', key: string, text: string): void;
  (e: 'save-title', key: string, text: string): void;
}>();

const { t } = useI18n();

const editingTitle = ref(false);
const editingNote = ref(false);

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

const displayTitle = () => props.stop.title || props.stop.place || t('album.unknownLocation');
function commitTitle(e: Event) {
  emit('save-title', props.stop.key, (e.target as HTMLInputElement).value);
  editingTitle.value = false;
}

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
  <!-- start of the timeline: an origin node sitting on the line, "Day 1" beside it -->
  <div
    v-if="index === 0"
    class="relative flex items-center py-9 pl-14"
  >
    <span
      class="
        absolute top-1/2 bottom-0 left-10 w-px -translate-x-1/2 bg-neutral-300
        dark:bg-neutral-700
      "
      aria-hidden="true"
    />
    <span
      class="
        absolute top-1/2 left-10 size-3.5 -translate-1/2 rounded-full bg-accent
        ring-4 ring-white
        dark:ring-neutral-900
      "
      aria-hidden="true"
    />
    <span
      class="
        rounded-full bg-accent/25 px-2.5 py-1 text-sm font-medium tracking-wider
        text-neutral-700
        dark:bg-accent/15 dark:text-accent
      "
    >{{ dateTag }}</span>
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
      v-if="isNewDay"
      class="
        absolute top-1/2 left-10 size-3.5 -translate-1/2 rounded-full bg-accent
        ring-4 ring-white
        dark:ring-neutral-900
      "
      aria-hidden="true"
    />
    <span
      v-if="isNewDay"
      class="
        rounded-full bg-accent/25 px-2.5 py-1 text-sm font-medium tracking-wider
        text-neutral-700
        dark:bg-accent/15 dark:text-accent
      "
    >{{ dateTag }}</span>
    <span
      v-if="legDist"
      class="text-sm text-neutral-500"
    >↓ {{ legDist }}</span>
  </div>

  <!-- full-width stop card -->
  <section
    :id="`stop-${index}`"
    class="
      group/stop relative scroll-mt-6 rounded-2xl border border-neutral-300 p-4
      sm:p-5
      dark:border-neutral-700
    "
  >
    <div class="flex items-center gap-1.5">
      <input
        v-if="editingTitle"
        :ref="(el) => (el as HTMLInputElement | null)?.focus()"
        :value="displayTitle()"
        :aria-label="t('album.stopTitle')"
        class="
          w-full border-b border-accent bg-transparent text-xl font-medium
          tracking-tight outline-none
        "
        @blur="commitTitle"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      >
      <h2
        v-else
        class="min-w-0 text-xl font-medium tracking-tight"
      >
        <button
          class="group/title flex min-w-0 items-center gap-1.5 text-left"
          :aria-label="t('album.rename', { title: displayTitle() })"
          @click="editingTitle = true"
        >
          <span class="truncate">{{ displayTitle() }}</span>
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
      v-if="stop.description || editingNote"
      :ref="(el) => { if (editingNote) (el as HTMLTextAreaElement | null)?.focus(); }"
      :value="stop.description"
      :aria-label="t('album.note')"
      rows="1"
      class="
        mt-2 field-sizing-content w-full resize-none bg-transparent
        text-[0.95rem] leading-relaxed text-neutral-700 outline-none
        dark:text-neutral-300
      "
      @input="emit('save-description', stop.key, ($event.target as HTMLTextAreaElement).value)"
      @blur="!($event.target as HTMLTextAreaElement).value && (editingNote = false)"
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
      @click="editingNote = true"
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
          @click="emit('open-photo', p)"
          @keydown.enter.prevent="emit('open-photo', p)"
          @keydown.space.prevent="emit('open-photo', p)"
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
            class="pointer-events-none absolute inset-0 size-full object-cover"
            @canplay="($event.target as HTMLVideoElement).play().catch(() => {})"
          />
          <span
            v-if="p.isVideo"
            class="pointer-events-none absolute inset-0 grid place-items-center"
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
              pointer-events-none absolute top-1.5 right-1.5 flex items-center
              gap-1 rounded-full bg-black/45 p-0.5 text-xs font-medium
              tracking-wide text-white uppercase
            "
          >
            <IconLivePhoto class="size-3" />
          </span>
        </AlbumThumb>
      </div>
    </div>
  </section>
</template>
