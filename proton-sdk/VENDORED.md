# Vendored Proton Drive SDK

A copy of Proton's SDK monorepo, vendored because the packages Waypoints needs are
pre-production: `@protontech/drive-sdk` ships without the auth module, and the incubating
account package isn't published at all. Vite aliases the bare specifiers straight to the
TypeScript source here (see `web/vite.config.ts`); there is no build step.

## Provenance

- **Upstream:** <https://github.com/ProtonDriveApps/sdk>
- **Pulled:** 2026-07-04, matching upstream commit `f24961619f849271a013926609b4a889bb57a877`
  (2026-06-30, "fix(client-js): allow report of file/folder inside a direct shared folder").
- Verified by full-tree diff: everything is byte-identical to that commit **except** the two
  files covered by `patches/0001-webcrypto-fork-login.patch` (see below) and a local
  `client/js/bun.lock` (created by `web`'s `install:sdk`; harmless, pins the SDK's deps).

## What the app actually uses

| Path | Used as | Purpose |
|---|---|---|
| `client/js/` | `@protontech/drive-sdk` (`file:` dep) | Drive/Photos client: listing, download, crypto |
| `incubating/account/js/` | `proton-drive-sdk-account` (`file:` dep) | Fork-login auth, session, raw API client |

`client/cs/` (C# SDK) and `incubating/client/` (Kotlin/Swift bindings) are tracked but unused
— kept only so the tree mirrors upstream 1:1, which makes re-vendoring a plain copy.
`cli/` and `config/` exist on disk from the upstream pull but are gitignored.

## Local modifications

One logical change, two files — `patches/0001-webcrypto-fork-login.patch`:

- **`incubating/account/js/src/authWeb.ts`** — rewritten from `node:crypto`
  (`createDecipheriv`/`randomBytes`/`Buffer`) to Web Crypto (`crypto.subtle`,
  `crypto.getRandomValues`). **Why:** upstream's fork-login module is Node-only, but
  Waypoints runs it inside the browser/Tauri webview where `node:crypto` doesn't exist.
  Behavior is identical (AES-256-GCM with `fork` AAD; Web Crypto takes ciphertext‖tag as
  one buffer instead of a separate auth tag).
- **`incubating/account/js/src/auth.ts`** — one-liner: `await` the now-async
  `parseUserKeyPassword` that the rewrite made a Promise.

Everything else the app layers on top (HTTP adapter, credential storage, logging, polyfills)
lives outside the vendored tree in `web/src/proton/` — keep it that way so this list stays short.

## How to update

1. Pull/clone upstream and copy it over this directory (or `git diff` first to preview).
2. Check whether upstream `authWeb.ts` still imports `node:crypto`. If yes:
   `patch -p1 -d proton-sdk < proton-sdk/patches/0001-webcrypto-fork-login.patch`
   (if it no longer applies, redo the same Web Crypto conversion by hand and regenerate the
   patch). If upstream went browser-safe, delete the patch and this section.
3. Update the commit SHA + date above.
4. `cd web && bun run install:sdk && bun run build` — vite aliasing means any upstream API
   drift surfaces here (also check the `private reader` field poke in
   `web/src/lib/buildManifest.ts`, which reaches into
   `client/js/src/internal/download/seekableStream.ts`).
