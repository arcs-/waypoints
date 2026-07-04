# Waypoints

A private, browser-only view of my [Proton Photos](https://proton.me/drive) albums:
each trip becomes a timeline of stops plotted on a map. Lives at
[trips.stillh.art](https://trips.stillh.art).

## Constraints

- **Browser-only.** No backend. Albums are read and decrypted client-side; manifests
  are cached back into Proton Drive under `/.waypoints/`. There is no database.
- **Personal & private.** Single user. Only talks to Proton and MapTiler — both European —
  and a CSP (`web/public/_headers`) blocks any other egress.
- **Vendored, pre-production SDK.** Uses the unstable `@protontech/drive-sdk`
  (vendored under `proton-sdk/`); breakage on Proton's side is expected and fixed by hand.
- **Small scale.** Built for a handful of albums and a few hundred geotagged photos.
- **Static hosting.** Ships as an SPA to Cloudflare Pages.

## Stack

Vue 3 + Vite + Tailwind v4, vue-router, vue-i18n (en/de/fr), Leaflet, `exifr`, `heic-to`.

## External dependencies

The only hosts the app ever talks to (enforced by the CSP in `web/public/_headers`):

- **Proton Drive** (`drive-api.proton.me`, sign-in via `*.proton.me`) — the photo albums,
  in-browser end-to-end decryption, and where per-album manifests are cached (`/.waypoints/`).
- **MapTiler** (`api.maptiler.com`) — both map tiles (the `outdoor` style: shaded-relief +
  labels, light/dark) and reverse geocoding (stop coordinates → place names, cached in the
  manifest so viewers never trigger it). European (CH/CZ), GDPR-focused, no user tracking.
  Needs an API key (`VITE_MAPTILER_KEY`), origin-locked to this domain in the MapTiler dashboard.

No web fonts, CDNs, or analytics. Every third party is European and privacy-respecting.


## Develop

```sh
cd web
cp .env.example .env   # then set VITE_MAPTILER_KEY (see https://www.maptiler.com/)
bun install
bun run dev      # Vite dev server
bun run build    # type-check-clean production build
bun run lint     # ESLint
```
