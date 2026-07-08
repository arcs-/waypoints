import exifr from 'exifr';
import { PhotoTag } from '@protontech/drive-sdk';
import type { Proton } from '@/proton/client';
import { reverseGeocode } from './geocode';
import type { Manifest, Photo, Stop } from './types';

const HEAD_BYTES = 256 * 1024; // EXIF (incl. GPS) lives at the head of the file
const CONCURRENCY = 4; // be a good citizen re: rate limits
const STOP_RADIUS_M = 500; // start a new stop only after moving this far (meters) from the current centroid

// MP4/MOV, HEIC/HEIF and AVIF all share the ISOBMFF 'ftyp' container; classify by major brand.
// Only explicit image brands are treated as images; anything else with ftyp is video
// (e.g. hev1/hvc1/qt/isom/mp4x — HEVC video shares the codec with HEIC but isn't an image).
const IMAGE_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'heif', 'hevc', 'hevx', 'mif1', 'msf1', 'miff', 'avif', 'avis']);
function ftypBrand(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null; // bounds-checked: max index read below is 11
  const at = (o: number) => String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
  return at(4) === 'ftyp' ? at(8).toLowerCase() : null;
}
function looksLikeVideo(bytes: Uint8Array): boolean {
  const brand = ftypBrand(bytes);
  return !!brand && !IMAGE_BRANDS.has(brand);
}
function looksLikeHeic(bytes: Uint8Array): boolean {
  const brand = ftypBrand(bytes);
  return !!brand && IMAGE_BRANDS.has(brand) && brand !== 'avif' && brand !== 'avis'; // AVIF renders natively
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

type Sdk = Proton['photos'];
type AlbumRef = { uid: string; name: string };

async function mapLimit<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!, idx);
    }
  });
  await Promise.all(workers);
}

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
  onProgress?: (done: number, total: number) => void,
): Promise<Manifest> {
  const items: { nodeUid: string; captureTime: Date }[] = [];
  for await (const it of sdk.iterateAlbum(album.uid)) items.push(it);
  items.sort((a, b) => +a.captureTime - +b.captureTime);

  const photos: Photo[] = new Array(items.length);
  let done = 0;
  await mapLimit(items, CONCURRENCY, async (it, i) => {
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
  });

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
    const moved = p.lat != null && n > 0 && haversine(p.lat, p.lng!, sumLat / n, sumLng / n) > STOP_RADIUS_M;
    if (moved) { cur = openStop(p); continue; }
    cur.photos.push(p);
    cur.endTime = p.takenAt;
    if (p.lat != null) { sumLat += p.lat; sumLng += p.lng!; n++; cur.lat = sumLat / n; cur.lng = sumLng / n; }
  }

  // Reverse-geocode each stop centroid once.
  for (const stop of stops) {
    if (stop.lat != null) stop.place = await reverseGeocode(stop.lat, stop.lng!);
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
