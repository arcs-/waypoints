import { ThumbnailType } from '@protontech/drive-sdk';
import { renderableHeic } from '@/lib/heic';
import { useProton } from './useProton';

// Decrypts album thumbnails in-browser (via the SDK) into blob URLs, cached by nodeUid.
// Bounded concurrency so we don't hammer Proton / trip rate limits.
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let active = 0;
const queue: Array<() => void> = [];
const MAX_CONCURRENT = 4;

function slot(): Promise<void> {
  if (active < MAX_CONCURRENT) { active++; return Promise.resolve(); }
  return new Promise((r) => queue.push(() => { active++; r(); }));
}
function release() { active--; queue.shift()?.(); }

// Proton returns HEIC photos' thumbnails still HEIC-encoded — detect the ISOBMFF 'ftyp' +
// HEIC brand and hand them to renderableHeic (native <img> where the engine can, WASM→JPEG
// where it can't). (AVIF renders natively everywhere we run, so skip it.)
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'heif', 'hevc', 'hevx', 'mif1', 'msf1', 'miff']);
function isHeicBytes(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const at = (o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
  return at(4) === 'ftyp' && HEIC_BRANDS.has(at(8).toLowerCase());
}

async function toBlob(bytes: Uint8Array): Promise<Blob> {
  const blob = new Blob([bytes as BlobPart]);
  return isHeicBytes(bytes) ? renderableHeic(blob, 0.85) : blob;
}

export function useThumbnails() {
  const { proton } = useProton();

  async function thumbUrl(nodeUid: string): Promise<string | null> {
    if (cache.has(nodeUid)) return cache.get(nodeUid)!;
    if (inflight.has(nodeUid)) return inflight.get(nodeUid)!;

    const p = (async () => {
      await slot();
      try {
        const sdk = proton.value?.photos;
        if (!sdk) return null;
        const fetchType = async (type: ThumbnailType) => {
          for await (const res of sdk.iterateThumbnails([nodeUid], type)) {
            if (res.ok) return res.thumbnail;
          }
          return null;
        };
        // Type2 is the larger preview; fall back to Type1 (videos often only have the small one).
        const bytes = (await fetchType(ThumbnailType.Type2)) ?? (await fetchType(ThumbnailType.Type1));
        if (!bytes) return null;
        const url = URL.createObjectURL(await toBlob(bytes));
        cache.set(nodeUid, url);
        return url;
      } finally {
        release();
        inflight.delete(nodeUid);
      }
    })();

    inflight.set(nodeUid, p);
    return p;
  }

  return { thumbUrl };
}
