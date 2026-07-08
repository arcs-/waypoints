// HEIC → something <img> can show, losing as little as possible.
//
// WKWebView (the Tauri host) and Safari render HEIC natively through the OS decoder — with
// Display-P3 intact and gain-map HDR on recent macOS — so the best "decode" is handing the
// browser the original bytes. The WASM fallback (heic-to/libheif) draws through an sRGB 2D
// canvas: P3 gets gamut-clipped, the HDR gain map is discarded, and the result is re-encoded
// as 8-bit JPEG. It exists only for engines without native HEIC (Chromium, Firefox, WebKitGTK
// — so also Tauri on Linux, which is why this is probed, not platform-sniffed).
//
// The probe is the first real HEIC blob: try it in an offscreen <img> once and remember the
// verdict for the session. On non-WebKit that costs one failed load (fast — the engine
// rejects the container, it doesn't decode).
let native: boolean | null = null;

function loads(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export async function renderableHeic(blob: Blob, quality: number): Promise<Blob> {
  if (native == null) {
    const url = URL.createObjectURL(blob);
    try { native = await loads(url); } finally { URL.revokeObjectURL(url); }
  }
  if (native) return blob;
  const { heicTo } = await import('heic-to'); // lazy: WASM only when actually needed
  return heicTo({ blob, type: 'image/jpeg', quality });
}
