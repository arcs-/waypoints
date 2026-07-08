import { ref, shallowRef } from 'vue';
import { useProton } from './useProton';
import { buildManifest } from '@/lib/buildManifest';
import { readAlbumFile, writeAlbumFile } from '@/lib/protonIndex';
import type { AlbumRef } from './useAlbums';
import type { Photo, StoredAlbum } from '@/lib/types';

// Source of truth + cache: one JSON per album in Proton /.waypoints/<slug>.json.
// Reading it skips the expensive per-photo EXIF reads + reverse-geocoding.
const VERSION = 9; // bump to invalidate caches when the manifest shape changes
const session = new Map<string, StoredAlbum>(); // in-memory cache for this tab

const countPhotos = (a: StoredAlbum) => a.stops.reduce((n, s) => n + s.photos.length, 0);

export function useAlbumManifest() {
  const { proton } = useProton();
  const manifest = shallowRef<StoredAlbum | null>(null);
  const loading = ref(false); // ensure() in flight — includes the quick cache-file probe
  const building = ref(false); // expensive per-photo rebuild only (drives the N/M progress UI)
  const progress = ref(0);
  const total = ref(0);
  const error = ref<string | null>(null);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function ensure(album: AlbumRef, { rebuild = false } = {}) {
    error.value = null;
    if (!rebuild && session.has(album.uid)) { manifest.value = session.get(album.uid)!; return; }

    const p = proton.value;
    if (!p) { error.value = 'Not signed in'; return; }

    loading.value = true;
    try {
      // 1) Try the Proton file (cache). Fresh if the album hasn't changed since. Usually a hit,
      // so only `loading` (neutral spinner) is up — the 0/N progress UI would be a lie here.
      let stored: StoredAlbum | null = null;
      try { stored = await readAlbumFile(p.drive, album.slug); } catch { /* first run / offline */ }

      // Fresh only if the shape, the album's last-activity time AND its photo count all match.
      // (Photo count is the simple, robust signal that the album changed.)
      const countMatches = album.photoCount == null || (stored && countPhotos(stored) === album.photoCount);
      if (!rebuild && stored && stored.version === VERSION && stored.lastActivityTime === album.lastActivityTime && countMatches) {
        manifest.value = stored; session.set(album.uid, stored); return;
      }

      // 2) Rebuild (expensive). Now the per-photo progress is real — switch on the N/M UI.
      // Preserve any titles/descriptions the user wrote (keyed by stop).
      building.value = true; progress.value = 0; total.value = album.photoCount ?? 0;
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
      loading.value = false;
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

  // Remove a photo from the album on Proton (and optionally trash the file), then mirror the
  // change into the manifest. The Live Photo motion node rides along but is best-effort: it may
  // not be an album member itself, so only the main photo's result is checked.
  async function removePhoto(album: AlbumRef, photo: Photo, trash: boolean) {
    const p = proton.value;
    const m = manifest.value;
    if (!p || !m) throw new Error('Not signed in');

    const uids = [photo.nodeUid, ...(photo.motionUid ? [photo.motionUid] : [])];
    for await (const r of p.photos.removePhotosFromAlbum(album.uid, uids)) {
      if (!r.ok && r.uid === photo.nodeUid) throw r.error;
    }
    if (trash) {
      for await (const r of p.photos.trashNodes(uids)) {
        if (!r.ok && r.uid === photo.nodeUid) throw r.error;
      }
    }

    // Replace (don't mutate) — manifest is a shallowRef, the feed re-renders on the new object.
    const stops = m.stops
      .map((s) => ({ ...s, photos: s.photos.filter((x) => x.nodeUid !== photo.nodeUid) }))
      .filter((s) => s.photos.length > 0);
    const route = stops.filter((s) => s.lat != null).map((s) => [s.lat!, s.lng!] as [number, number]);
    const next: StoredAlbum = { ...m, stops, route };
    manifest.value = next;
    // Keep the freshness signal consistent so the next visit doesn't force a full rebuild
    // over a count mismatch (Proton's bumped lastActivityTime may still trigger one).
    if (album.photoCount != null) album.photoCount = countPhotos(next);
    persist(album, next);
  }

  return { manifest, loading, building, progress, total, error, ensure, saveDescription, saveTitle, removePhoto };
}
