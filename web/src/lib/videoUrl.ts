// iPhone video (both regular clips and Live Photo motion) is HEVC in a QuickTime .mov container.
// Chrome/Safari play that in a <video> directly; Firefox can't demux the .mov, so it stalls.
// When direct playback fails, remux the container to a fragmented MP4 (no re-encode — the HEVC
// stream is untouched) with mp4box, which Firefox's own HEVC decoder can then play.

// Probe: can a detached <video> actually decode this blob URL? Resolves true on the first frame
// (loadeddata), false on error or if nothing decodes within the timeout (Firefox's silent stall).
function canPlay(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      v.removeAttribute('src');
      try { v.load(); } catch { /* ignore */ }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 1500);
    v.addEventListener('loadeddata', () => { clearTimeout(timer); finish(true); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(timer); finish(false); }, { once: true });
    v.src = url;
  });
}

// Remux the container to a single fragmented-MP4 blob (all tracks, no transcode).
async function remuxToMp4(data: ArrayBuffer): Promise<Blob | null> {
  try {
    const { createFile } = await import('mp4box');
    return await new Promise<Blob | null>((resolve) => {
      const file = createFile();
      const parts: BlobPart[] = [];
      let settled = false;
      const finish = (b: Blob | null) => { if (!settled) { settled = true; resolve(b); } };
      file.onError = () => finish(null);
      file.onReady = (info) => {
        if (!info.tracks.length) return finish(null);
        for (const tr of info.tracks) file.setSegmentOptions(tr.id, null, { nbSamples: Number.MAX_SAFE_INTEGER });
        for (const seg of file.initializeSegmentation()) parts.push(seg.buffer);
        let remaining = info.tracks.length;
        file.onSegment = (_id, _user, buffer, _sampleNum, last) => {
          parts.push(buffer);
          if (last && --remaining === 0) finish(new Blob(parts, { type: 'video/mp4' }));
        };
        file.start();
      };
      const buf = data as ArrayBuffer & { fileStart: number };
      buf.fileStart = 0;
      file.appendBuffer(buf);
      file.flush();
      setTimeout(() => finish(null), 10000); // safety net if segmentation never completes
    });
  } catch {
    return null;
  }
}

// A URL the <video> element can actually play. Fast path returns the original blob; only if the
// browser can't play it do we pay for the (cached-by-caller) remux.
export async function playableVideoUrl(blob: Blob): Promise<string> {
  const direct = URL.createObjectURL(blob);
  if (await canPlay(direct)) return direct;
  const remuxed = await remuxToMp4(await blob.arrayBuffer());
  return remuxed ? URL.createObjectURL(remuxed) : direct;
}
