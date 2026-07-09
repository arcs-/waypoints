// Reverse geocoding: stop centroid → "Town, Country" in the given language. Called once per
// stop at manifest-build time and cached in the manifest, so viewers never hit these hosts.
// The language comes in as a parameter (the caller reads the UI locale) — this module stays
// a pure leaf with no dependency on the app's i18n state.
//
// Two interchangeable providers — reverseGeocode picks one at the bottom; to switch back,
// point it at the other (both hosts stay allowed in the CSPs: tauri.conf.json + public/_headers):
//  - Photon (komoot): keyless and quota-free, OSM data, German host. The default.
//  - MapTiler: needs VITE_MAPTILER_KEY and eats its monthly quota; kept for easy switch-back.

// Photon's reverse endpoint returns the nearest OSM object of any kind (often a street or
// POI), but its properties carry the enclosing city/country — read those, not `name`, unless
// nothing better exists. `lang` supports exactly our locales (en/de/fr).
interface PhotonProperties {
  name?: string;
  city?: string;
  town?: string;
  village?: string;
  country?: string;
}
export async function photonReverse(lat: number, lng: number, language: string): Promise<string | null> {
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=${language}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data: { features?: { properties?: PhotonProperties }[] } = await response.json();
    const props = data.features?.[0]?.properties;
    if (!props) return null;
    const place = props.city ?? props.town ?? props.village ?? props.name;
    return [place, props.country].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}

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
// `types` biases the result to a city/town/village name; the country comes from the match's
// context. referrerPolicy overrides the page's global `no-referrer` so MapTiler receives the
// bare origin it needs to validate the domain-locked key (never the album path).
export async function maptilerReverse(lat: number, lng: number, language: string): Promise<string | null> {
  const apiKey = import.meta.env.VITE_MAPTILER_KEY;
  try {
    const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${apiKey}&language=${language}&types=municipality,place`;
    const response = await fetch(url, { referrerPolicy: 'strict-origin-when-cross-origin' });
    if (!response.ok) return null;
    const { features }: { features?: GeocodingFeature[] } = await response.json();
    const match = features?.[0];
    if (!match) return null;
    const country = match.context?.find((entry) => entry.id?.startsWith('country'))?.text;
    return [match.text, country].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number, language: string): Promise<string | null> {
  return photonReverse(lat, lng, language); // ← swap to maptilerReverse to switch back
}
