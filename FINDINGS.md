# Proton Drive SDK — POC findings

Reconnaissance of `@protontech/drive-sdk@0.19.1` (installed under `poc/`), answering:
*"Can the SDK give me the album info I see in the web app, and what does it return?"*

## TL;DR

- **Yes — the SDK can read Proton *Photos* albums.** There's a `ProtonDrivePhotosClient`
  with a full album API. (My earlier web-research claim that "the SDK only does Drive
  files/folders, not Photos albums" was **wrong** — that was true of the *CLI*, not the library.)
- **Caveat:** the Photos client is **not in the public `index` exports** — it lives at
  `dist/protonDrivePhotosClient.js` and is "internal, can change without warning." You import
  it directly. Fine given you accept instability; isolate it behind one module.
- **The SDK does NOT return GPS/location.** Photo metadata has `captureTime`, tags, album
  membership, cover — **no lat/long**. Geo must be read from **EXIF in the downloaded original
  bytes** (which the SDK downloads). So `exifr` is still required. This is settled, not optional.
- **The one real blocker is auth** — the SDK ships *no* login/session/key layer by design. You
  must construct `httpClient` (session tokens) + `account` (decrypted address keys) + a crypto
  proxy + SRP module yourself. This needs a one-time interactive Proton login. See "Auth".

## POC status — WORKING up to your login

Instead of reimplementing auth, I built the official CLI from source (`ProtonDriveApps/sdk`,
Bun workspace) and **added an `albums` command group** that reuses its full auth + the internal
Photos client. Verified: `albums list` runs and reaches the auth gate ("You need to login first").
Only the interactive Proton login remains — that's yours to run.

**Built CLI (this session):**
`/private/tmp/…/scratchpad/proton-sdk-repo/cli/release/proton-drive`
(spike lives in scratchpad; if you want it kept, say so and I'll relocate into `trips.stillh.art`.)

**Run it:**
```
cd <repo>/cli
./release/proton-drive auth login             # opens browser — your Proton login + 2FA
./release/proton-drive albums list            # your albums: name, photo count, uid
./release/proton-drive albums photos "Japan 2026"   # captureTime + nodeUid per photo
./release/proton-drive albums list -j         # JSON output
```
The two POC commands are `cli/src/commands/photos/commandAlbums{List,Photos}.ts`.

## The album API (what answers your question)

`ProtonDrivePhotosClient` (`dist/protonDrivePhotosClient.d.ts`):

| Method | Returns | Use |
|---|---|---|
| `iterateAlbums(signal?)` | `AsyncGenerator<PhotoNode>` (sorted by last activity, newest first) | List your albums |
| `iterateAlbumUids(signal?)` | `AsyncGenerator<string>` | Just the UIDs |
| `iterateAlbum(albumUid, signal?)` | `AsyncGenerator<AlbumItem>` | The photos in one album |
| `getNode(nodeUid)` | `PhotoNode` | Full metadata for a photo/album |
| `getFileDownloader(nodeUid)` | `FileDownloader` | Download original bytes (→ EXIF) |
| `getThumbnail(nodeUid, type)` | `ThumbnailResult` | Cheap preview bytes |
| `experimental.getNodeUrl(nodeUid)` | `string` | Direct node URL (experimental) |

### Data shapes (from `dist/interface/photos.d.ts`)

```ts
type PhotoNode = NodeEntity & {          // NodeEntity has: uid, name, type, ...
  type: NodeType.Photo | NodeType.Album | NodeType.Folder;
  photo?: PhotoAttributes;
  album?: AlbumAttributes;
};
type AlbumAttributes = {
  photoCount: number;
  coverPhotoNodeUid?: string;
  lastActivityTime: Date;
};
type PhotoAttributes = {
  captureTime: Date;                     // <-- for day-by-day ordering
  mainPhotoNodeUid?: string;             // live photos / bursts
  relatedPhotoNodeUids: string[];
  albums: { nodeUid: string; additionTime: Date }[];
  tags: PhotoTag[];                      // Favorites, Videos, Selfies, ...
};
type AlbumItem = { nodeUid: string; captureTime: Date };   // <-- iterateAlbum yields these
```

**Note the absence of any location/GPS/EXIF field.** Confirmed by grepping all dist types.

### Mapping your web album URL
Your URL `…/photos/albums/<A>/album/<B>` encodes a photos-share context + album link id.
Simplest resolution: `iterateAlbums()` and match on `node.name` (the album title you see in the
web app). No need to parse the URL blobs.

### End-to-end flow for one trip album
1. `for await (const album of photos.iterateAlbums())` → find the one whose `name` matches.
2. `for await (const item of photos.iterateAlbum(album.uid))` → collect `{ nodeUid, captureTime }`.
3. Per photo: `photos.getFileDownloader(nodeUid).downloadToStream(...)` → original bytes.
4. `exifr.parse(bytes)` → `{ latitude, longitude, DateTimeOriginal }`. captureTime from SDK is
   the fallback when EXIF has no timestamp.
5. `sharp` → web image + thumb; build manifest (days + route); upload to R2. (Per the plan.)

## Auth — the only hard part (unchanged conclusion, sharper detail)

To construct the client you must supply (`ProtonDriveClientContructorParameters`):

- **`httpClient`**: `{ fetchJson, fetchBlob }` returning `fetch`-style `Response`. **This is where
  the session goes** — every request needs Proton's `x-pm-uid` + `Authorization: Bearer <token>`
  + app-version headers, and 401 → token-refresh handling.
- **`account`** (`ProtonDriveAccount`): returns your address **`PrivateKey`s** (decrypted) and
  public-key lookup. Requires fetching your addresses/keys from the API and decrypting the armored
  private keys with your derived **key password**.
- **`openPGPCryptoModule`**: `new OpenPGPCryptoWithCryptoProxy(cryptoProxy)` where `cryptoProxy`
  is `CryptoApiInterface` from `@protontech/crypto` (ships as TS source, worker/proxy oriented —
  needs setup to run under Node).
- **`srpModule`** (`SRPModule`): `getSrp`, `getSrpVerifier`, `computeKeyPassword` — SRP login +
  key-password derivation.
- `entitiesCache` / `cryptoCache`: `new MemoryCache()` (shipped, trivial).

**Where a real session comes from:** SRP login (username/password/2FA). The official
`proton-drive` CLI does exactly this via browser login and stores the session in the macOS
Keychain (`ch.proton.drive/drive-sdk-cli`). Options to get a session for the POC:

- **(A) Vendor the CLI's auth wiring** (open source in `ProtonDriveApps/sdk` `cli/`) — proven,
  but it's Bun/TS and pulls the whole auth+crypto stack.
- **(B) Implement SRP login in the harness** using `@proton/srp` + `@protontech/crypto` — most
  self-contained, most code, and CryptoProxy-in-Node is the fiddly bit.
- **(C) Reuse the official CLI's Keychain session tokens** for `httpClient`, but still implement
  address-key decryption + crypto proxy ourselves (CLI doesn't hand out decrypted keys).

None is trivial, all need your one-time interactive login. This is the next decision (see chat).

## Runtime note — CONFIRMED: needs Bun (or a bundler), not plain Node
Running `node explore-albums.mjs` fails with `SyntaxError: Unexpected token 'export'` inside
`@protontech/crypto/src/subtle/hmac.ts`. That dep **ships raw, untranspiled TypeScript** (its
`exports` map points at `./src/index.ts`; there is no build output), and the SDK imports it. So:

- **Plain Node 22 cannot import the SDK.** Verified.
- The official `proton-drive` CLI uses **Bun**, which transpiles TS inside `node_modules` on
  import — that's *why*. Recommendation: build the import pipeline on **Bun** too. (Alternatively
  a bundler like Vite/esbuild that transpiles the dep, but Bun is the path of least resistance and
  matches first-party usage.)
- SDK is ESM and needs polyfills under `src/polyfill`. CryptoProxy is worker/proxy oriented —
  the remaining integration risk once Bun handles transpilation.

Bun is **not currently installed** on this machine.
