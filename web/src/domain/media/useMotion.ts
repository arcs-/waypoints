import { useProton } from '@/domain/proton/useProton';
import { downloadToBlob } from '@/domain/proton/download';
import { playableVideoUrl } from './videoUrl';
import { semaphore } from '@/shared/lib/semaphore';

// Downloads + decrypts a Live Photo's motion clip into a blob URL, cached by nodeUid.
// Bounded concurrency (clips are bigger than thumbnails).
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const sem = semaphore(2);

export function useMotion() {
  const { proton } = useProton();

  async function motionUrl(nodeUid: string): Promise<string | null> {
    if (cache.has(nodeUid)) return cache.get(nodeUid)!;
    if (inflight.has(nodeUid)) return inflight.get(nodeUid)!;
    const p = sem.run(async () => {
      try {
        const sdk = proton.value?.photos;
        if (!sdk) return null;
        const blob = await downloadToBlob(await sdk.getFileDownloader(nodeUid));
        // .mov clips have moov at the end → fast-start so Firefox can play them (see videoUrl).
        const url = await playableVideoUrl(blob);
        cache.set(nodeUid, url);
        return url;
      } finally {
        inflight.delete(nodeUid);
      }
    });
    inflight.set(nodeUid, p);
    return p;
  }

  return { motionUrl };
}
