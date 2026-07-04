# Waypoints

A private, browser-only view of my [Proton Photos](https://proton.me/drive) albums:
each trip becomes a timeline of stops plotted on a map. Lives at
[waypoints.stillh.art](https://waypoints.stillh.art).

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
bun run build    # production build → web/dist
bun run lint     # ESLint
```

## Deploy

Hosted on **Cloudflare Pages** at [waypoints.stillh.art](https://waypoints.stillh.art).
Config lives in `web/wrangler.toml`; `_headers` (CSP) and `_redirects` (SPA fallback for the
history-mode router) are in `web/public/` and Vite copies them into `dist/`.

**Cloudflare build settings** (Git integration):

| Setting | Value |
| --- | --- |
| Root directory | `web` |
| Build command | `bun run build` |
| Output directory | `dist` |
| Environment variable | `VITE_MAPTILER_KEY` = your MapTiler key |

`VITE_MAPTILER_KEY` must be set in the Pages build environment — Vite inlines it into the
bundle at build time (it's a public client key, so this is expected).

Or deploy from the CLI:

```sh
cd web
bun run build
bunx wrangler pages deploy   # uses web/wrangler.toml
```

**Two one-time steps after the first deploy:**

1. **Custom domain** — in the Pages project, add `waypoints.stillh.art`. Since `stillh.art` is
   already on this Cloudflare account, the DNS `CNAME` is created for you.
2. **MapTiler origin lock** — add `https://waypoints.stillh.art` to the key's allowed origins in
   the MapTiler dashboard (add `http://localhost:5174` too for local dev, or use a separate
   unrestricted dev key). Without it, tiles and geocoding are rejected as "unknown origin".
