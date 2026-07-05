# Releasing / bumping the version

The version lives in **three files plus the git tag**, kept in sync by hand — there is no
bump script or CI check. For a new version `X.Y.Z`:

1. `web/src-tauri/tauri.conf.json` → `"version": "X.Y.Z"` — what Tauri stamps into the app
   bundle and installer names.
2. `web/src-tauri/Cargo.toml` → `version = "X.Y.Z"` — the Rust crate. (`Cargo.lock` picks it
   up on the next build; commit that change too.)
3. `web/src/proton/client.ts` → `APP_VERSION = 'external-drive-waypoints@X.Y.Z'` — sent to
   Proton as `x-pm-appversion` on every API call. Only change the version suffix; the
   `external-drive-waypoints` name is the app's registered identity format with Proton.
4. Commit, then create and publish a GitHub Release on tag `vX.Y.Z` (GitHub UI or
   `gh release create vX.Y.Z`). Publishing the release triggers
   `.github/workflows/release.yml`, which builds the signed/notarized universal macOS app
   and attaches the installers to that same release.

Quick check that nothing drifted:

```sh
grep -rn "0\.1\.1" web/src-tauri/tauri.conf.json web/src-tauri/Cargo.toml web/src/proton/client.ts
```
