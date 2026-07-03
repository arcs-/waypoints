// Reads/writes one JSON file per album in Proton Drive /.memory-lane/.
// This is the durable store AND the cache for expensive EXIF/geocode work.
import { NodeType } from '@protontech/drive-sdk';
import type { StoredAlbum } from './types';

const FOLDER = '.memory-lane';
type Drive = any; // ProtonDriveClient

function nodeName(node: any): string {
  return node?.name?.ok ? node.name.value : (node?.name ?? '');
}

let folderUidPromise: Promise<string> | null = null;

async function indexFolderUid(drive: Drive): Promise<string> {
  if (!folderUidPromise) {
    folderUidPromise = (async () => {
      const root = await drive.getMyFilesRootFolder();
      for await (const child of drive.iterateFolderChildren(root.uid)) {
        if (child.type === NodeType.Folder && nodeName(child) === FOLDER) return child.uid;
      }
      const created = await drive.createFolder(root.uid, FOLDER);
      return created.uid;
    })().catch((e) => { folderUidPromise = null; throw e; });
  }
  return folderUidPromise;
}

async function findFileUid(drive: Drive, folderUid: string, filename: string): Promise<string | null> {
  for await (const child of drive.iterateFolderChildren(folderUid)) {
    if (child.type === NodeType.File && nodeName(child) === filename) return child.uid;
  }
  return null;
}

async function downloadBytes(drive: Drive, nodeUid: string): Promise<Uint8Array> {
  const dl = await drive.getFileDownloader(nodeUid);
  const chunks: Uint8Array[] = [];
  const sink = new WritableStream<Uint8Array>({ write(c) { chunks.push(c); } });
  await dl.downloadToStream(sink).completion();
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export async function readAlbumFile(drive: Drive, slug: string): Promise<StoredAlbum | null> {
  const folderUid = await indexFolderUid(drive);
  const uid = await findFileUid(drive, folderUid, `${slug}.json`);
  if (!uid) return null;
  const bytes = await downloadBytes(drive, uid);
  try { return JSON.parse(new TextDecoder().decode(bytes)) as StoredAlbum; }
  catch { return null; }
}

export async function writeAlbumFile(drive: Drive, slug: string, data: StoredAlbum): Promise<void> {
  const folderUid = await indexFolderUid(drive);
  const filename = `${slug}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const file = new File([bytes], filename, { type: 'application/json' });
  const metadata = { mediaType: 'application/json', expectedSize: bytes.length };

  const existing = await findFileUid(drive, folderUid, filename);
  const uploader = existing
    ? await drive.getFileRevisionUploader(existing, metadata)
    : await drive.getFileUploader(folderUid, filename, metadata);
  await (await uploader.uploadFromFile(file, [])).completion();
}
