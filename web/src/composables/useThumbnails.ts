import { ThumbnailType } from '@protontech/drive-sdk';
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
        const url = URL.createObjectURL(new Blob([bytes]));
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
