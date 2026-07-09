// Every localStorage key the app persists, in one place. (Desktop `pref_*` keys — locale,
// update.* — live in the prefs file and are named at their call sites in host/.)
//
// Importing this module also migrates any legacy `trips.*` keys (the app's pre-rename
// prefix) to `waypoints.*` in place. Module-dependency order guarantees the migration runs
// before any importer reads a key, so there is no init-order footgun.

const LEGACY_PREFIX = 'trips.';
const PREFIX = 'waypoints.';

try {
  for (const old of Object.keys(localStorage)) {
    if (!old.startsWith(LEGACY_PREFIX)) continue;
    const next = PREFIX + old.slice(LEGACY_PREFIX.length);
    const value = localStorage.getItem(old);
    if (value != null && localStorage.getItem(next) == null) localStorage.setItem(next, value);
    localStorage.removeItem(old);
  }
} catch { /* storage unavailable (private mode) — keys just start fresh */ }

export const THEME_KEY = `${PREFIX}theme`;
export const LOCALE_KEY = `${PREFIX}locale`;
export const CLIENT_UID_KEY = `${PREFIX}clientUid`;
export const SESSION_KEY = `${PREFIX}proton.session`;
// First-image capture time per album (cheap-scan cache, see album/useAlbums.ts)
export const firstDateKey = (albumUid: string) => `${PREFIX}firstdate.${albumUid}`;
