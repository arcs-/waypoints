import exifr from 'exifr';
import { PhotoTag } from '@protontech/drive-sdk';
import type { Proton } from '@/domain/proton/client';
import { looksLikeHeic, looksLikeVideo } from '@/domain/media/isobmff';
import { haversineM } from '@/shared/lib/geo';
import { semaphore } from '@/shared/lib/semaphore';
import { reverseGeocode } from './geocode';
import type { Manifest, Photo, Stop } from './types';

const HEAD_BYTES = 256 * 1024; // EXIF (incl. GPS) lives at the head of the file
const CONCURRENCY = 4; // be a good citizen re: rate limits
const STOP_RADIUS_M = 500; // start a new stop only after moving this far (meters) from the current centroid

type Sdk = Proton['photos'];
type AlbumRef = { uid: string; name: string };

// Fill ungeotagged photos by interpolating between nearest real fixes in time.
function inferGeoByTime(photos: Photo[]): void {
  const t = (p: Photo) => (p.takenAt ? Date.parse(p.takenAt) : NaN);
  const fixed = photos.filter((p) => p.lat != null);
  if (!fixed.length) return;
  for (const p of photos) {
    if (p.lat != null) continue;
    const tp = t(p);
    let prev: Photo | null = null;
    let next: Photo | null = null;
    for (const f of fixed) {
      if (t(f) <= tp) prev = f;
      else { next = f; break; }
    }
    if (prev && next) {
      const f = (tp - t(prev)) / (t(next) - t(prev) || 1);
      p.lat = prev.lat! + f * (next.lat! - prev.lat!);
      p.lng = prev.lng! + f * (next.lng! - prev.lng!);
    } else {
      const n = (prev ?? next)!;
      p.lat = n.lat; p.lng = n.lng;
    }
    p.approx = true;
  }
}

export async function buildManifest(
  sdk: Sdk,
  album: AlbumRef,
  locale: string, // stop places are geocoded in this language and cached in the manifest
  onProgress?: (done: number, total: number) => void,
): Promise<Manifest> {
  const items: { nodeUid: string; captureTime: Date }[] = [];
  for await (const it of sdk.iterateAlbum(album.uid)) items.push(it);
  items.sort((a, b) => +a.captureTime - +b.captureTime);

  const photos: Photo[] = new Array(items.length);
  let done = 0;
  const sem = semaphore(CONCURRENCY);
  await Promise.all(items.map((it, i) => sem.run(async () => {
    let lat: number | null = null, lng: number | null = null, takenAt: string | null = null;
    let ar = 1.5; // default 3:2 landscape if EXIF dims are missing
    let isVideo = false, isHeic = false, motionUid: string | undefined;

    // Live Photo? The still's node lists a related motion-video node.
    try {
      const node = await sdk.getNode(it.nodeUid);
      const tags: number[] = node?.photo?.tags ?? [];
      const related: string[] = node?.photo?.relatedPhotoNodeUids ?? [];
      if (related.length && (tags.includes(PhotoTag.LivePhotos) || tags.includes(PhotoTag.MotionPhotos))) {
        motionUid = related[0];
      }
    } catch { /* ignore */ }

    const dl = await sdk.getFileDownloader(it.nodeUid);
    const stream = dl.getSeekableStream();
    try {
      const { value } = await stream.read(HEAD_BYTES);
      isVideo = looksLikeVideo(value);
      isHeic = looksLikeHeic(value);
      const gps = await exifr.gps(value).catch(() => null);
      const meta = await exifr.parse(value, ['DateTimeOriginal', 'ExifImageWidth', 'ExifImageHeight', 'Orientation']).catch(() => null);
      lat = gps?.latitude ?? null; lng = gps?.longitude ?? null;
      takenAt = meta?.DateTimeOriginal?.toISOString?.() ?? null;
      let w = meta?.ExifImageWidth, h = meta?.ExifImageHeight;
      if (w && h) {
        if ([5, 6, 7, 8].includes(meta?.Orientation)) [w, h] = [h, w]; // rotated
        ar = w / h;
      }
    } catch { /* leave defaults */ } finally {
      // CRITICAL: release the download slot. The SDK caps concurrent downloads at 5; the
      // seekable stream holds a slot until cancelled, so without this it stalls after 5.
      try { await (stream as { reader?: { cancel(): Promise<unknown> } }).reader?.cancel(); } catch { /* ignore */ }
    }
    photos[i] = {
      id: String(i).padStart(4, '0'),
      nodeUid: it.nodeUid,
      takenAt: takenAt ?? it.captureTime.toISOString(),
      lat, lng, approx: false, ar, isVideo, isHeic, motionUid,
    };
    onProgress?.(++done, items.length);
  })));

  inferGeoByTime(photos);

  // Cluster consecutive photos by location into "stops" (a new stop when you move > STOP_RADIUS_M
  // from the running centroid). Photos are already time-ordered.
  const stops: Stop[] = [];
  let cur: Stop | null = null;
  let sumLat = 0, sumLng = 0, n = 0;
  const openStop = (p: Photo): Stop => {
    const s: Stop = { key: p.nodeUid, place: null, lat: p.lat, lng: p.lng, startTime: p.takenAt, endTime: p.takenAt, description: '', photos: [p] };
    sumLat = p.lat ?? 0; sumLng = p.lng ?? 0; n = p.lat != null ? 1 : 0;
    stops.push(s);
    return s;
  };
  for (const p of photos) {
    if (!cur) { cur = openStop(p); continue; }
    const moved = p.lat != null && n > 0 && haversineM(p.lat, p.lng!, sumLat / n, sumLng / n) > STOP_RADIUS_M;
    if (moved) { cur = openStop(p); continue; }
    cur.photos.push(p);
    cur.endTime = p.takenAt;
    if (p.lat != null) { sumLat += p.lat; sumLng += p.lng!; n++; cur.lat = sumLat / n; cur.lng = sumLng / n; }
  }

  // Reverse-geocode each stop centroid once.
  for (const stop of stops) {
    if (stop.lat != null) stop.place = await reverseGeocode(stop.lat, stop.lng!, locale);
  }

  const route = stops.filter((s) => s.lat != null).map((s) => [s.lat!, s.lng!] as [number, number]);
  const geoPts = photos.filter((p) => p.lat != null);
  const bounds = geoPts.length
    ? ([[Math.min(...geoPts.map((p) => p.lat!)), Math.min(...geoPts.map((p) => p.lng!))],
       [Math.max(...geoPts.map((p) => p.lat!)), Math.max(...geoPts.map((p) => p.lng!))]] as [[number, number], [number, number]])
    : null;

  return {
    title: album.name,
    albumUid: album.uid,
    coverNodeUid: photos[0]?.nodeUid ?? null,
    bounds,
    route,
    stops,
  };
}
