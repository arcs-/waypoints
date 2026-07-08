# Waypoints

A private desktop app that reads my [Proton Photos](https://proton.me/drive) albums, decrypts
them locally, and lays each trip out as a timeline of stops on a map.

![Waypoints](docs/screenshot.png)

## Concept

- **No backend.** Albums are read and decrypted client-side; per-album data is cached back into
  Proton Drive under `/.waypoints/`. Personal and single-user by design.
- **Desktop (Tauri), not a website — for now.** Proton's API only accepts browser calls from
  allowlisted origins. The Tauri webview (`tauri://localhost`) is allowed; an arbitrary web
  domain isn't.
- **Talks to few hosts, all listed below.** No analytics, CDNs, or web fonts.
- **Vendored, pre-production SDK.** The unstable `@protontech/drive-sdk` lives under
  `proton-sdk/`; provenance, local patches, and how to update it are in
  [`proton-sdk/VENDORED.md`](proton-sdk/VENDORED.md).

## External dependencies

| Service | Used for | Key |
|---|---|---|
| [Proton Drive](https://proton.me/drive) | albums, client-side decryption, manifest cache | your account |
| [Protomaps](https://protomaps.com) | vector basemap (OpenStreetMap data) | `VITE_PROTOMAPS_KEY`, free |
| [Mapterhorn](https://mapterhorn.com) | terrain hillshade | — |
| [Photon](https://photon.komoot.io) | stop names (reverse geocoding) | — |
| GitHub releases | update check, desktop only, at most once a day | — |

Releases: [`docs/RELEASING.md`](docs/RELEASING.md).
