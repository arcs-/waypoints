import { useProton } from '@/domain/proton/useProton';
import { downloadToBlob } from '@/domain/proton/download';
import { renderableHeic } from './heic';

// Full-resolution originals for the lightbox, cached at module level (like useThumbnails /
// useMotion) so already-downloaded photos survive the viewer closing and reopening.
const blobCache = new Map<string, Blob>();
const heicUrlCache = new Map<string, string>();
const fullUrlCache = new Map<string, string>();

export function useFullPhoto() {
  const { proton } = useProton();

  // The original file's bytes — also what "download" saves.
  async function fetchFull(nodeUid: string): Promise<Blob> {
    if (blobCache.has(nodeUid)) return blobCache.get(nodeUid)!;
    const sdk = proton.value?.photos;
    if (!sdk) throw new Error('Not signed in');
    const blob = await downloadToBlob(await sdk.getFileDownloader(nodeUid));
    blobCache.set(nodeUid, blob);
    return blob;
  }

  // HEIC original as a renderable URL. Native WebKit rendering keeps P3/HDR; the WASM decode
  // is the sRGB fallback (see media/heic.ts).
  async function heicUrl(nodeUid: string): Promise<string> {
    if (heicUrlCache.has(nodeUid)) return heicUrlCache.get(nodeUid)!;
    const url = URL.createObjectURL(await renderableHeic(await fetchFull(nodeUid), 0.92));
    heicUrlCache.set(nodeUid, url);
    return url;
  }

  // Full-resolution upgrade for photos the browser decodes natively (JPEG/PNG…): the Type2
  // preview is ~1920px, which goes soft on a Retina-sized stage and softer under click-to-zoom.
  async function fullPhotoUrl(nodeUid: string): Promise<string> {
    if (fullUrlCache.has(nodeUid)) return fullUrlCache.get(nodeUid)!;
    const url = URL.createObjectURL(await fetchFull(nodeUid));
    fullUrlCache.set(nodeUid, url);
    return url;
  }

  return { fetchFull, heicUrl, fullPhotoUrl };
}
