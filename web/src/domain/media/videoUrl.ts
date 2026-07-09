// iPhone video and Live-Photo motion are stored as HEVC in a QuickTime .mov with the 'moov'
// index box at the END of the file. Chrome seeks to find it; Firefox stalls at readyState 0.
// Fix: "fast-start" the container — move 'moov' in front of 'mdat'. Pure byte rewrite, no
// re-encode: the sample-chunk offsets (stco/co64) inside moov are bumped by moov's size, since
// mdat now sits that many bytes later. Applied whenever the container needs it — faststart()
// itself returns null for already-fast-start/non-MP4 input, and Chrome/Safari play the
// rewritten file fine (verified), so no playback probe is needed.
// NB: a Firefox stall persisted even with fast-started files — see web/FIREFOX-VIDEO-STALL.md.

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'mvex', 'udta']);

interface Box { type: string; start: number; size: number }

function readBoxes(b: Uint8Array, start: number, end: number): Box[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const boxes: Box[] = [];
  let p = start;
  while (p + 8 <= end) {
    let size = dv.getUint32(p);
    const type = String.fromCharCode(b[p + 4]!, b[p + 5]!, b[p + 6]!, b[p + 7]!);
    if (size === 1) size = Number(dv.getBigUint64(p + 8));
    else if (size === 0) size = end - p;
    if (size < 8 || p + size > end) break;
    boxes.push({ type, start: p, size });
    p += size;
  }
  return boxes;
}

function shiftChunkOffsets(b: Uint8Array, start: number, end: number, delta: number): void {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (const box of readBoxes(b, start, end)) {
    const payload = box.start + 8;
    if (CONTAINERS.has(box.type)) {
      shiftChunkOffsets(b, payload, box.start + box.size, delta);
    } else if (box.type === 'stco') {
      const count = dv.getUint32(payload + 4);
      for (let i = 0, o = payload + 8; i < count; i++, o += 4) dv.setUint32(o, dv.getUint32(o) + delta);
    } else if (box.type === 'co64') {
      const count = dv.getUint32(payload + 4);
      for (let i = 0, o = payload + 8; i < count; i++, o += 8) dv.setBigUint64(o, dv.getBigUint64(o) + BigInt(delta));
    }
  }
}

function faststart(input: Uint8Array): Uint8Array | null {
  const boxes = readBoxes(input, 0, input.length);
  const ftyp = boxes.find((x) => x.type === 'ftyp');
  const moov = boxes.find((x) => x.type === 'moov');
  const mdat = boxes.find((x) => x.type === 'mdat');
  if (!ftyp || !moov || !mdat || moov.start < mdat.start) return null; // missing, or already fast-start
  const moovBytes = input.slice(moov.start, moov.start + moov.size);
  shiftChunkOffsets(moovBytes, 0, moovBytes.length, moov.size);
  const out = new Uint8Array(input.length);
  let w = 0;
  out.set(input.subarray(ftyp.start, ftyp.start + ftyp.size), w); w += ftyp.size; // ftyp first
  // Rebrand QuickTime ('qt  ') → 'mp42' so Firefox uses its MP4 demuxer, not the .mov path.
  if (out[8] === 0x71 && out[9] === 0x74) { out[8] = 0x6d; out[9] = 0x70; out[10] = 0x34; out[11] = 0x32; }
  out.set(moovBytes, w); w += moovBytes.length; // moov moved to front
  for (const box of boxes) { // everything else (incl. mdat) in original order
    if (box === ftyp || box === moov) continue;
    out.set(input.subarray(box.start, box.start + box.size), w); w += box.size;
  }
  return out.subarray(0, w);
}

// A URL the <video> element can play: a fast-started rewrite when the container needs one,
// otherwise the original blob (also the fallback if the rewrite fails).
export async function playableVideoUrl(blob: Blob): Promise<string> {
  try {
    const fixed = faststart(new Uint8Array(await blob.arrayBuffer()));
    if (fixed) return URL.createObjectURL(new Blob([fixed as BlobPart], { type: 'video/mp4' }));
  } catch { /* fall through to the original bytes */ }
  return URL.createObjectURL(blob);
}
