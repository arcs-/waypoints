# trips.stillh.art — architecture (consolidated, pre-build)

A private, Polarsteps-style view of Proton Photos albums: day-by-day feed + route on a map.
Personal use, ~100s of photos, handful of albums. This doc gathers every decision made so far.
**Status: aligning before we build the app. Do not implement until this is signed off.**

## Established facts (proven this session)

- **Proton is end-to-end encrypted** → no hotlinking images; any display requires client-side
  download + decrypt with your keys. Shapes the whole design.
- **The Drive SDK works** (`@protontech/drive-sdk`) and *does* expose Photos albums via the
  internal `ProtonDrivePhotosClient` (`iterateAlbums` → `iterateAlbum`). Album `uid` =
  `<shareCtx>~<albumLinkId>`; the link id is the `/album/…` segment of the web URL.
- **Auth is solved by vendoring the official Proton CLI's stack** (Bun workspace:
  `proton-drive-sdk-account` = SRP/login, `@protontech/crypto` worker proxy). One-time
  browser login; session in **macOS Keychain**. ⚠️ Keychain denies access to *backgrounded*
  processes (`-60008`) → **anything touching Proton must run foreground in your session.**
- **Runtime is Bun** (a transitive dep ships raw TS; plain Node can't load it).
- **SDK returns `captureTime` but no GPS.** Location comes from **EXIF in the original**, read
  cheaply via a **~256 KB partial (seekable) read** — no full-file download needed.
- Vendored + working under `proton-sdk/` with added commands: `albums list`, `albums photos`,
  `albums exif`, `albums export`. Verified against the real "Côte d'Azur" album (236 photos;
  iPhone shots geotagged, Fuji not).

## Locked decisions

| Area | Decision |
|---|---|
| Scope | Local dev now; **the same SPA can be hosted at `trips.stillh.art`** later with no server (CORS to Proton is open from any origin). |
| Architecture | **Browser-only SPA — no server.** ✅ *Proven end-to-end in `browser-spike/`:* fork-login (2FA), album listing, and thumbnail decrypted+rendered fully in-browser. Replaces the earlier local-proxy plan. |
| Proton access | **In-browser via the vendored SDK.** Login = Proton **session fork** (`authViaWeb`, popup, 2FA on account.proton.me); session + `userKeyPassword` in **localStorage**. Crypto runs in-thread. |
| Image serving | Browser **decrypts thumbnails/originals on demand** as blob URLs. **Nothing stored on disk/server.** |
| Index/metadata | **Stored in Proton Drive `/trips-index/`** as JSON — single source of truth; read/written by the SPA via the SDK. |
| Database | **None.** JSON index files only. |
| Geo for untagged photos | **Interpolate by timestamp** between nearest real GPS fixes (`approx: true`). Route line uses real fixes only. (Implemented in `albums export`.) |
| Place names | **Yes** — reverse-geocode day/photo location at publish time, cache in the manifest (no runtime API calls). |
| Viewer stack | **Vue 3 + Vite** (matches stillh.art), **Leaflet** + OSM map. Styled mono/`#FFD168`. |
| App structure | **Not FSD** — flat, conventional Vue grouped by role (views/components/composables/lib). Small app; split only if it grows. |
| Chrome | **Minimal** — no big navigation bar or footer; content-first, just enough to move between overview and album. |
| Overview page | Clean grid of album cards (cover, title, date range). |
| Album view | **Polarsteps-style split**: scrollable day-by-day photo feed + a **smaller, simpler map** alongside, synced to scroll (current day/photo highlighted on the route). |
| Map style | Lean — light/muted tiles, thin route line, small markers. |
| Image tiers | Thumbnail in feed (fast), full-res original decrypted on demand / zoom. |
| Thumbnail cache | In-browser (in-memory + optional IndexedDB) — nothing on disk/server. |
| Index folder | Proton Drive **`/trips-index/`**. |
| Publish (build index) | Browser-side: iterate album → partial-EXIF geo + interpolation + reverse-geocode → write `<slug>.json` to `/trips-index/` via the SDK. (Can also run from the vendored CLI.) |
| Rate limits & app identity | Send an honest `x-pm-appversion` for trips (not impersonating the CLI); rely on the SDK/account `ky` **429 + Retry-After backoff**; add **bounded concurrency** (~4) in bulk loops (publish, thumbnail prefetch); honor server "requirement" notices. |

## Shape (browser-only — validated)

```
Browser SPA (Vue) — served locally now, hostable at trips.stillh.art later, NO backend
┌──────────────────────────────────────────────────────────────┐
│  vendored Proton SDK (in-browser, in-thread crypto)            │
│   login  → session fork (popup + 2FA) → localStorage           │
│   read   → iterateAlbums / iterateAlbum / getThumbnail         │  decrypt in-browser
│   geo    → partial (seekable) EXIF read + interpolation        │
│   publish→ build <slug>.json, write to Proton /trips-index/    │
└───────────────────────────────┬────────────────────────────────┘
                                 │ direct HTTPS (CORS open)
                          Proton (Photos albums = images, Drive = index JSON)
```

- **Publish flow (the 'easy for myself' part):** pick an album → SDK iterates it → capture time +
  partial-EXIF GPS → interpolate missing geo → reverse-geocode → write `<slug>.json` (+ update
  `index.json`) into Proton `/trips-index/`. Images never copied; manifest holds only `nodeUid`s.
- **Viewing:** SPA reads the index/manifest from Proton, renders feed + map, lazy-decrypts each
  thumbnail to a blob URL (cached in-browser). Full-res original decrypted on zoom.
- **Session lifetime:** stored in localStorage, refreshed via `/auth/v4/refresh`; re-login (fork
  popup) when it fully expires.

## Data model

```jsonc
// index.json (in Proton Drive) — list of published albums
{ "albums": [{ "slug": "cote-dazur", "title": "Côte d'Azur", "albumUid": "…~…", "cover": "<id>" }] }

// <slug>.json manifest (in Proton Drive)
{
  "title": "Côte d'Azur", "albumUid": "…~…",
  "bounds": [[lat,lng],[lat,lng]] | null,
  "route": [[lat,lng], …],                    // real GPS fixes, time-ordered
  "days": [{ "date": "2026-07-02", "photos": [
    { "id": "0000", "nodeUid": "…", "takenAt": "…Z", "lat": …, "lng": …, "approx": false }
  ]}]
}
```
(No `thumb` paths — thumbnails are fetched live by `nodeUid` and decrypted in-browser.)

## Recommended app structure (clean, not FSD — browser-only)

```
trips.stillh.art/
  proton-sdk/              # vendored Proton workspace (SDK + account + our albums CLI) — in-repo
  web/                     # Vue 3 + Vite — the whole app, no backend
    src/
      main.ts, App.vue
      views/OverviewView.vue      # album grid
      views/AlbumView.vue         # Polarsteps feed + compact map
      components/                 # PhotoFeed.vue, RouteMap.vue, AlbumCard.vue, LoginGate.vue
      composables/                # useProton.ts (auth+SDK), useAlbums.ts, useAlbum.ts
      proton/                     # SDK wiring: crypto init, credentials(localStorage), adapters
      lib/                        # geo (interpolate), geocode, publish, types
      assets/styles.css
```
Rationale: group by role, minimal indirection. The `browser-spike/` already contains working
versions of the `proton/` wiring (crypto init, credentials, adapters) to lift in.

## Album view interaction (Polarsteps split, minimal chrome)
- **Overview** → click a card → **Album view**.
- Album view: scrollable **day-by-day photo feed** (date + place-name headers) on one side, a
  **smaller, simpler map** on the other; map syncs to scroll — current day/photo highlighted on
  the route. Map = light/muted tiles, thin route line, small markers.
- No big nav/footer anywhere; a light back-to-overview affordance is enough.
- "slideshow" clarified = *minimal, immersive chrome* — not a literal photo-swap.

## Resolved (were open)
1. Place names — **yes**. 2. Stack — **Vue**. 3. Cache — **in-browser**.
4. Index folder — **`/trips-index/`**. 5. Nav — overview page → Polarsteps album view (minimal chrome).
6. Architecture — **browser-only, no server** (validated); `proton-sdk/` stays in-repo.

## Current repo state
- `proton-sdk/` — vendored Proton workspace + our `albums *` commands; `authWeb.ts` patched to
  Web Crypto (browser+Bun). Built, authed, working. **Keep.**
- `browser-spike/` — **working proof** of browser-only (login + list + decrypt). Becomes the seed
  for `web/`. **Keep** (or fold into `web/`).
- `viewer/` — half-built React stub for the old "store previews" path. **Remove.**
- `data/albums/cote-dazur/` — sample from the old previews path. **Remove.**
- `FINDINGS.md` — SDK reconnaissance detail. **Keep.**
```
