<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useThumbnails } from '@/composables/useThumbnails';
import { useProton } from '@/composables/useProton';
import type { Photo } from '@/lib/types';

// index === null → closed. Reuses the in-browser thumbnail decryption + cache.
const props = defineProps<{ modelValue: number | null; photos: Photo[] }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: number | null): void }>();

const { thumbUrl } = useThumbnails();
const { proton } = useProton();
const url = ref<string | null>(null);
const videoUrl = ref<string | null>(null);
const loading = ref(false);
const downloading = ref(false);
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
  const { default: heic2any } = await import('heic2any'); // lazy: libheif WASM only when needed
  const out = await heic2any({ blob, toType: 'image/jpeg', quality: 0.9 });
  const jpeg = Array.isArray(out) ? out[0] : out;
  const u = URL.createObjectURL(jpeg);
  heicCache.set(nodeUid, u);
  return u;
}

async function show() {
  const p = current.value;
  url.value = null; videoUrl.value = null;
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
    const i = props.modelValue!;
    props.photos[i + 1] && !props.photos[i + 1].isVideo && thumbUrl(props.photos[i + 1].nodeUid);
    props.photos[i - 1] && !props.photos[i - 1].isVideo && thumbUrl(props.photos[i - 1].nodeUid);
  }
}

async function download() {
  const p = current.value;
  if (!p || downloading.value) return;
  downloading.value = true;
  try {
    const blob = await fetchFull(p.nodeUid);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `memory-lane-${p.id}.${p.isVideo ? 'mp4' : p.isHeic ? 'heic' : 'jpg'}`;
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
function onTouchStart(e: TouchEvent) { touchX = e.changedTouches[0].clientX; }
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchX;
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
    v-if="open" ref="dialogEl" tabindex="-1" role="dialog" aria-modal="true" aria-label="Photo viewer"
    class="fixed inset-0 z-[1000] bg-black/92 grid place-items-center select-none outline-none" @click.self="close"
    @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd"
  >
    <div class="absolute top-4 right-4 flex items-center gap-4 text-white/70">
      <button class="hover:text-accent disabled:opacity-40" :disabled="downloading" @click="download" aria-label="Download" :title="downloading ? 'Downloading…' : 'Download original'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>
      </button>
      <button class="hover:text-white text-2xl leading-none" @click="close" aria-label="Close">✕</button>
    </div>

    <button v-if="modelValue! > 0" class="absolute left-3 sm:left-6 text-white/70 hover:text-white text-4xl leading-none px-2" @click.stop="go(-1)" aria-label="Previous">‹</button>

    <div class="max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-3" @click.stop>
      <video v-if="videoUrl" :src="videoUrl" controls autoplay aria-label="Video" class="max-w-[92vw] max-h-[80vh] rounded" />
      <img v-else-if="url" :src="url" :alt="caption(current) ? `Photo taken ${caption(current)}` : 'Photo'" class="max-w-[92vw] max-h-[80vh] object-contain rounded" />
      <div v-else class="flex flex-col items-center gap-4 text-white/70 py-20">
        <span class="w-11 h-11 rounded-full border-[3px] border-white/20 border-t-accent animate-spin" aria-hidden="true"></span>
        <span class="text-sm">{{ current?.isVideo ? 'Loading video…' : current?.isHeic ? 'Decoding HEIC…' : 'Decrypting…' }}</span>
      </div>
      <div class="text-white/60 text-xs tabular-nums">
        {{ (modelValue ?? 0) + 1 }} / {{ photos.length }}<span v-if="caption(current)"> · {{ caption(current) }}</span>
      </div>
    </div>

    <button v-if="modelValue! < photos.length - 1" class="absolute right-3 sm:right-6 text-white/70 hover:text-white text-4xl leading-none px-2" @click.stop="go(1)" aria-label="Next">›</button>
  </div>
</template>
