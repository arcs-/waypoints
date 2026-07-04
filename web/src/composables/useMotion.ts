import { useProton } from './useProton';
import { playableVideoUrl } from '@/lib/videoUrl';

// Downloads + decrypts a Live Photo's motion clip into a blob URL, cached by nodeUid.
// Bounded concurrency (clips are bigger than thumbnails).
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let active = 0;
const queue: Array<() => void> = [];
const MAX = 2;
const slot = () => (active < MAX ? (active++, Promise.resolve()) : new Promise<void>((r) => queue.push(() => { active++; r(); })));
const release = () => { active--; queue.shift()?.(); };

export function useMotion() {
  const { proton } = useProton();

  async function motionUrl(nodeUid: string): Promise<string | null> {
    if (cache.has(nodeUid)) return cache.get(nodeUid)!;
    if (inflight.has(nodeUid)) return inflight.get(nodeUid)!;
    const p = (async () => {
      await slot();
      try {
        const sdk = proton.value?.photos;
        if (!sdk) return null;
        const dl = await sdk.getFileDownloader(nodeUid);
        const chunks: Uint8Array[] = [];
        const sink = new WritableStream<Uint8Array>({ write(c) { chunks.push(c); } });
        await dl.downloadToStream(sink).completion();
        // .mov clips have moov at the end → fast-start so Firefox can play them (see videoUrl).
        const url = await playableVideoUrl(new Blob(chunks as BlobPart[]));
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

  return { motionUrl };
}
