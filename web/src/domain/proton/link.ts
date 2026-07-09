// Proton Photos album URL, in the form Proton actually routes:
//   https://drive.proton.me/u/<slot>/photos/albums/<photosShareId>/album/<albumLinkId>
// <photosShareId> is constant per account (your Photos root share) but the SDK keeps it
// internal, so it comes from env (lift it from any album URL in Proton's web app). Without
// it, album deep links degrade to null and the UI falls back to the Photos home. <slot> is
// the signed-in account's index in Proton's multi-account URLs (the `/u/1/` segment).
const PHOTOS_SHARE_ID = import.meta.env.VITE_PROTON_PHOTOS_SHARE_ID;
const ACCOUNT_SLOT = import.meta.env.VITE_PROTON_ACCOUNT_SLOT || '0';

// Proton Photos home (all albums) for this account.
export const PROTON_PHOTOS_URL = `https://drive.proton.me/u/${ACCOUNT_SLOT}/photos`;

// Our albumUid is "<volumeId>~<albumLinkId>", so the album segment is the part after "~".
export function albumProtonUrl(albumUid: string): string | null {
  const linkId = albumUid.split('~')[1];
  if (!PHOTOS_SHARE_ID || !linkId) return null;
  return `${PROTON_PHOTOS_URL}/albums/${PHOTOS_SHARE_ID}/album/${linkId}`;
}
