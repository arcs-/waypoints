// Collects an SDK file download into memory. Fine for what this app downloads whole
// (album JSON, single photos/clips for the lightbox) — not for bulk transfers.

// Structural slice of the SDK's FileDownloader — enough to stream, nothing more.
interface Downloader {
  downloadToStream(sink: WritableStream<Uint8Array>): { completion(): Promise<unknown> };
}

async function downloadToChunks(dl: Downloader): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  const sink = new WritableStream<Uint8Array>({ write(c) { chunks.push(c); } });
  await dl.downloadToStream(sink).completion();
  return chunks;
}

export async function downloadToBlob(dl: Downloader): Promise<Blob> {
  return new Blob((await downloadToChunks(dl)) as BlobPart[]);
}

export async function downloadToBytes(dl: Downloader): Promise<Uint8Array> {
  const chunks = await downloadToChunks(dl);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
