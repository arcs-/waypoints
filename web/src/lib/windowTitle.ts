// Desktop-only: mirror `document.title` (which the views already set to the album name) into
// the native Tauri window title, so the title bar shows the open album. No-op in a browser —
// there the tab title is `document.title`, which is exactly what we want and is left untouched.
export function syncWindowTitle() {
  if (!('__TAURI_INTERNALS__' in window)) return;
  const titleEl = document.querySelector('title');
  if (!titleEl) return;
  import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const push = () => { void win.setTitle(document.title); };
      push(); // initial
      new MutationObserver(push).observe(titleEl, { childList: true, characterData: true, subtree: true });
    })
    .catch(() => { /* not in Tauri / API unavailable */ });
}
