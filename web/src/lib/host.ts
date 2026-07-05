import { isTauri } from './platform';

// The single seam between the app and whatever shell hosts it (browser or the Tauri desktop
// app). Every host-specific behavior lives here as a plain function that branches internally,
// plus capability flags the templates read — so this file IS the list of host touchpoints.
// Adding a host (e.g. a browser-extension build) means extending this file, not auditing the
// codebase for scattered `isTauri` checks. Tauri APIs are imported lazily inside the Tauri
// branches so the web bundle never pulls them in.

// ---- Capabilities (what the app should render, given what the host's chrome provides) ----

export const hasRefreshButton = isTauri; // the webview has no reload chrome; browsers do
export const hasFullscreenToggle = !isTauri; // desktop: native green button / Window menu
export const hasLanguageSwitcher = !isTauri; // desktop: native Language menu (see src-tauri)
export const hasInAppFooter = !isTauri; // desktop: author/source links live in the Help menu

// ---- Opening links ----

// Open a URL outside the app. The Tauri webview swallows window.open, so desktop hands the
// URL to the system browser; in a real browser it opens a tab/popup (popupFeatures as in
// window.open's third argument).
export async function openExternal(url: string, popupFeatures?: string): Promise<void> {
  if (isTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', popupFeatures);
  }
}

// ---- Native window ----

// Match the native window (incl. the macOS title bar) to the app theme. No-op in a browser.
export function setNativeTheme(theme: 'light' | 'dark'): void {
  if (!isTauri) return;
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme)).catch(() => {});
}

// Mirror `document.title` (which the views already set to the album name) into the native
// Tauri window title, so the title bar shows the open album. No-op in a browser — there the
// tab title is `document.title`, which is exactly what we want and is left untouched.
export function syncWindowTitle(): void {
  if (!isTauri) return;
  const titleEl = document.querySelector('title');
  if (!titleEl) return;
  import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const push = () => { void win.setTitle(document.title); };
      push(); // initial
      new MutationObserver(push).observe(titleEl, { childList: true, characterData: true, subtree: true });
    })
    .catch(() => { /* API unavailable */ });
}

// ---- Fullscreen ----
// In a browser this is the Fullscreen API; the Tauri webview ignores that API, so desktop
// drives the native window fullscreen instead.

export async function getFullscreen(): Promise<boolean> {
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return await getCurrentWindow().isFullscreen();
  }
  return !!document.fullscreenElement;
}

export async function setFullscreen(next: boolean): Promise<void> {
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setFullscreen(next);
    return;
  }
  if (next) await document.documentElement.requestFullscreen();
  else if (document.fullscreenElement) await document.exitFullscreen();
}

// Report external fullscreen changes — Esc in the browser, or the native green button on
// desktop (which resizes the window, hence onResized). Returns an unlisten function.
export async function watchFullscreen(cb: (fullscreen: boolean) => void): Promise<() => void> {
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    return await win.onResized(async () => cb(await win.isFullscreen()));
  }
  const sync = () => cb(!!document.fullscreenElement);
  document.addEventListener('fullscreenchange', sync);
  return () => document.removeEventListener('fullscreenchange', sync);
}

// ---- Durable preferences ----
// Desktop keeps a prefs.json in the app config dir via Rust (`pref_*` commands): WKWebView
// doesn't reliably persist localStorage for the custom tauri:// origin across launches.
// In a browser localStorage IS durable, so these are best-effort no-ops — callers keep their
// localStorage copy either way.

export async function prefGet(key: string): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string | null>('pref_get', { key });
  } catch { return null; }
}

export async function prefSet(key: string, value: string): Promise<void> {
  if (!isTauri) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('pref_set', { key, value });
  } catch { /* prefs are best-effort */ }
}

// ---- Native events ----

// Desktop only: the native "Language" menu (built in src-tauri) emits a `set-locale` event
// with the locale code. No-op in a browser (there the in-app switcher is shown instead).
export function onNativeLocale(cb: (code: string) => void): void {
  if (!isTauri) return;
  import('@tauri-apps/api/event')
    .then(({ listen }) => listen<string>('set-locale', (e) => cb(e.payload)))
    .catch(() => { /* API unavailable */ });
}

// ---- Credential storage ----
// Where the session blob lives matters (it holds tokens AND the userKeyPassword):
//   - browser: localStorage (personal machine only — plaintext, same as before)
//   - desktop: macOS Keychain via the keychain_* Tauri commands (never plaintext on disk)

export interface BlobStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

export function credentialStore(localKey: string): BlobStore {
  if (!isTauri) {
    return {
      async read() { return localStorage.getItem(localKey); },
      async write(value) { localStorage.setItem(localKey, value); },
      async clear() { localStorage.removeItem(localKey); },
    };
  }
  return {
    async read() {
      const { invoke } = await import('@tauri-apps/api/core');
      let raw = await invoke<string | null>('keychain_get');
      // One-time migration: earlier desktop builds kept the session in localStorage — move it
      // into the keychain and scrub the plaintext copy.
      if (!raw) {
        const legacy = localStorage.getItem(localKey);
        if (legacy) {
          await invoke('keychain_set', { value: legacy });
          localStorage.removeItem(localKey);
          raw = legacy;
        }
      }
      return raw;
    },
    async write(value) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('keychain_set', { value });
    },
    async clear() {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('keychain_delete');
    },
  };
}
