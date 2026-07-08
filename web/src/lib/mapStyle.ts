// The MapLibre style for the album map — Protomaps vector basemap (light/dark flavors over
// the same tiles), Mapterhorn hillshade, and the trip's own route/photo layers baked into the
// style so setStyle() carries them across theme/locale swaps automatically. Pure functions:
// the component owns the map instance, this module owns what it looks like.
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps';
import type { Manifest } from './types';

// Mapterhorn terrain lives in PMTiles archives; the pmtiles protocol turns HTTP range
// requests into tiles, so a static file on their CDN behaves like a tile server.
maplibregl.addProtocol('pmtiles', new Protocol().tile);

// Manifest coordinates are [lat, lng] (Leaflet heritage); MapLibre wants [lng, lat].
export const lngLat = ([lat, lng]: [number, number]): [number, number] => [lng, lat];
export const stopDay = (s: { startTime?: string | null }) => s.startTime?.slice(0, 10) ?? null;

// The route as one LineString per day: a stop's arrival leg belongs to its day, so each
// feature leads in from the previous located stop. Only located stops exist in route[],
// so the i-th located stop is route[i]. Days are told apart by opacity alone (see
// routeOpacity), not color — the line is the accent yellow throughout.
function routeFeatures(manifest: Manifest): GeoJSON.Feature[] {
  const located = manifest.stops.filter((s) => s.lat != null);
  const days: string[] = [];
  const byDay = new Map<string, number[]>(); // day → located-stop indices (in order)
  located.forEach((s, ri) => {
    const d = stopDay(s) ?? 'unknown';
    if (!byDay.has(d)) { byDay.set(d, []); days.push(d); }
    byDay.get(d)!.push(ri);
  });
  return days.map((d) => {
    const ris = byDay.get(d)!;
    const from = Math.max(0, ris[0]! - 1); // lead-in from the previous day's last stop
    const coords = manifest.route.slice(from, ris[ris.length - 1]! + 1).map(lngLat);
    return {
      type: 'Feature',
      properties: { day: d },
      geometry: { type: 'LineString', coordinates: coords },
    } as GeoJSON.Feature;
  }).filter((f) => (f.geometry as GeoJSON.LineString).coordinates.length > 1);
}

function photoFeatures(manifest: Manifest): GeoJSON.Feature[] {
  return manifest.stops.flatMap((s) => s.photos.map((p) => ({ p, day: stopDay(s) ?? 'unknown' })))
    .filter(({ p }) => p.lat != null && !p.approx)
    .map(({ p, day }) => ({
      type: 'Feature',
      properties: { day }, // same day key as routeFeatures, for the active-day emphasis
      geometry: { type: 'Point', coordinates: [p.lng!, p.lat!] },
    } as GeoJSON.Feature));
}

// While a stop is active, its day draws at full strength and every other day fades to
// context — a multi-day city criss-cross reads as one bold day instead of a scribble.
// At the top (overview) all days are equal.
export function routeOpacity(activeDay: string | null): maplibregl.ExpressionSpecification | number {
  if (!activeDay) return 0.95;
  return ['case', ['==', ['get', 'day'], activeDay], 0.95, 0.25];
}
export function routeWidth(activeDay: string | null): maplibregl.ExpressionSpecification | number {
  if (!activeDay) return 3;
  return ['case', ['==', ['get', 'day'], activeDay], 4, 3];
}
// Photo dots follow suit: the active day's dots vanish — their photos render as mini
// thumbnails instead (the component's syncMiniThumbs) — while other days' dots fade.
export function dotOpacity(activeDay: string | null, full: number): maplibregl.ExpressionSpecification | number {
  if (!activeDay) return full;
  return ['case', ['==', ['get', 'day'], activeDay], 0, full * 0.4];
}

// POIs are filtered down to what matters when looking BACK at a trip — sights and scenery
// (museums, attractions, parks, beaches, peaks…), not errands: no food/drink, shops,
// transit, or street furniture.
const TRIP_POI_KINDS = [
  'attraction', 'museum', 'theatre', 'artwork', 'zoo', 'stadium', 'townhall',
  'park', 'garden', 'beach', 'forest', 'peak', 'marina',
];

export function buildMapStyle(
  manifest: Manifest,
  opts: { dark: boolean; lang: string; activeDay: string | null },
): maplibregl.StyleSpecification {
  const { dark, lang, activeDay } = opts;
  const flavorName = dark ? 'dark' : 'light';
  const flavor = namedFlavor(flavorName);
  const key = import.meta.env.VITE_PROTOMAPS_KEY;
  const base = basemapLayers('protomaps', flavor, { lang });

  // The background layer paints instantly (it needs no tiles) but the flavor's default is a
  // lighter gray than the land fills that arrive with the tiles — every fly into unloaded
  // area flashes gray→dark. Paint the background as land so loading is invisible.
  const bg = base.find((l) => l.type === 'background') as maplibregl.BackgroundLayerSpecification | undefined;
  if (bg) bg.paint = { ...bg.paint, 'background-color': flavor.earth };

  // Appended on top of the basemap's own POI filter, so anything upstream adds still has
  // to pass the trip-worthy list.
  const pois = base.find((l) => l.id === 'pois');
  if (pois && 'filter' in pois && pois.filter) {
    pois.filter = ['all', pois.filter as maplibregl.ExpressionSpecification,
      ['in', ['get', 'kind'], ['literal', TRIP_POI_KINDS]]];
  }

  // The flavors ship labels at full contrast; knock all text/icons back so the photos and
  // the route carry the map and the basemap reads as backdrop. Opacity (not recoloring)
  // keeps the flavor's hue relationships intact. Layers with their own opacity are left be.
  for (const l of base) {
    if (l.type !== 'symbol') continue;
    const paint = (l.paint ?? {}) as maplibregl.SymbolLayerSpecification['paint'] & Record<string, unknown>;
    if (!('text-opacity' in paint)) paint['text-opacity'] = 0.7;
    if (!('icon-opacity' in paint)) paint['icon-opacity'] = 0.7;
    l.paint = paint;
  }

  // Hillshade goes below water so lakes/rivers keep crisp edges over the relief. The DEM
  // maxes out at z12 (Mapterhorn's planet archive) and overzooms beyond — soft but present
  // at street level, which is all a reading backdrop needs.
  const hillshade: maplibregl.LayerSpecification = {
    id: 'hillshade',
    type: 'hillshade',
    source: 'mapterhorn',
    paint: dark
      ? { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': 'rgba(255,255,255,0.14)' }
      : { 'hillshade-exaggeration': 0.45 },
  };
  const waterIdx = base.findIndex((l) => l.id === 'water');
  base.splice(waterIdx > 0 ? waterIdx : 2, 0, hillshade);

  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${flavorName}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `https://api.protomaps.com/tiles/v4.json?key=${key}`,
        attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
      mapterhorn: {
        type: 'raster-dem',
        url: 'pmtiles://https://download.mapterhorn.com/planet.pmtiles',
        encoding: 'terrarium',
        tileSize: 512,
        attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
      },
      route: { type: 'geojson', data: { type: 'FeatureCollection', features: routeFeatures(manifest) } },
      photos: { type: 'geojson', data: { type: 'FeatureCollection', features: photoFeatures(manifest) } },
    },
    layers: [
      ...base,
      {
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffd168',
          'line-width': routeWidth(activeDay),
          'line-opacity': routeOpacity(activeDay),
        },
      },
      {
        id: 'photo-dots',
        type: 'circle',
        source: 'photos',
        paint: {
          'circle-radius': 7,
          'circle-color': '#ffd168',
          'circle-opacity': dotOpacity(activeDay, 0.9),
          'circle-stroke-color': '#111',
          'circle-stroke-width': 1,
          'circle-stroke-opacity': dotOpacity(activeDay, 1),
        },
      },
    ],
  };
}
