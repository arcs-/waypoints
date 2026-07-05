<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import L from 'leaflet';
import { useI18n } from 'vue-i18n';
import { useThumbnails } from '@/composables/useThumbnails';
import { useTheme } from '@/composables/useTheme';
import { prefetchTiles, viewportBounds } from '@/lib/tilePrefetch';
import type { Manifest, Photo } from '@/lib/types';

const props = defineProps<{ manifest: Manifest; highlight?: Photo | null; activeStop?: number | null }>();
const { t } = useI18n();
const { thumbUrl } = useThumbnails();
const { theme } = useTheme();
const el = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let ro: ResizeObserver | null = null;
let hl: L.Marker | null = null;
let routeLine: L.Polyline | null = null;
let dayLine: L.Polyline | null = null; // full-intensity overlay for the day being read
let baseLayers: L.TileLayer[] = [];
let overviewZoom = 0; // the "whole trip" zoom set on load; scroll-follow zooms in from here
const stopMarkers = new Map<number, L.Marker>();

// (Re)build the basemap for the current theme. Tiles live in Leaflet's tilePane, so they stay
// below the route/markers regardless of when they're added — safe to swap on theme toggle.
function addBasemap() {
  if (!map) return;
  baseLayers.forEach((l) => l.remove());
  baseLayers = [];
  // MapTiler stock "outdoor" style (raster XYZ, Leaflet-native) — a European (CH/CZ),
  // GDPR-focused provider. Relief/hillshade AND labels are baked into one style by their
  // cartographers, so labels stay legible over the terrain (no custom blending needed).
  // Light/dark variants swap on theme toggle. Tiles need a key: set VITE_MAPTILER_KEY and
  // restrict it to this domain in the MapTiler dashboard (the key ships in the client).
  const key = import.meta.env.VITE_MAPTILER_KEY;
  baseLayers.push(
    // crossOrigin makes tiles CORS requests that send an `Origin` header (MapTiler returns
    // `access-control-allow-origin: *`, so this is safe). That's what the domain-locked key is
    // validated against. We can't rely on `Referer` alone: the packaged desktop build runs at
    // `tauri://localhost`, and that scheme doesn't send a Referer to https hosts — so tiles would
    // be rejected without this. referrerPolicy is kept for browsers (never leak the album path).
    L.tileLayer(`https://api.maptiler.com/maps/${styleId()}/{z}/{x}/{y}.png?key=${key}`, {
      maxNativeZoom: 20,
      maxZoom: 20,
      crossOrigin: 'anonymous',
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(map),
  );
}

// Route line color per theme: the accent yellow washes out against the light outdoor tiles,
// so light mode draws the line black; dark mode keeps the accent.
const routeColor = () => (theme.value === 'dark' ? '#ffd168' : '#333');
const styleId = () => (theme.value === 'dark' ? 'outdoor-v2-dark' : 'outdoor-v2');

// Destination zoom of the scroll-follow flyTo: ~4 levels closer than the overview, kept in a
// readable band (15–17) — but never BELOW the overview: a small tour's fitBounds already sits
// above the band, and clamping down would zoom out on scroll. Shared with the prefetcher so
// the warmed tiles are exactly the ones the fly will land on.
const stopZoom = () => Math.max(Math.min(Math.max(overviewZoom + 4, 15), 17), overviewZoom);

// Warm the tiles of the stop the reader is heading toward (the one after the active stop; the
// first stop when still at the overview) while the current view is idle.
function prefetchNextStop(active: number | null) {
  const next = props.manifest.stops[active == null ? 0 : active + 1];
  if (!map || next?.lat == null) return;
  const { x, y } = map.getSize();
  prefetchTiles(viewportBounds(next.lat, next.lng!, stopZoom(), x, y), stopZoom(), styleId());
}

function stopIcon(url: string | null, label: number): L.DivIcon {
  const img = url ? `<img src="${url}" alt="" />` : '';
  const badge = label > 1 ? `<span class="mm-badge">${label}</span>` : ''; // a count of 1 is noise
  return L.divIcon({
    className: 'mm-icon',
    html: `<div class="mm-wrap"><div class="mm-dot">${img}</div>${badge}</div>`,
    iconSize: [58, 58], iconAnchor: [29, 29],
  });
}
function hlIcon(url: string | null): L.DivIcon {
  const img = url ? `<img src="${url}" alt="" />` : '';
  return L.divIcon({ className: 'mm-icon', html: `<div class="mm-hl">${img}</div>`, iconSize: [72, 72], iconAnchor: [36, 36] });
}

onMounted(() => {
  if (!el.value) return;
  map = L.map(el.value, { zoomControl: false, attributionControl: false });
  addBasemap();

  // Leaflet only watches window resizes; the album view's column divider changes this
  // container's width without one, so refresh the map's notion of its size ourselves.
  ro = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
  ro.observe(el.value);

  if (props.manifest.route.length) {
    routeLine = L.polyline(props.manifest.route, { color: routeColor(), weight: 3, opacity: 0.95 }).addTo(map);
  }
  if (props.manifest.bounds) map.fitBounds(props.manifest.bounds, { padding: [50, 50] });
  else if (props.manifest.route.length) map.setView(props.manifest.route[0]!, 10);
  else map.setView([43.7, 7.26], 9);
  overviewZoom = map.getZoom();

  props.manifest.stops.flatMap((s) => s.photos)
    .filter((p) => p.lat != null && !p.approx)
    .forEach((p) => {
      L.circleMarker([p.lat!, p.lng!], { radius: 7, color: '#111', weight: 1, fillColor: '#ffd168', fillOpacity: 0.9, interactive: false }).addTo(map!);
    });

  props.manifest.stops.forEach((stop, i) => {
    if (stop.lat == null) return;
    const marker = L.marker([stop.lat, stop.lng!], {
      icon: stopIcon(null, stop.photos.length),
      title: [stop.title || stop.place, t('album.photos', { n: stop.photos.length }, stop.photos.length)].filter(Boolean).join(' · '),
      riseOnHover: true,
    }).addTo(map!);
    marker.on('click', () => {
      const card = document.getElementById(`stop-${i}`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.classList.add('stop-flash');
      setTimeout(() => card.classList.remove('stop-flash'), 1400);
    });
    thumbUrl(stop.photos[0]!.nodeUid).then((url) => marker.setIcon(stopIcon(url, stop.photos.length))).catch(() => {});
    stopMarkers.set(i, marker);
  });
});

// Re-theme the basemap and the route lines when the light/dark switch is toggled.
watch(theme, () => {
  addBasemap();
  routeLine?.setStyle({ color: routeColor() });
  dayLine?.setStyle({ color: routeColor() });
});

// Route emphasis while reading: a multi-day trip that criss-crosses the same area (a city
// walked for days) draws every leg at once, which reads as scribble. While a stop is active,
// dim the full route and overlay only the segment for the day being read — its stops plus the
// arrival leg. At the top (overview), the whole route is back at full intensity.
// route[] holds only located stops in order, so the i-th located stop is route[i].
function emphasiseDay(active: number | null | undefined) {
  if (!map || !routeLine) return;
  dayLine?.remove(); dayLine = null;
  const day = active == null ? null : props.manifest.stops[active]?.startTime?.slice(0, 10);
  let seg: [number, number][] = [];
  if (day) {
    const located = props.manifest.stops.filter((s) => s.lat != null);
    const ris = located.map((s, ri) => ({ s, ri })).filter(({ s }) => s.startTime?.slice(0, 10) === day);
    if (ris.length) seg = props.manifest.route.slice(Math.max(0, ris[0]!.ri - 1), ris[ris.length - 1]!.ri + 1);
  }
  if (seg.length > 1) {
    routeLine.setStyle({ opacity: 0.25 });
    dayLine = L.polyline(seg, { color: routeColor(), weight: 4, opacity: 0.95 }).addTo(map);
  } else {
    routeLine.setStyle({ opacity: 0.95 });
  }
}

// Scroll-follow: emphasise the current stop's marker, and zoom the map to match the read.
// `null` (the top of the page) keeps the whole-trip overview; once scrolled into the feed —
// first stop included — ease in a couple levels closer: near enough to read the place, far
// enough to see its surroundings.
watch(() => props.activeStop, (i) => {
  if (!map) return;
  stopMarkers.forEach((m, idx) => m.getElement()?.classList.toggle('mm-active', idx === i));
  emphasiseDay(i);
  prefetchNextStop(i ?? null);
  if (i == null) {
    if (props.manifest.bounds) map.flyToBounds(props.manifest.bounds, { padding: [50, 50], duration: 0.6 });
    return;
  }
  const s = props.manifest.stops[i];
  if (s?.lat != null) map.flyTo([s.lat, s.lng!], stopZoom(), { duration: 0.6 });
});

// Hovering a photo in the feed pops it on the map at its location.
watch(() => props.highlight, async (p) => {
  if (!map) return;
  if (hl) { hl.remove(); hl = null; }
  if (!p || p.lat == null) return;
  hl = L.marker([p.lat, p.lng!], { icon: hlIcon(null), zIndexOffset: 1000, interactive: false }).addTo(map);
  const url = await thumbUrl(p.nodeUid).catch(() => null);
  if (props.highlight === p && hl) hl.setIcon(hlIcon(url));
});

onBeforeUnmount(() => {
  ro?.disconnect();
  map?.remove();
});
</script>

<template>
  <div
    ref="el"
    role="region"
    :aria-label="t('album.mapRegion')"
    class="
      mm-map size-full bg-neutral-300
      dark:bg-neutral-900
    "
  />
</template>

<!--
  Global (not scoped): these target Leaflet-injected DOM — the tile layers and the
  divIcon markers built from innerHTML strings above — plus `.stop-flash`, which is
  toggled on a PhotoFeed card when its map marker is clicked. Scoped styles wouldn't reach them.
-->
<style>
/* Leaflet needs real CSS (not utilities) */
.leaflet-container { height: 100%; width: 100%; font-family: var(--font-serif); background: transparent; }

/* Hover-highlight marker: the photo popped larger with a pulsing accent ring */
.mm-hl {
  position: relative; box-sizing: border-box;
  width: 72px; height: 72px; border-radius: 9999px; overflow: hidden;
  border: 3px solid var(--color-accent); background: #e5e5e5;
  box-shadow: 0 0 0 4px rgba(255, 209, 104, 0.35), 0 4px 14px rgba(0, 0, 0, 0.4);
  animation: mmpulse 1.1s ease-in-out infinite;
}
/* width/height !important: Leaflet forces `width:auto` on marker-pane imgs, which leaves
   portrait photos not filling the circle — override it so object-fit can crop to a full circle. */
.mm-hl img { position: absolute; inset: 0; width: 100% !important; height: 100% !important; object-fit: cover; object-position: center; display: block; }
@keyframes mmpulse { 0%, 100% { box-shadow: 0 0 0 4px rgba(255,209,104,.35), 0 4px 14px rgba(0,0,0,.4); } 50% { box-shadow: 0 0 0 9px rgba(255,209,104,.12), 0 4px 14px rgba(0,0,0,.4); } }

/* Photo markers: a circular first-image with a count badge */
.leaflet-div-icon.mm-icon { background: transparent; border: none; cursor: pointer; }
.mm-wrap { position: relative; width: 58px; height: 58px; }
.mm-dot {
  position: relative; box-sizing: border-box;
  width: 58px; height: 58px; border-radius: 9999px; overflow: hidden;
  border: 3px solid var(--color-accent); background: #e5e5e5;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35); transition: transform .15s ease;
}
.mm-wrap:hover .mm-dot { transform: scale(1.08); }
/* stop currently in view (scroll-follow) */
.mm-active .mm-dot { transform: scale(1.18); box-shadow: 0 0 0 3px rgba(255, 209, 104, 0.55), 0 3px 12px rgba(0, 0, 0, 0.4); }
.mm-dot img { position: absolute; inset: 0; width: 100% !important; height: 100% !important; object-fit: cover; object-position: center; display: block; }
.mm-badge {
  position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 9999px; background: #111; color: #fff; font-size: 12px; font-weight: 500;
  display: flex; align-items: center; justify-content: center; border: 2px solid var(--color-accent);
}

/* brief highlight when a stop is opened from the map */
.stop-flash { animation: stopflash 1.4s ease-out; }
@keyframes stopflash {
  0% { box-shadow: 0 0 0 2px var(--color-accent); }
  100% { box-shadow: 0 0 0 2px transparent; }
}
</style>
