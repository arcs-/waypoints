// Client-side reverse geocoding via BigDataCloud's free, key-less, CORS-friendly endpoint.
// Called once per day at manifest-build time and cached in the manifest.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const place = d.city || d.locality || d.principalSubdivision;
    return [place, d.countryName].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}
