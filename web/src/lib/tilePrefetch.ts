// Warm the browser's HTTP cache with map tiles the user is about to need (e.g. the next stop
// while the current one is being read), so a flyTo lands on an already-rendered destination
// instead of tiles popping in after the flight. The basemap is plain raster XYZ over HTTP, so
// "preloading" is just requesting the same URLs with the same CORS mode ahead of time — when
// Leaflet asks for them moments later, they come straight from cache.

type Corner = [number, number]; // [lat, lng], matching Manifest['bounds']

const TILE_SIZE = 256;
// A viewport is ~12–16 tiles; the cap keeps a mistaken huge-bounds call from sweeping a
// continent through MapTiler's quota.
const MAX_TILES = 32;
// Session-wide dedupe (keyed style/z/x/y): adjacent stops share most of their tiles, and
// re-scrolling an album should cost nothing.
const requested = new Set<string>();

// Web-Mercator tile indices (slippy-map convention).
const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
function tileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

// The geographic box a widthPx×heightPx viewport covers centered on lat/lng at `zoom`, padded
// by one tile on each side so a small pan right after arrival stays warm. Bounds+zoom (rather
// than center+zoom) is the shared currency here so callers can also prefetch e.g. a whole
// day's fitBounds target later.
export function viewportBounds(lat: number, lng: number, zoom: number, widthPx: number, heightPx: number): [Corner, Corner] {
  const world = TILE_SIZE * 2 ** zoom; // world size in pixels at this zoom
  const r = (lat * Math.PI) / 180;
  const px = ((lng + 180) / 360) * world;
  const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * world;
  const dx = widthPx / 2 + TILE_SIZE;
  const dy = heightPx / 2 + TILE_SIZE;
  const unLng = (x: number) => (Math.min(Math.max(x, 0), world) / world) * 360 - 180;
  const unLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * Math.min(Math.max(y, 0), world)) / world))) * 180) / Math.PI;
  return [[unLat(py + dy), unLng(px - dx)], [unLat(py - dy), unLng(px + dx)]];
}

// Fetch (into cache) every tile of `styleId` covering `bounds` at `zoom`. Fire-and-forget:
// scheduled at idle so it never competes with an in-flight fly animation for bandwidth, and
// requested via <img> with the exact crossOrigin/referrerPolicy the Leaflet tile layer uses —
// a different request mode would be a cache miss and the whole exercise pointless.
export function prefetchTiles(bounds: [Corner, Corner], zoom: number, styleId: string): void {
  const key = import.meta.env.VITE_MAPTILER_KEY;
  const z = Math.round(zoom);
  const lats = [bounds[0][0], bounds[1][0]];
  const lngs = [bounds[0][1], bounds[1][1]];
  const max = 2 ** z - 1;
  const x0 = Math.max(tileX(Math.min(...lngs), z), 0);
  const x1 = Math.min(tileX(Math.max(...lngs), z), max);
  const y0 = Math.max(tileY(Math.max(...lats), z), 0); // tile y grows southward
  const y1 = Math.min(tileY(Math.min(...lats), z), max);

  const urls: string[] = [];
  for (let x = x0; x <= x1 && urls.length < MAX_TILES; x++) {
    for (let y = y0; y <= y1 && urls.length < MAX_TILES; y++) {
      const id = `${styleId}/${z}/${x}/${y}`;
      if (requested.has(id)) continue;
      requested.add(id);
      urls.push(`https://api.maptiler.com/maps/${id}.png?key=${key}`);
    }
  }
  if (!urls.length) return;

  // requestIdleCallback is missing in some WebKit builds — a short timeout is close enough.
  const idle = typeof requestIdleCallback === 'function'
    ? (cb: () => void) => requestIdleCallback(cb, { timeout: 2000 })
    : (cb: () => void) => setTimeout(cb, 300);
  idle(() => {
    for (const url of urls) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'strict-origin-when-cross-origin';
      img.src = url;
    }
  });
}
