// Reads/writes one JSON file per album in Proton Drive /.waypoints/.
// This is the durable store AND the cache for expensive EXIF/geocode work.
import { NodeType } from '@protontech/drive-sdk';
import type { Proton } from './client';
import { downloadToBytes } from './download';
import { nodeName } from './nodeName';
import type { StoredAlbum } from '@/domain/album/types';

const FOLDER = '.waypoints';
type Drive = Proton['drive'];

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

export async function readAlbumFile(drive: Drive, slug: string): Promise<StoredAlbum | null> {
  const folderUid = await indexFolderUid(drive);
  const uid = await findFileUid(drive, folderUid, `${slug}.json`);
  if (!uid) return null;
  const bytes = await downloadToBytes(await drive.getFileDownloader(uid));
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
