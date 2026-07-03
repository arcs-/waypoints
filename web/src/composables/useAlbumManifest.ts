import { ref, shallowRef } from 'vue';
import { useProton } from './useProton';
import { buildManifest } from '@/lib/buildManifest';
import { readAlbumFile, writeAlbumFile } from '@/lib/protonIndex';
import type { AlbumRef } from './useAlbums';
import type { StoredAlbum } from '@/lib/types';

// Source of truth + cache: one JSON per album in Proton /.memory-lane/<slug>.json.
// Reading it skips the expensive per-photo EXIF reads + reverse-geocoding.
const VERSION = 5; // bump to invalidate caches when the manifest shape changes
const session = new Map<string, StoredAlbum>(); // in-memory cache for this tab

const countPhotos = (a: StoredAlbum) => a.stops.reduce((n, s) => n + s.photos.length, 0);

export function useAlbumManifest() {
  const { proton } = useProton();
  const manifest = shallowRef<StoredAlbum | null>(null);
  const building = ref(false);
  const progress = ref(0);
  const total = ref(0);
  const error = ref<string | null>(null);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function ensure(album: AlbumRef, { rebuild = false } = {}) {
    error.value = null;
    if (!rebuild && session.has(album.uid)) { manifest.value = session.get(album.uid)!; return; }

    const p = proton.value;
    if (!p) { error.value = 'Not signed in'; return; }

    building.value = true; progress.value = 0; total.value = album.photoCount ?? 0;
    try {
      // 1) Try the Proton file (cache). Fresh if the album hasn't changed since.
      let stored: StoredAlbum | null = null;
      try { stored = await readAlbumFile(p.drive, album.slug); } catch { /* first run / offline */ }

      // Fresh only if the shape, the album's last-activity time AND its photo count all match.
      // (Photo count is the simple, robust signal that the album changed.)
      const countMatches = album.photoCount == null || (stored && countPhotos(stored) === album.photoCount);
      if (!rebuild && stored && stored.version === VERSION && stored.lastActivityTime === album.lastActivityTime && countMatches) {
        manifest.value = stored; session.set(album.uid, stored); return;
      }

      // 2) Rebuild (expensive). Preserve any titles/descriptions the user wrote (keyed by stop).
      const priorNotes = new Map((stored?.stops ?? []).map((s) => [s.key, s.description]));
      const priorTitles = new Map((stored?.stops ?? []).map((s) => [s.key, s.title]));
      const built = await buildManifest(p.photos, album, (d, t) => { progress.value = d; total.value = t; });
      for (const stop of built.stops) {
        stop.description = priorNotes.get(stop.key) ?? '';
        if (priorTitles.get(stop.key)) stop.title = priorTitles.get(stop.key);
      }

      const data: StoredAlbum = {
        ...built,
        version: VERSION,
        lastActivityTime: album.lastActivityTime,
        savedAt: new Date().toISOString(),
      };
      manifest.value = data; session.set(album.uid, data);

      // 3) Persist to Proton (don't block the UI if it fails).
      writeAlbumFile(p.drive, album.slug, data).catch((e) => console.warn('index write failed', e));
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      building.value = false;
    }
  }

  function persist(album: AlbumRef, m: StoredAlbum) {
    m.savedAt = new Date().toISOString();
    session.set(album.uid, m);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const p = proton.value;
      if (p) writeAlbumFile(p.drive, album.slug, m).catch((e) => console.warn('index write failed', e));
    }, 1200);
  }

  // Update a stop field and persist (debounced) to the same Proton file.
  function saveDescription(album: AlbumRef, key: string, text: string) {
    const stop = manifest.value?.stops.find((s) => s.key === key);
    if (!stop || !manifest.value) return;
    stop.description = text;
    persist(album, manifest.value);
  }
  function saveTitle(album: AlbumRef, key: string, text: string) {
    const stop = manifest.value?.stops.find((s) => s.key === key);
    if (!stop || !manifest.value) return;
    stop.title = text.trim() || undefined;
    persist(album, manifest.value);
  }

  return { manifest, building, progress, total, error, ensure, saveDescription, saveTitle };
}
