// MP4/MOV, HEIC/HEIF and AVIF all share the ISOBMFF 'ftyp' container; classify by major
// brand. Used on file heads (manifest build) and on Proton thumbnails, which come back
// still HEIC-encoded for HEIC photos.

// Only explicit image brands are treated as images; anything else with ftyp is video
// (e.g. hev1/hvc1/qt/isom/mp4x — HEVC video shares the codec with HEIC but isn't an image).
const IMAGE_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'heif', 'hevc', 'hevx', 'mif1', 'msf1', 'miff', 'avif', 'avis']);

export function ftypBrand(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null; // bounds-checked: max index read below is 11
  const at = (o: number) => String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
  return at(4) === 'ftyp' ? at(8).toLowerCase() : null;
}

export function looksLikeVideo(bytes: Uint8Array): boolean {
  const brand = ftypBrand(bytes);
  return !!brand && !IMAGE_BRANDS.has(brand);
}

// HEIC/HEIF — not natively renderable everywhere; see media/heic.ts.
// (AVIF renders natively everywhere we run, so it's excluded.)
export function looksLikeHeic(bytes: Uint8Array): boolean {
  const brand = ftypBrand(bytes);
  return !!brand && IMAGE_BRANDS.has(brand) && brand !== 'avif' && brand !== 'avis';
}
