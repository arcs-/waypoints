<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import { useI18n } from 'vue-i18n';
import { useThumbnails } from '@/composables/useThumbnails';
import { useTheme } from '@/composables/useTheme';
import { buildMapStyle, dotOpacity, lngLat, routeOpacity, routeWidth, stopDay } from '@/lib/mapStyle';
import { appendImg, hlEl, miniEl, stopMarkerEl } from './routeMapMarkers';
import type { Manifest, Photo } from '@/lib/types';

const props = defineProps<{ manifest: Manifest; highlight?: Photo | null; activeStop?: number | null }>();
const { t, locale } = useI18n();
const { thumbUrl } = useThumbnails();
const { theme } = useTheme();
const el = ref<HTMLElement | null>(null);
let map: maplibregl.Map | null = null;
let ro: ResizeObserver | null = null;
let hl: maplibregl.Marker | null = null;
let overviewZoom = 0; // the "whole trip" zoom set on load; scroll-follow zooms in from here
const stopEls = new Map<number, HTMLElement>(); // marker roots, for the mm-active toggle

const activeDay = () =>
  props.activeStop == null ? null : stopDay(props.manifest.stops[props.activeStop] ?? {});

// The whole style is rebuilt per theme: Protomaps light/dark are two label/color flavors
// over the SAME vector tiles (a theme flip refetches nothing), and the trip's route/photo
// layers live inside the style, so setStyle() carries them across automatically.
const buildStyle = () =>
  buildMapStyle(props.manifest, { dark: theme.value === 'dark', lang: locale.value, activeDay: activeDay() });

// Destination zoom of the scroll-follow flyTo: ~2 levels closer than the overview, kept in a
// readable band (14–16) — but never BELOW the overview: a small tour's fitBounds already sits
// above the band, and clamping down would zoom out on scroll.
const stopZoom = () => Math.max(Math.min(Math.max(overviewZoom + 2, 14), 16), overviewZoom);

const boundsLngLat = () => {
  const b = props.manifest.bounds;
  return b ? new maplibregl.LngLatBounds(lngLat(b[0]), lngLat(b[1])) : null;
};

// Clicking a stop marker scrolls its card into view and flashes it.
function scrollToStopCard(i: number) {
  const card = document.getElementById(`stop-${i}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('stop-flash');
  setTimeout(() => card.classList.remove('stop-flash'), 1400);
}

// The active day's individual photos render as mini thumbnails in place of their dots —
// reading a day puts its pictures on the map. Rebuilt only when the active day actually
// changes (scrolling between same-day stops is free); the thumbnail cache is already warm
// from the feed's grid, so these mostly appear instantly. Non-interactive: they're texture,
// the stop marker stays the click target.
let miniDay: string | null = null;
let miniMarkers: maplibregl.Marker[] = [];
function syncMiniThumbs() {
  const day = activeDay();
  if (day === miniDay) return;
  miniDay = day;
  miniMarkers.forEach((m) => m.remove());
  miniMarkers = [];
  if (day == null || !map) return;
  props.manifest.stops
    .filter((s) => stopDay(s) === day)
    .flatMap((s) => s.photos)
    .filter((p) => p.lat != null && !p.approx)
    .forEach((p) => {
      const mini = miniEl(p, thumbUrl);
      mini.style.zIndex = '1'; // above the canvas dots, below the stop thumbnails
      miniMarkers.push(new maplibregl.Marker({ element: mini, anchor: 'center' })
        .setLngLat([p.lng!, p.lat!])
        .addTo(map!));
    });
}

onMounted(() => {
  if (!el.value) return;
  const bounds = boundsLngLat();
  map = new maplibregl.Map({
    container: el.value,
    style: buildStyle(),
    // OSM/Mapterhorn data wants credit; the compact control stays out of the way.
    attributionControl: { compact: true },
    ...(bounds
      ? { bounds, fitBoundsOptions: { padding: 50 } }
      : props.manifest.route.length
        ? { center: lngLat(props.manifest.route[0]!), zoom: 10 }
        : { center: [7.26, 43.7] as [number, number], zoom: 9 }),
  });
  overviewZoom = map.getZoom();

  // The compact attribution starts expanded and only collapses on click; start it collapsed —
  // the credits stay one click away behind the ⓘ. It's a <details> element, so drop `open`
  // (and the class MapLibre toggles alongside it) once the control has rendered.
  map.once('load', () => {
    const attrib = el.value?.querySelector<HTMLDetailsElement>('details.maplibregl-ctrl-attrib');
    attrib?.removeAttribute('open');
    attrib?.classList.remove('maplibregl-compact-show');
  });

  // MapLibre only watches window resizes; the album view's column divider changes this
  // container's width without one, so refresh the map's notion of its size ourselves.
  ro = new ResizeObserver(() => map?.resize());
  ro.observe(el.value);

  props.manifest.stops.forEach((stop, i) => {
    if (stop.lat == null) return;
    const title = [stop.title || stop.place, t('album.photos', { n: stop.photos.length }, stop.photos.length)]
      .filter(Boolean).join(' · ');
    const elx = stopMarkerEl(stop, title, thumbUrl, () => scrollToStopCard(i));
    elx.style.zIndex = '2'; // stop thumbnails stay above the active day's minis
    new maplibregl.Marker({ element: elx, anchor: 'center' })
      .setLngLat([stop.lng!, stop.lat])
      .addTo(map!);
    stopEls.set(i, elx);
  });
});

// Theme flip: rebuild the style wholesale. Same vector tiles, different flavor — the swap is
// pure re-render, no tile refetch. DOM markers persist on their own. Label language follows
// the UI locale the same way.
watch([theme, locale], () => map?.setStyle(buildStyle()));

// Scroll-follow: emphasise the current stop's marker and its day's route segment, and zoom
// the map to match the read. `null` (the top of the page) keeps the whole-trip overview;
// once scrolled into the feed — first stop included — ease in a couple levels closer.
watch(() => props.activeStop, (i) => {
  if (!map) return;
  const day = activeDay();
  stopEls.forEach((m, idx) => {
    m.classList.toggle('mm-active', idx === i);
    // stops off the active day recede with their route segment
    m.classList.toggle('mm-day-dim', day != null && stopDay(props.manifest.stops[idx] ?? {}) !== day);
  });
  if (map.getLayer('route')) {
    map.setPaintProperty('route', 'line-opacity', routeOpacity(day));
    map.setPaintProperty('route', 'line-width', routeWidth(day));
  }
  if (map.getLayer('photo-dots')) {
    map.setPaintProperty('photo-dots', 'circle-opacity', dotOpacity(day, 0.9));
    map.setPaintProperty('photo-dots', 'circle-stroke-opacity', dotOpacity(day, 1));
  }
  syncMiniThumbs();
  if (i == null) {
    const b = boundsLngLat();
    if (b) map.fitBounds(b, { padding: 50, duration: 600 });
    return;
  }
  const s = props.manifest.stops[i];
  if (s?.lat != null) map.flyTo({ center: [s.lng!, s.lat], zoom: stopZoom(), duration: 600 });
});

// Hovering a photo in the feed pops it on the map at its location. The marker is created
// bare immediately and gets its thumbnail swapped in when decrypted.
watch(() => props.highlight, async (p) => {
  if (!map) return;
  if (hl) { hl.remove(); hl = null; }
  if (!p || p.lat == null) return;
  const hlRoot = hlEl();
  hlRoot.style.zIndex = '3'; // the hover pop always reads above stop thumbs and minis
  const marker = new maplibregl.Marker({ element: hlRoot, anchor: 'center' })
    .setLngLat([p.lng!, p.lat])
    .addTo(map);
  hl = marker;
  const url = await thumbUrl(p.nodeUid).catch(() => null);
  if (props.highlight === p && hl === marker && url) appendImg(hlRoot, url);
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
  Global (not scoped): these target MapLibre-injected DOM — the marker elements built above —
  plus `.stop-flash`, which is toggled on a PhotoFeed card when its map marker is clicked.
  Scoped styles wouldn't reach them.
-->
<style>
.maplibregl-map { font-family: var(--font-serif); }

/* Hover-highlight marker: the photo popped larger with a pulsing accent ring.
   mm-hl and mm-wrap are MARKER ROOTS: they must not set `position` themselves — it would
   override .maplibregl-marker's `position: absolute` (same specificity, later source order)
   and shove every marker into normal flow, offsetting it from its coordinates. The
   maplibregl-marker class keeps them positioned, so absolute children still anchor here. */
.mm-hl {
  box-sizing: border-box;
  width: 72px; height: 72px; border-radius: 9999px; overflow: hidden;
  border: 3px solid var(--color-accent); background: #e5e5e5;
  box-shadow: 0 0 0 4px rgba(255, 209, 104, 0.35), 0 4px 14px rgba(0, 0, 0, 0.4);
  animation: mmpulse 1.1s ease-in-out infinite;
  pointer-events: none;
}
.mm-hl img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
@keyframes mmpulse { 0%, 100% { box-shadow: 0 0 0 4px rgba(255,209,104,.35), 0 4px 14px rgba(0,0,0,.4); } 50% { box-shadow: 0 0 0 9px rgba(255,209,104,.12), 0 4px 14px rgba(0,0,0,.4); } }

/* Photo markers: a circular first-image with a count badge (no `position` — see .mm-hl note) */
.mm-wrap { width: 58px; height: 58px; cursor: pointer; transition: opacity .2s ease; }
/* stop belongs to a day other than the one being read → recede with its route segment */
.mm-day-dim { opacity: 0.55; }
.mm-dot {
  position: relative; box-sizing: border-box;
  width: 58px; height: 58px; border-radius: 9999px; overflow: hidden;
  border: 3px solid var(--color-accent); background: #e5e5e5;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35); transition: transform .15s ease;
}
.mm-wrap:hover .mm-dot { transform: scale(1.08); }
/* stop currently in view (scroll-follow) */
.mm-active .mm-dot { transform: scale(1.18); box-shadow: 0 0 0 3px rgba(255, 209, 104, 0.55), 0 3px 12px rgba(0, 0, 0, 0.4); }
.mm-dot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
.mm-badge {
  position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 9999px; background: #111; color: #fff; font-size: 12px; font-weight: 500;
  display: flex; align-items: center; justify-content: center; border: 2px solid var(--color-accent);
}

/* Active-day photo minis: the day's individual pictures, small, replacing their dots
   (marker root — no `position`, see .mm-hl note) */
.mm-mini {
  box-sizing: border-box;
  width: 34px; height: 34px; border-radius: 9999px; overflow: hidden;
  border: 2px solid var(--color-accent); background: #e5e5e5;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.mm-mini img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }

/* brief highlight when a stop is opened from the map */
.stop-flash { animation: stopflash 1.4s ease-out; }
@keyframes stopflash {
  0% { box-shadow: 0 0 0 2px var(--color-accent); }
  100% { box-shadow: 0 0 0 2px transparent; }
}
</style>
