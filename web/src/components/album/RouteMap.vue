<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import L from 'leaflet';
import { useI18n } from 'vue-i18n';
import { useThumbnails } from '@/composables/useThumbnails';
import { useTheme } from '@/composables/useTheme';
import type { Manifest, Photo } from '@/lib/types';

const props = defineProps<{ manifest: Manifest; highlight?: Photo | null; activeStop?: number }>();
const { t } = useI18n();
const { thumbUrl } = useThumbnails();
const { theme } = useTheme();
const el = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let hl: L.Marker | null = null;
let baseLayers: L.TileLayer[] = [];
let overviewZoom = 0; // the "whole trip" zoom set on load; scroll-follow zooms in from here
const stopMarkers = new Map<number, L.Marker>();

// (Re)build the basemap for the current theme. Tiles live in Leaflet's tilePane, so they stay
// below the route/markers regardless of when they're added — safe to swap on theme toggle.
function addBasemap() {
  if (!map) return;
  baseLayers.forEach((l) => l.remove());
  baseLayers = [];
  // Esri gray-canvas trio in both themes: a canvas (water darker than land), a shaded-relief
  // hillshade for mountains/terrain, and a reference layer for roads + crisp place labels.
  const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const opts: L.TileLayerOptions = { maxNativeZoom: 16, maxZoom: 19 };
  const variant = theme.value === 'dark' ? 'Dark' : 'Light';
  baseLayers.push(
    L.tileLayer(`${esri}/Canvas/World_${variant}_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { ...opts, className: 'mm-tint' }).addTo(map),
    L.tileLayer(`${esri}/Elevation/World_Hillshade${variant === 'Dark' ? '_Dark' : ''}/MapServer/tile/{z}/{y}/{x}`, { ...opts, className: variant === 'Dark' ? 'mm-hillshade-dark' : 'mm-hillshade' }).addTo(map),
    L.tileLayer(`${esri}/Canvas/World_${variant}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, opts).addTo(map),
  );
}

function stopIcon(url: string | null, label: number): L.DivIcon {
  const img = url ? `<img src="${url}" alt="" />` : '';
  return L.divIcon({
    className: 'mm-icon',
    html: `<div class="mm-wrap"><div class="mm-dot">${img}</div><span class="mm-badge">${label}</span></div>`,
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

  if (props.manifest.route.length) {
    L.polyline(props.manifest.route, { color: '#ffd168', weight: 3, opacity: 0.95 }).addTo(map);
  }
  if (props.manifest.bounds) map.fitBounds(props.manifest.bounds, { padding: [50, 50] });
  else if (props.manifest.route.length) map.setView(props.manifest.route[0]!, 10);
  else map.setView([43.7, 7.26], 9);
  overviewZoom = map.getZoom();

  props.manifest.stops.flatMap((s) => s.photos)
    .filter((p) => p.lat != null && !p.approx)
    .forEach((p) => {
      L.circleMarker([p.lat!, p.lng!], { radius: 3, color: '#111', weight: 0.75, fillColor: '#ffd168', fillOpacity: 0.9, interactive: false }).addTo(map!);
    });

  props.manifest.stops.forEach((stop, i) => {
    if (stop.lat == null) return;
    const marker = L.marker([stop.lat, stop.lng!], {
      icon: stopIcon(null, stop.photos.length),
      title: [stop.title || stop.place, `${stop.photos.length} photos`].filter(Boolean).join(' · '),
      riseOnHover: true,
    }).addTo(map!);
    marker.on('click', () => {
      const card = document.getElementById(`stop-${i}`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.classList.add('stop-flash');
      setTimeout(() => card.classList.remove('stop-flash'), 1400);
    });
    thumbUrl(stop.photos[0]!.nodeUid).then((url) => marker.setIcon(stopIcon(url, stop.photos.length)));
    stopMarkers.set(i, marker);
  });
});

// Re-theme the basemap when the light/dark switch is toggled.
watch(theme, addBasemap);

// Scroll-follow: emphasise the current stop's marker, and zoom the map to match the read.
// At the top (first stop) keep the whole-trip overview; once scrolled into the trip, ease in
// a couple levels closer — near enough to read the place, far enough to see its surroundings.
watch(() => props.activeStop, (i) => {
  if (!map || i == null) return;
  const s = props.manifest.stops[i];
  stopMarkers.forEach((m, idx) => m.getElement()?.classList.toggle('mm-active', idx === i));
  if (i === 0 && props.manifest.bounds) {
    map.flyToBounds(props.manifest.bounds, { padding: [50, 50], duration: 0.6 });
  } else if (s?.lat != null) {
    const closer = Math.min(Math.max(overviewZoom + 2, 11), 13);
    map.flyTo([s.lat, s.lng!], closer, { duration: 0.6 });
  }
});

// Hovering a photo in the feed pops it on the map at its location.
watch(() => props.highlight, async (p) => {
  if (!map) return;
  if (hl) { hl.remove(); hl = null; }
  if (!p || p.lat == null) return;
  hl = L.marker([p.lat, p.lng!], { icon: hlIcon(null), zIndexOffset: 1000, interactive: false }).addTo(map);
  const url = await thumbUrl(p.nodeUid);
  if (props.highlight === p && hl) hl.setIcon(hlIcon(url));
});

onBeforeUnmount(() => map?.remove());
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
.leaflet-container { height: 100%; width: 100%; font-family: var(--font-mono); background: transparent; }

/* On-brand map tint on the BASE only (labels/reference overlay stays crisp).
   Light: neutral gray, darkened + higher contrast so the (already darker) water reads as a
   mid gray while land stays clearly lighter. */
.mm-map .mm-tint { filter: grayscale(1) brightness(0.82) contrast(1.12); }
/* Shaded-relief hillshade multiplied onto the land → mountains/terrain, without darkening
   the flat water much. */
.mm-map .mm-hillshade { mix-blend-mode: multiply; opacity: 0.5; }
[data-theme="dark"] .mm-map .mm-tint {
  /* Dark: Esri Dark Gray canvas — neutral, slightly lifted so structure stays legible. */
  filter: grayscale(1) brightness(1.08) contrast(1.05);
}
/* Dark hillshade (light relief on a dark base) screened in to reveal terrain. */
.mm-map .mm-hillshade-dark { mix-blend-mode: screen; opacity: 0.4; }

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
  border-radius: 9999px; background: #111; color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; border: 2px solid var(--color-accent);
}

/* brief highlight when a stop is opened from the map */
.stop-flash { animation: stopflash 1.4s ease-out; }
@keyframes stopflash {
  0% { box-shadow: 0 0 0 2px var(--color-accent); }
  100% { box-shadow: 0 0 0 2px transparent; }
}
</style>
