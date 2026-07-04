<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useThumbnails } from '@/composables/useThumbnails';
import { useProton } from '@/composables/useProton';
import { useI18n } from 'vue-i18n';
import { useMotion } from '@/composables/useMotion';
import { playableVideoUrl } from '@/lib/videoUrl';
import IconLivePhoto from '@/components/icons/IconLivePhoto.vue';
import IconDownload from '@/components/icons/IconDownload.vue';
import type { Photo } from '@/lib/types';

const { t, locale } = useI18n();

// index === null → closed. Reuses the in-browser thumbnail decryption + cache.
const props = defineProps<{ modelValue: number | null; photos: Photo[] }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: number | null): void }>();

const { thumbUrl } = useThumbnails();
const { proton } = useProton();
const { motionUrl } = useMotion();
const url = ref<string | null>(null);
const videoUrl = ref<string | null>(null);
const liveSrc = ref<string | null>(null);
const livePlaying = ref(true);
const liveFailed = ref(false); // true if the motion clip can't be decoded (e.g. HEVC) → keep still
const loading = ref(false);
const downloading = ref(false);
const zoomed = ref(false);

function vlog(tag: string, e: Event) {
  const v = e.target as HTMLVideoElement;
  console.info(`[wp] live <${tag}> rs=${v.readyState} err=${v.error?.code ?? '-'} ${v.videoWidth}x${v.videoHeight} net=${v.networkState}`);
}
function onLiveCanPlay(e: Event) { vlog('canplay', e); (e.target as HTMLVideoElement).play().catch(() => { /* ignore */ }); }
function onLiveError(e: Event) { vlog('error', e); liveFailed.value = true; }

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

async function toggleLive() {
  const p = current.value;
  if (!p?.motionUid) return;
  if (livePlaying.value) { livePlaying.value = false; return; }
  liveFailed.value = false;
  if (!liveSrc.value) liveSrc.value = await motionUrl(p.motionUid);
  livePlaying.value = !!liveSrc.value;
}
const open = computed(() => props.modelValue !== null);
const current = computed(() => (props.modelValue == null ? null : props.photos[props.modelValue] ?? null));

const fullCache = new Map<string, Blob>();
async function fetchFull(nodeUid: string): Promise<Blob> {
  if (fullCache.has(nodeUid)) return fullCache.get(nodeUid)!;
  const sdk = proton.value?.photos;
  if (!sdk) throw new Error('Not signed in');
  const dl = await sdk.getFileDownloader(nodeUid);
  const chunks: Uint8Array[] = [];
  const sink = new WritableStream<Uint8Array>({ write(c) { chunks.push(c); } });
  await dl.downloadToStream(sink).completion();
  const blob = new Blob(chunks as BlobPart[]);
  fullCache.set(nodeUid, blob);
  return blob;
}

const heicCache = new Map<string, string>();
async function heicUrl(nodeUid: string): Promise<string> {
  if (heicCache.has(nodeUid)) return heicCache.get(nodeUid)!;
  const blob = await fetchFull(nodeUid);
  // heic-to uses a modern libheif that assembles iPhone's tiled/grid HEIC to full resolution.
  const { heicTo } = await import('heic-to'); // lazy: WASM only when needed
  const jpeg = await heicTo({ blob, type: 'image/jpeg', quality: 0.92 });
  const u = URL.createObjectURL(jpeg);
  heicCache.set(nodeUid, u);
  return u;
}

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
  url.value = null; videoUrl.value = null; liveSrc.value = null; livePlaying.value = false; liveFailed.value = false; zoomed.value = false;
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
    const thumb = await thumbUrl(p.nodeUid);
    if (current.value?.nodeUid === p.nodeUid && thumb) { url.value = thumb; loading.value = false; }
    try {
      const full = await heicUrl(p.nodeUid);
      if (current.value?.nodeUid === p.nodeUid) { url.value = full; loading.value = false; }
    } catch {
      if (current.value?.nodeUid === p.nodeUid) loading.value = false;
    }
  } else {
    const u = await thumbUrl(p.nodeUid);
    if (current.value?.nodeUid === p.nodeUid) { url.value = u; loading.value = false; }
  }
  // Live Photo: auto-play its motion clip once the still is up.
  if (p.motionUid && !p.isVideo) {
    const src = await motionUrl(p.motionUid);
    if (current.value?.nodeUid === p.nodeUid) { liveSrc.value = src; livePlaying.value = !!src; }
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

watch(() => props.modelValue, show);
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
    <div class="absolute top-4 right-4 flex items-center gap-4 text-white/70">
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
        absolute left-3 px-2 text-4xl leading-none text-white/70
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
      <video
        v-if="videoUrl"
        :src="videoUrl"
        controls
        autoplay
        :aria-label="t('lightbox.video')"
        class="max-h-[80vh] max-w-[92vw] rounded-sm"
      >
        <track kind="captions">
      </video>
      <!-- Still is the base; the Live motion clip overlays it and only shows once it actually
           plays (iPhone clips are HEVC and often unplayable — the still stays put if so). -->
      <!-- Click to zoom one step in / out. -->
      <button
        v-else-if="url"
        type="button"
        :aria-label="zoomed ? t('lightbox.zoomOut') : t('lightbox.zoomIn')"
        class="
          relative border-0 bg-transparent p-0 transition-transform duration-200
        "
        :class="zoomed ? 'scale-[2.2] cursor-zoom-out' : 'cursor-zoom-in'"
        :style="{ transformOrigin: zoomOrigin }"
        @click.stop="onZoomClick"
        @mousemove="onZoomMove"
      >
        <img
          :src="url"
          :alt="caption(current) ? t('lightbox.photoTaken', { date: caption(current) }) : t('lightbox.photo')"
          class="block max-h-[80vh] max-w-[92vw] rounded-sm object-contain"
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
          @loadedmetadata="vlog('loadedmetadata', $event)"
          @canplay="onLiveCanPlay"
          @playing="vlog('playing', $event)"
          @stalled="vlog('stalled', $event)"
          @suspend="vlog('suspend', $event)"
          @error="onLiveError"
        >
          <track kind="captions">
        </video>
      </button>
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
      <div class="text-sm text-white/60 tabular-nums">
        {{ (modelValue ?? 0) + 1 }} / {{ photos.length }}<span v-if="caption(current)"> · {{ caption(current) }}</span>
      </div>
    </div>

    <button
      v-if="modelValue! < photos.length - 1"
      class="
        absolute right-3 px-2 text-4xl leading-none text-white/70
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
