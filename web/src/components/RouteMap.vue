<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import L from 'leaflet';
import { useThumbnails } from '@/composables/useThumbnails';
import type { Manifest, Photo } from '@/lib/types';

const props = defineProps<{ manifest: Manifest; highlight?: Photo | null }>();
const { thumbUrl } = useThumbnails();
const el = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let hl: L.Marker | null = null;

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
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const variant = dark ? 'dark' : 'light';
  // Tinted, label-free base…
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/${variant}_nolabels/{z}/{x}/{y}{r}.png`, {
    subdomains: 'abcd', maxZoom: 19, className: 'mm-tint',
  }).addTo(map);
  // …with crisp, untinted labels on top so places stay readable.
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/${variant}_only_labels/{z}/{x}/{y}{r}.png`, {
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);

  if (props.manifest.route.length) {
    L.polyline(props.manifest.route, { color: '#ffd168', weight: 3, opacity: 0.95 }).addTo(map);
  }
  if (props.manifest.bounds) map.fitBounds(props.manifest.bounds, { padding: [50, 50] });
  else if (props.manifest.route.length) map.setView(props.manifest.route[0], 10);
  else map.setView([43.7, 7.26], 9);

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
    thumbUrl(stop.photos[0].nodeUid).then((url) => marker.setIcon(stopIcon(url, stop.photos.length)));
  });
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
  <div ref="el" role="region" aria-label="Map of trip locations" class="mm-map h-full w-full bg-neutral-100 dark:bg-neutral-900"></div>
</template>
