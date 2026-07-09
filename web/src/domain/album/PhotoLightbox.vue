<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useThumbnails } from '@/domain/media/useThumbnails';
import { useI18n } from 'vue-i18n';
import { useMotion } from '@/domain/media/useMotion';
import { useFullPhoto } from '@/domain/media/useFullPhoto';
import { playableVideoUrl } from '@/domain/media/videoUrl';
import IconLivePhoto from '@/shared/ui/icons/IconLivePhoto.vue';
import IconDownload from '@/shared/ui/icons/IconDownload.vue';
import IconRemove from '@/shared/ui/icons/IconRemove.vue';
import IconTrash from '@/shared/ui/icons/IconTrash.vue';
import type { Photo } from './types';

const { t, locale } = useI18n();

// index === null → closed. Reuses the in-browser thumbnail decryption + cache.
// `remove` (when provided) removes the current photo from the album; trash=true also
// moves the file to the Proton trash. The parent owns the SDK work and the index clamp.
const props = defineProps<{
  modelValue: number | null;
  photos: Photo[];
  remove?: (p: Photo, trash: boolean) => Promise<void>;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: number | null): void }>();

const { thumbUrl } = useThumbnails();
const { fetchFull, heicUrl, fullPhotoUrl } = useFullPhoto();
const { motionUrl } = useMotion();
const url = ref<string | null>(null);
const videoUrl = ref<string | null>(null);
const liveSrc = ref<string | null>(null);
const livePlaying = ref(true);
const liveLoading = ref(false); // motion clip downloading/decrypting → corner spinner
const liveFailed = ref(false); // true if the motion clip can't be decoded (e.g. HEVC) → keep still
const loading = ref(false);
const downloading = ref(false);
const removing = ref(false);
const zoomed = ref(false);

// window.confirm/alert are silent no-ops in Tauri's WKWebView (no JS dialog delegate — confirm
// returns falsy immediately), so confirmation is a two-step armed button: the first click arms
// it (the button shows "click again"), a second click within 4s executes. Errors show inline.
const armed = ref<'remove' | 'trash' | null>(null);
const removeError = ref(false);
let armTimer: ReturnType<typeof setTimeout> | null = null;

async function removePhoto(trash: boolean) {
  const p = current.value;
  if (!p || removing.value || !props.remove) return;
  const kind = trash ? 'trash' : 'remove';
  if (armTimer) clearTimeout(armTimer);
  if (armed.value !== kind) {
    armed.value = kind;
    armTimer = setTimeout(() => (armed.value = null), 4000);
    return;
  }
  armed.value = null;
  removing.value = true;
  removeError.value = false;
  try {
    await props.remove(p, trash);
  } catch (e) {
    console.warn('remove photo failed', e);
    removeError.value = true;
    setTimeout(() => (removeError.value = false), 4000);
  } finally {
    removing.value = false;
  }
}

function onLiveCanPlay(e: Event) { (e.target as HTMLVideoElement).play().catch(() => { /* ignore */ }); }

// Pre-size the still to the exact box the full-res upgrade will occupy: contain-fit into
// 92vw × 80vh depends only on the aspect ratio, known up front from EXIF (manifest `ar`) and
// corrected from the thumbnail's real pixels once it loads. The thumb upscales into that box,
// so the swap to full resolution happens in place — no layout jump. Every photo upgrades now
// (HEIC via decode, the rest via the original file), so every photo gets this.
const arMeasured = ref<number | null>(null);
function onStillLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  if (img.naturalWidth && img.naturalHeight) arMeasured.value = img.naturalWidth / img.naturalHeight;
}
const stillBox = computed(() => {
  if (!current.value || current.value.isVideo) return undefined;
  const ar = arMeasured.value ?? current.value.ar;
  if (!ar) return undefined;
  return { aspectRatio: `${ar}`, width: `min(92vw, calc(80vh * ${ar}))` };
});

// Click to zoom one step into the clicked point; while zoomed, the origin follows the cursor
// so moving the mouse pans around the image. Click again to zoom back out.
const zoomOrigin = ref('50% 50%');
function setZoomOrigin(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
  const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
  zoomOrigin.value = `${x}% ${y}%`;
}
function onZoomClick(e: MouseEvent) {
  if (zoomed.value) { zoomed.value = false; return; }
  setZoomOrigin(e);
  zoomed.value = true;
}
function onZoomMove(e: MouseEvent) {
  if (zoomed.value) setZoomOrigin(e);
}
function onZoomKey() {
  if (zoomed.value) { zoomed.value = false; return; }
  zoomOrigin.value = '50% 50%';
  zoomed.value = true;
}

async function toggleLive() {
  const p = current.value;
  if (!p?.motionUid) return;
  if (livePlaying.value) { livePlaying.value = false; return; }
  liveFailed.value = false;
  if (!liveSrc.value) {
    liveLoading.value = true;
    try { liveSrc.value = await motionUrl(p.motionUid); }
    finally { liveLoading.value = false; }
  }
  livePlaying.value = !!liveSrc.value;
}
const open = computed(() => props.modelValue !== null);
const current = computed(() => (props.modelValue == null ? null : props.photos[props.modelValue] ?? null));

// Warm the neighbours into cache so navigating feels instant: decrypt/decode ahead of the
// click. Runs after the current image so it never competes for its bandwidth. Videos are
// skipped (too large to prefetch); the immediate next HEIC is decoded ahead since it's slowest.
function preloadAround(i: number) {
  for (const j of [i + 1, i + 2, i - 1]) {
    const p = props.photos[j];
    if (!p || p.isVideo) continue;
    if (p.isHeic) { if (j === i + 1) heicUrl(p.nodeUid).catch(() => {}); }
    else thumbUrl(p.nodeUid).catch(() => {});
  }
}

async function show() {
  const p = current.value;
  url.value = null; videoUrl.value = null; liveSrc.value = null; livePlaying.value = false; liveLoading.value = false; liveFailed.value = false; zoomed.value = false; arMeasured.value = null; armed.value = null;
  if (!p) return;
  loading.value = true;
  if (p.isVideo) {
    try {
      const blob = await fetchFull(p.nodeUid);
      const src = await playableVideoUrl(blob); // fast-start .mov so Firefox can play it
      if (current.value?.nodeUid === p.nodeUid) videoUrl.value = src;
    } catch { /* ignore */ } finally {
      if (current.value?.nodeUid === p.nodeUid) loading.value = false;
    }
  } else if (p.isHeic) {
    // Show the decoded thumbnail first (already cached from the grid — instant, no new
    // download), then upgrade to the full-res decode in the background.
    const thumb = await thumbUrl(p.nodeUid).catch(() => null);
    if (current.value?.nodeUid === p.nodeUid && thumb) { url.value = thumb; loading.value = false; }
    try {
      const full = await heicUrl(p.nodeUid);
      if (current.value?.nodeUid === p.nodeUid) { url.value = full; loading.value = false; }
    } catch {
      if (current.value?.nodeUid === p.nodeUid) loading.value = false;
    }
  } else {
    // Same thumb-first → original upgrade as HEIC; the preview swaps for the full file in place.
    const thumb = await thumbUrl(p.nodeUid).catch(() => null);
    if (current.value?.nodeUid === p.nodeUid && thumb) { url.value = thumb; loading.value = false; }
    try {
      const full = await fullPhotoUrl(p.nodeUid);
      if (current.value?.nodeUid === p.nodeUid) { url.value = full; loading.value = false; }
    } catch {
      if (current.value?.nodeUid === p.nodeUid) loading.value = false;
    }
  }
  // Live Photo: auto-play its motion clip once the still is up.
  if (p.motionUid && !p.isVideo) {
    liveLoading.value = true;
    try {
      const src = await motionUrl(p.motionUid);
      if (current.value?.nodeUid === p.nodeUid) { liveSrc.value = src; livePlaying.value = !!src; }
    } catch { /* still photo stays up without motion */ } finally {
      if (current.value?.nodeUid === p.nodeUid) liveLoading.value = false;
    }
  }
  if (props.modelValue != null) preloadAround(props.modelValue);
}

async function download() {
  const p = current.value;
  if (!p || downloading.value) return;
  downloading.value = true;
  try {
    const blob = await fetchFull(p.nodeUid);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `waypoints-${p.id}.${p.isVideo ? 'mp4' : p.isHeic ? 'heic' : 'jpg'}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch { /* ignore */ } finally {
    downloading.value = false;
  }
}

function go(delta: number) {
  if (props.modelValue == null) return;
  const next = props.modelValue + delta;
  if (next >= 0 && next < props.photos.length) emit('update:modelValue', next);
}
function close() { emit('update:modelValue', null); }
function onKey(e: KeyboardEvent) {
  if (!open.value) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
}

// touch swipe (phones)
let touchX = 0;
function onTouchStart(e: TouchEvent) { touchX = e.changedTouches[0]?.clientX ?? 0; }
function onTouchEnd(e: TouchEvent) {
  const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX;
  if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
}

const dialogEl = ref<HTMLElement | null>(null);
let lastFocused: HTMLElement | null = null;

// Watch the resolved photo, not just the index: after a removal the index can stay the same
// while the photo at that position changes — the viewer still has to load the new one.
watch(current, show);
watch(open, (v) => {
  document.body.style.overflow = v ? 'hidden' : '';
  if (v) {
    lastFocused = document.activeElement as HTMLElement;
    nextTick(() => dialogEl.value?.focus());
  } else {
    lastFocused?.focus?.();
    lastFocused = null;
  }
});
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; });

function caption(p: Photo | null): string {
  return p?.takenAt ? new Date(p.takenAt).toLocaleString(locale.value) : '';
}
</script>

<template>
  <div
    v-if="open"
    ref="dialogEl"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    :aria-label="t('lightbox.viewer')"
    class="
      fixed inset-0 z-1000 grid place-items-center bg-black/92 outline-none
      select-none
    "
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <!-- Backdrop: a real button so clicking empty space closes, keyboard-accessible by nature. -->
    <button
      type="button"
      tabindex="-1"
      :aria-label="t('lightbox.closeViewer')"
      class="absolute inset-0 cursor-default"
      @click="close"
    />
    <!-- z-10: keep the controls above the photo — a zoomed image (scale 2.2) otherwise slides
         over these absolutely-positioned siblings and the caption line below it. -->
    <div
      class="absolute top-4 right-4 z-10 flex items-center gap-4 text-white/70"
    >
      <span
        v-if="removeError"
        class="text-sm text-red-400"
        role="alert"
      >{{ t('lightbox.removeFailed') }}</span>
      <button
        v-if="remove"
        class="
          flex items-center gap-1
          disabled:opacity-40
        "
        :class="armed === 'remove' ? 'text-accent' : 'hover:text-accent'"
        :disabled="removing"
        :aria-label="armed === 'remove' ? t('lightbox.confirmRemove') : t('lightbox.removeFromAlbum')"
        :title="armed === 'remove' ? t('lightbox.confirmRemove') : t('lightbox.removeFromAlbum')"
        @click="removePhoto(false)"
      >
        <IconRemove class="size-5" />
        <span
          v-if="armed === 'remove'"
          class="text-sm"
        >{{ t('lightbox.confirmClick') }}</span>
      </button>
      <button
        v-if="remove"
        class="
          flex items-center gap-1
          disabled:opacity-40
        "
        :class="armed === 'trash' ? 'text-red-400' : 'hover:text-red-400'"
        :disabled="removing"
        :aria-label="armed === 'trash' ? t('lightbox.confirmTrash') : t('lightbox.trash')"
        :title="armed === 'trash' ? t('lightbox.confirmTrash') : t('lightbox.trash')"
        @click="removePhoto(true)"
      >
        <IconTrash class="size-5" />
        <span
          v-if="armed === 'trash'"
          class="text-sm"
        >{{ t('lightbox.confirmClick') }}</span>
      </button>
      <button
        v-if="current?.motionUid && !current?.isVideo"
        :class="livePlaying ? 'text-accent' : 'hover:text-accent'"
        class="
          flex items-center gap-1 text-sm font-medium tracking-wide uppercase
        "
        :aria-label="livePlaying ? t('lightbox.showStill') : t('lightbox.playLive')"
        :title="t('lightbox.livePhoto')"
        @click="toggleLive"
      >
        <IconLivePhoto class="size-4" />
        {{ t('lightbox.live') }}
      </button>
      <button
        class="
          hover:text-accent
          disabled:opacity-40
        "
        :disabled="downloading"
        :aria-label="t('lightbox.download')"
        :title="downloading ? t('lightbox.downloading') : t('lightbox.downloadOriginal')"
        @click="download"
      >
        <IconDownload class="size-5" />
      </button>
      <button
        class="
          text-2xl leading-none
          hover:text-white
        "
        :aria-label="t('lightbox.close')"
        @click="close"
      >
        ✕
      </button>
    </div>

    <button
      v-if="modelValue! > 0"
      class="
        absolute left-3 z-10 px-2 text-4xl leading-none text-white/70
        hover:text-white
        sm:left-6
      "
      :aria-label="t('lightbox.previous')"
      @click.stop="go(-1)"
    >
      ‹
    </button>

    <div
      class="flex max-h-[88vh] max-w-[92vw] flex-col items-center gap-3"
      @click.stop
    >
      <!-- No <track>: no captions exist for personal clips (a src-less placeholder track is
           worse than none — spec lets pending text tracks hold readyState at 0). -->
      <!-- eslint-disable-next-line vuejs-accessibility/media-has-caption -->
      <video
        v-if="videoUrl"
        :src="videoUrl"
        controls
        autoplay
        :aria-label="t('lightbox.video')"
        class="max-h-[80vh] max-w-[92vw] rounded-sm"
      />
      <!-- Still is the base; the Live motion clip overlays it and only shows once it actually
           plays (iPhone clips are HEVC and often unplayable — the still stays put if so). -->
      <!-- Click to zoom one step in / out. A div (not a <button>): a button may not contain the
           Live <video>, and Firefox refuses to load a <video> nested in a <button>. -->
      <div
        v-else-if="url"
        role="button"
        tabindex="0"
        :aria-label="zoomed ? t('lightbox.zoomOut') : t('lightbox.zoomIn')"
        class="relative transition-transform duration-200"
        :class="zoomed ? 'scale-[2.2] cursor-zoom-out' : 'cursor-zoom-in'"
        :style="{ transformOrigin: zoomOrigin }"
        @click.stop="onZoomClick"
        @mousemove="onZoomMove"
        @keydown.enter.prevent="onZoomKey"
        @keydown.space.prevent="onZoomKey"
      >
        <img
          :src="url"
          :alt="caption(current) ? t('lightbox.photoTaken', { date: caption(current) }) : t('lightbox.photo')"
          :style="stillBox"
          class="block max-h-[80vh] max-w-[92vw] rounded-sm object-contain"
          @load="onStillLoad"
        >
        <video
          v-if="livePlaying && liveSrc && !liveFailed"
          :src="liveSrc"
          autoplay
          muted
          loop
          playsinline
          :aria-label="t('lightbox.liveMotion')"
          class="absolute inset-0 size-full rounded-sm object-contain"
          @canplay="onLiveCanPlay"
          @error="liveFailed = true"
        />
        <span
          v-if="liveLoading"
          role="status"
          :aria-label="t('lightbox.loadingLive')"
          class="
            pointer-events-none absolute top-2 right-2 grid place-items-center
            rounded-full bg-black/45 p-2
          "
        >
          <span
            class="
              size-4 animate-spin rounded-full border-2 border-white/25
              border-t-white
            "
            aria-hidden="true"
          />
        </span>
      </div>
      <div
        v-else
        class="flex flex-col items-center gap-4 py-20 text-white/70"
      >
        <span
          class="
            size-11 animate-spin rounded-full border-[3px] border-white/20
            border-t-accent
          "
          aria-hidden="true"
        />
        <span class="text-sm">{{ current?.isVideo ? t('lightbox.loadingVideo') : current?.isHeic ? t('lightbox.decodingHeic') : t('lightbox.decrypting') }}</span>
      </div>
      <!-- Hidden while zoomed: the enlarged image extends under this line, which otherwise
           paints on top of the photo. -->
      <div
        v-show="!zoomed"
        class="text-sm text-white/60 tabular-nums"
      >
        {{ (modelValue ?? 0) + 1 }} / {{ photos.length }}<span v-if="caption(current)"> · {{ caption(current) }}</span>
      </div>
    </div>

    <button
      v-if="modelValue! < photos.length - 1"
      class="
        absolute right-3 z-10 px-2 text-4xl leading-none text-white/70
        hover:text-white
        sm:right-6
      "
      :aria-label="t('lightbox.next')"
      @click.stop="go(1)"
    >
      ›
    </button>
  </div>
</template>
