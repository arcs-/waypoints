// Proton Photos album URL, in the form Proton actually routes:
//   https://drive.proton.me/u/1/photos/albums/<photosShareId>/album/<albumLinkId>
// <photosShareId> is constant per account (your Photos root share) — lifted from an album URL.
// Our albumUid is "<volumeId>~<albumLinkId>", so the album segment is the part after "~".
const PHOTOS_SHARE_ID =
  '0kDJm294WeMM7W75ozAXSWOrhhypBs4D2jCXHvX3I6S_01QjP1npntiN8j2hR8Jo6BDMaYQmhWEOklRzzge0KA==';

// Proton Photos home (all albums) for this account.
export const PROTON_PHOTOS_URL = 'https://drive.proton.me/u/1/photos';

export function albumProtonUrl(albumUid: string): string | null {
  const linkId = albumUid.split('~')[1];
  if (!linkId) return null;
  return `https://drive.proton.me/u/1/photos/albums/${PHOTOS_SHARE_ID}/album/${linkId}`;
}
