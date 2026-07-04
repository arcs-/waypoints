import { i18n } from '@/i18n';

// The slice of MapTiler's GeoJSON geocoding response we actually read.
// Full schema: https://docs.maptiler.com/cloud/api/geocoding/
interface GeocodingContext {
  id?: string; // e.g. "country.xxxxx", "region.xxxxx"
  text?: string;
}
interface GeocodingFeature {
  text?: string; // the matched place name, in the requested language
  context?: GeocodingContext[];
}
interface GeocodingResponse {
  features?: GeocodingFeature[];
}

// Client-side reverse geocoding via MapTiler's Geocoding API — the same European (CH/CZ),
// GDPR-focused provider as the map tiles, on the same key. Called once at manifest-build time
// and cached in the manifest, so viewers never hit this endpoint. `types` biases the result to
// a city/town/village name; the country is pulled from the match's context. Place names come
// back in the viewer's current locale (`language`). referrerPolicy overrides the page's global
// `no-referrer` so MapTiler receives the bare origin it needs to validate the domain-locked key
// (never the album path).
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const apiKey = import.meta.env.VITE_MAPTILER_KEY;
  const language = i18n.global.locale.value;
  try {
    const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${apiKey}&language=${language}&types=municipality,place`;
    const response = await fetch(url, { referrerPolicy: 'strict-origin-when-cross-origin' });
    if (!response.ok) return null;
    const { features }: GeocodingResponse = await response.json();
    const match = features?.[0];
    if (!match) return null;
    const country = match.context?.find((entry) => entry.id?.startsWith('country'))?.text;
    const placeName = match.text;
    return [placeName, country].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}
