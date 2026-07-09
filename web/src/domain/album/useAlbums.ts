import { ref, shallowRef, watch } from 'vue';
import type { Proton } from '@/domain/proton/client';
import { useProton } from '@/domain/proton/useProton';
import { nodeName } from '@/domain/proton/nodeName';
import { slugify } from '@/shared/lib/slug';
import { firstDateKey } from '@/shared/lib/storageKeys';

type Sdk = Proton['photos'];

export interface AlbumRef {
  uid: string;
  name: string;
  slug: string;
  coverNodeUid: string | null;
  photoCount: number | null;
  lastActivityTime: number | null;
  date: number | null; // capture time of the FIRST image in the album
}

const albums = shallowRef<AlbumRef[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let loaded = false;

const name = (node: unknown) => nodeName(node) || 'Untitled';
function sortByDate(list: AlbumRef[]) {
  list.sort((a, b) => (b.date ?? b.lastActivityTime ?? 0) - (a.date ?? a.lastActivityTime ?? 0));
}

// First-image date via a cheap metadata scan of the album (no downloads), cached in localStorage.
async function firstImageDate(sdk: Sdk, a: AlbumRef): Promise<number | null> {
  try {
    const raw = localStorage.getItem(firstDateKey(a.uid));
    if (raw) {
      const c = JSON.parse(raw);
      if (c.lastActivityTime === a.lastActivityTime) return c.date;
    }
  } catch { /* ignore */ }
  let min = Infinity;
  for await (const it of sdk.iterateAlbum(a.uid)) {
    const t = +it.captureTime;
    if (t < min) min = t;
  }
  const date = Number.isFinite(min) ? min : a.lastActivityTime;
  try { localStorage.setItem(firstDateKey(a.uid), JSON.stringify({ lastActivityTime: a.lastActivityTime, date })); } catch { /* quota */ }
  return date;
}

async function load(sdk: Sdk) {
  if (loaded || loading.value) return;
  loading.value = true; error.value = null;
  try {
    const out: AlbumRef[] = [];
    for await (const a of sdk.iterateAlbums()) {
      out.push({
        uid: a.uid,
        name: name(a),
        slug: slugify(name(a)),
        coverNodeUid: a.album?.coverPhotoNodeUid ?? null,
        photoCount: a.album?.photoCount ?? null,
        lastActivityTime: a.album?.lastActivityTime ? +a.album.lastActivityTime : null,
        date: null,
      });
    }
    sortByDate(out); // by lastActivityTime for now
    albums.value = out;
    loaded = true;

    // Resolve real first-image dates in the background, then re-sort. One album failing
    // (network hiccup) must not kill the scan — it keeps its lastActivityTime fallback.
    (async () => {
      for (const a of out) {
        try { a.date = await firstImageDate(sdk, a); } catch { /* keep null */ }
      }
      sortByDate(out);
      albums.value = [...out];
    })();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

export function useAlbums() {
  const { proton, loggedIn } = useProton();
  if (loggedIn.value && proton.value) load(proton.value.photos);
  watch([loggedIn, proton], ([li, p]) => { if (li && p) load(p.photos); });

  const bySlug = (slug: string) => albums.value.find((a) => a.slug === slug) ?? null;
  return { albums, loading, error, bySlug };
}
