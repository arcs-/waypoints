import { onBeforeUnmount, onMounted, ref } from 'vue';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Toggles fullscreen for "present on a big screen". In a browser this uses the Fullscreen API;
// in the Tauri desktop shell (whose webview ignores that API) it drives the native window
// fullscreen instead. Both reflect external changes — Esc in the browser, or the native green
// button on desktop.
export function useFullscreen() {
  const isFullscreen = ref(false);

  async function toggle() {
    if (isTauri) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      const next = !(await win.isFullscreen());
      await win.setFullscreen(next);
      isFullscreen.value = next;
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* user denied or unsupported */ }
  }

  const sync = () => (isFullscreen.value = !!document.fullscreenElement);
  let unlisten: (() => void) | undefined;

  onMounted(async () => {
    if (isTauri) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      isFullscreen.value = await win.isFullscreen();
      // The window resizes when fullscreen toggles (incl. via the native green button) — re-sync.
      unlisten = await win.onResized(async () => { isFullscreen.value = await win.isFullscreen(); });
    } else {
      document.addEventListener('fullscreenchange', sync);
    }
  });
  onBeforeUnmount(() => {
    if (isTauri) unlisten?.();
    else document.removeEventListener('fullscreenchange', sync);
  });

  return { isFullscreen, toggle };
}
