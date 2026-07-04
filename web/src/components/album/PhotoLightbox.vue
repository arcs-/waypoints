<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useThumbnails } from '@/composables/useThumbnails';
import { useProton } from '@/composables/useProton';
import { useMotion } from '@/composables/useMotion';
import IconLivePhoto from '@/components/icons/IconLivePhoto.vue';
import IconDownload from '@/components/icons/IconDownload.vue';
import type { Photo } from '@/lib/types';

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
const loading = ref(false);
const downloading = ref(false);

async function toggleLive() {
  const p = current.value;
  if (!p?.motionUid) return;
  if (livePlaying.value) { livePlaying.value = false; return; }
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
  url.value = null; videoUrl.value = null; liveSrc.value = null; livePlaying.value = false;
  if (!p) return;
  loading.value = true;
  if (p.isVideo) {
    try {
      const blob = await fetchFull(p.nodeUid);
      if (current.value?.nodeUid === p.nodeUid) videoUrl.value = URL.createObjectURL(blob);
    } catch { /* ignore */ } finally {
      if (current.value?.nodeUid === p.nodeUid) loading.value = false;
    }
  } else if (p.isHeic) {
    // Browsers can't render HEIC — decode the full original to JPEG for a proper preview.
    try {
      const u = await heicUrl(p.nodeUid);
      if (current.value?.nodeUid === p.nodeUid) { url.value = u; loading.value = false; }
    } catch {
      // fall back to the (small) SDK thumbnail if decoding fails
      const u = await thumbUrl(p.nodeUid);
      if (current.value?.nodeUid === p.nodeUid) { url.value = u; loading.value = false; }
    }
  } else {
    const u = await thumbUrl(p.nodeUid);
    if (current.value?.nodeUid === p.nodeUid) { url.value = u; loading.value = false; }
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
  return p?.takenAt ? new Date(p.takenAt).toLocaleString() : '';
}
</script>

<template>
  <div
    v-if="open"
    ref="dialogEl"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label="Photo viewer"
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
      aria-label="Close photo viewer"
      class="absolute inset-0 cursor-default"
      @click="close"
    />
    <div class="absolute top-4 right-4 flex items-center gap-4 text-white/70">
      <button
        v-if="current?.motionUid && !current?.isVideo"
        :class="livePlaying ? 'text-accent' : 'hover:text-accent'"
        class="
          flex items-center gap-1 text-xs font-bold tracking-wide uppercase
        "
        :aria-label="livePlaying ? 'Show still' : 'Play Live Photo motion'"
        title="Live Photo"
        @click="toggleLive"
      >
        <IconLivePhoto class="size-4" />
        Live
      </button>
      <button
        class="
          hover:text-accent
          disabled:opacity-40
        "
        :disabled="downloading"
        aria-label="Download"
        :title="downloading ? 'Downloading…' : 'Download original'"
        @click="download"
      >
        <IconDownload class="size-5" />
      </button>
      <button
        class="
          text-2xl leading-none
          hover:text-white
        "
        aria-label="Close"
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
      aria-label="Previous"
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
        aria-label="Video"
        class="max-h-[80vh] max-w-[92vw] rounded-sm"
      >
        <track kind="captions">
      </video>
      <video
        v-else-if="livePlaying && liveSrc"
        :src="liveSrc"
        autoplay
        muted
        loop
        playsinline
        aria-label="Live Photo motion"
        class="max-h-[80vh] max-w-[92vw] rounded-sm"
      >
        <track kind="captions">
      </video>
      <img
        v-else-if="url"
        :src="url"
        :alt="caption(current) ? `Photo taken ${caption(current)}` : 'Photo'"
        class="max-h-[80vh] max-w-[92vw] rounded-sm object-contain"
      >
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
        <span class="text-sm">{{ current?.isVideo ? 'Loading video…' : current?.isHeic ? 'Decoding HEIC…' : 'Decrypting…' }}</span>
      </div>
      <div class="text-xs text-white/60 tabular-nums">
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
      aria-label="Next"
      @click.stop="go(1)"
    >
      ›
    </button>
  </div>
</template>
