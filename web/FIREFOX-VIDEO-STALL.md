# Firefox video stall — investigation notes (paused 2026-07-04)

## Symptom

HEVC videos and Live-Photo motion clips (iPhone-origin: `hvc1`, 1080×1920, QuickTime `.mov`)
stall in Firefox on macOS: `readyState=0`, `networkState=2` ("loading"), no metadata, no
`error` event — forever. Chrome and Safari play the exact same app fine.

## Definitively ruled out (each proven, not assumed)

- **Codec/container/bytes** — the identical file (`waypoints-0000.qt`, 16.5 MB) plays to
  `readyState=4` in the standalone isolation page `public/mediatest.html` (same Vite server,
  zero app code), with and without the fast-start rewrite.
- **moov-at-end** — fast-start rewrite (moov before mdat, stco/co64 offsets patched,
  `qt  `→`mp42` rebrand) is applied and verified correct in Chrome; stall persists.
  The rewrite is now the permanent policy in `src/domain/media/videoUrl.ts` (deterministic:
  `faststart()` returns null when not applicable — no playback probe).
- **Blob→`<video>` pipeline, blob MIME** — rewritten blob is typed `video/mp4`; plays standalone.
- **Referrer meta** — added `no-referrer` to the standalone page; still plays.
- **CSP / COOP / COEP** — none set (checked `index.html` and `vite.config.ts`).
- **`<video>` inside `<button>`** — was real (lightbox), fixed to `<div role="button">`;
  didn't resolve the stall. Feed videos were never affected (AlbumThumb root is a `<div>`).
- **Src-less `<track kind="captions">` child** — removed (spec allows pending text tracks to
  hold readyState at 0); didn't resolve the stall. Kept removed.
- **Vue element lifecycle (the big one, killed last)** — instrumented run proved: element was
  **in the document** when `src` was set imperatively (`connected=true`), was never
  destroyed/recreated (ref-callback logging), no `abort`/`emptied` after load start, and the
  load still stalled. Declarative `:src` vs imperative src+`load()`+`play()` made no difference.
- **URL revocation, decoder-pool exhaustion** (single active element), zero-size/transformed
  wrappers — all checked earlier.

## Key evidence from the final instrumented run

```
[wp] main attach src (connected=true)
[wp] main <emptied>   rs=0 net=2        ← from load(), normal
[wp] main <loadstart> rs=0 net=2
[wp] HEVC decodingInfo: HANG(no answer in 2s)   ← mediaCapabilities, no blob involved
[wp] H264 decodingInfo: HANG(no answer in 2s)   ← hangs for H.264 too, not HEVC-specific
[wp] main <stalled>   rs=0 net=2        ← ~3s later; then silence forever
```

`stalled` = the media channel delivered **zero bytes out of an in-memory blob**. Plus
`navigator.mediaCapabilities.decodingInfo()` — pure media-subsystem IPC, no blob, no element —
hangs for *all* codecs in the same page. Two independent media-stack operations frozen while
Chrome/Safari run the identical app.

## Leading hypothesis

**Wedged Firefox media-subsystem state** (content-process media task queues / media cache, or
the RDD "Data Decoder" utility process), not app code. Likely accumulated during the long
debugging session (many stuck loads, detached `<video>` probes, hung `decodingInfo` calls).

This also dissolves the central "contradiction": `mediatest.html` is same-origin → same content
process, but the standalone successes and in-app stalls were probably never observed
**simultaneously**. A session wedge would also explain why symptoms drifted between runs
("previously `<stalled>` fired, now nothing").

Corollary: the *original* bug may genuinely have been moov-at-end, already fixed by the
fast-start rewrite — with all later contradictory results collected inside a poisoned session.

## Test protocol for next time (in this order)

1. **Fully quit Firefox (⌘Q), restart, test the app FIRST** — before mediatest, before anything.
   If videos play: session wedge confirmed, fast-start was the fix, done.
2. If still stalling when fresh, run the probes below and read the matrix:
   - `fetch(blobUrl)` OK in ~ms + control & WebM videos stall → media pipeline wedged
     process-wide even when fresh → step 4.
   - control stalls but WebM plays → decoder-specific (HEVC/VideoToolbox init hanging in RDD).
   - `fetch(blobUrl)` hangs too → blob storage layer itself broken.
3. **Simultaneity check**: while an in-app stall is on screen, open `/mediatest.html` in another
   tab and play the file there. If it now stalls too, the old standalone evidence was a timing
   artifact.
4. Fresh throwaway profile (rules out extensions + prefs):
   `/Applications/Firefox.app/Contents/MacOS/firefox --profile $(mktemp -d) -no-remote`
   Also check `about:support` → Media section, and `about:processes` for a Data Decoder (RDD)
   process. If it reproduces there: file a Firefox bug; capture
   `MOZ_LOG=MediaFormatReader:4,MediaDecoder:4` logs.

## Console probes (paste into the app tab's devtools while a stall is showing)

Control video, pure DOM, zero Vue — grab the stalling element's URL first:

```js
const url = document.querySelector('video')?.src;
const v = Object.assign(document.createElement('video'), { src: '', muted: true, controls: true, loop: true });
v.style.cssText = 'position:fixed;bottom:8px;left:8px;width:160px;z-index:9999;outline:2px solid #0f0';
['loadstart','loadedmetadata','loadeddata','canplay','playing','stalled','suspend','abort','emptied','error']
  .forEach(ev => v.addEventListener(ev, () => console.info(`control <${ev}> rs=${v.readyState} net=${v.networkState} err=${v.error?.code ?? '-'}`)));
document.body.appendChild(v); v.src = url; v.load(); v.play().catch(e => console.info('play():', e.name));
```

Blob data layer without the media stack (OK in milliseconds → wedge is media-specific):

```js
const t0 = performance.now();
fetch(url).then(r => r.arrayBuffer()).then(b => console.info(`fetch(blob) OK ${b.byteLength}B in ${Math.round(performance.now()-t0)}ms`));
setTimeout(() => console.info('(5s mark — if no OK above, fetch hangs too)'), 5000);
```

Native-codec WebM, no HEVC/QuickTime anywhere (stalls too → whole pipeline wedged):

```js
const c = Object.assign(document.createElement('canvas'), { width: 160, height: 120 }), x = c.getContext('2d');
const rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' }), chunks = [];
rec.ondataavailable = e => chunks.push(e.data); rec.start();
let f = 0; const iv = setInterval(() => { x.fillStyle = f++ % 2 ? '#e11' : '#11e'; x.fillRect(0, 0, 160, 120); }, 66);
setTimeout(() => { clearInterval(iv); rec.onstop = () => {
  const w = Object.assign(document.createElement('video'), { muted: true, controls: true, loop: true });
  w.style.cssText = 'position:fixed;bottom:8px;left:180px;width:160px;z-index:9999;outline:2px solid #ff0';
  ['loadeddata','playing','stalled','error'].forEach(ev => w.addEventListener(ev, () => console.info(`webm <${ev}> rs=${w.readyState}`)));
  document.body.appendChild(w); w.src = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); w.play();
}; rec.stop(); }, 600);
```

Media-IPC health (hangs in the wedged state; run in mediatest tab too, for comparison):

```js
navigator.mediaCapabilities.decodingInfo({ type: 'file', video: { contentType: 'video/mp4; codecs="avc1.640028"', width: 1920, height: 1080, bitrate: 5e6, framerate: 30 } })
  .then(i => console.info('decodingInfo OK', i));
setTimeout(() => console.info('(2s mark — if no OK above, it hangs)'), 2000);
```

## Assets

- `public/mediatest.html` — standalone isolation page (codec matrix, WebM generator, file
  picker with optional fast-start). Kept. Open at `/mediatest.html`.
- `src/domain/media/videoUrl.ts` — production fast-start rewrite (probes and forced-mode logging removed).
- All other instrumentation (imperative-src attach, event logging in `PhotoLightbox.vue`,
  `src/lib/videoDebug.ts` control/fetch/WebM probes gated on `localStorage.wpVideoDebug`) was
  removed 2026-07-04; recoverable from git history or reconstructable from the snippets above.
