import { ThumbnailType } from '@protontech/drive-sdk';
import { renderableHeic } from './heic';
import { looksLikeHeic } from './isobmff';
import { useProton } from '@/domain/proton/useProton';
import { semaphore } from '@/shared/lib/semaphore';

// Decrypts album thumbnails in-browser (via the SDK) into blob URLs, cached by nodeUid.
// Bounded concurrency so we don't hammer Proton / trip rate limits.
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const sem = semaphore(4);

// Proton returns HEIC photos' thumbnails still HEIC-encoded — hand those to renderableHeic
// (native <img> where the engine can, WASM→JPEG where it can't).
async function toBlob(bytes: Uint8Array): Promise<Blob> {
  const blob = new Blob([bytes as BlobPart]);
  return looksLikeHeic(bytes) ? renderableHeic(blob, 0.85) : blob;
}

export function useThumbnails() {
  const { proton } = useProton();

  async function thumbUrl(nodeUid: string): Promise<string | null> {
    if (cache.has(nodeUid)) return cache.get(nodeUid)!;
    if (inflight.has(nodeUid)) return inflight.get(nodeUid)!;

    const p = sem.run(async () => {
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
        inflight.delete(nodeUid);
      }
    });

    inflight.set(nodeUid, p);
    return p;
  }

  return { thumbUrl };
}
