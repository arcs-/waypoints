import { onBeforeUnmount, onMounted, ref } from 'vue';
import { getFullscreen, setFullscreen, watchFullscreen } from '@/shared/host';

// Toggles fullscreen for "present on a big screen". The host decides how (Fullscreen API in
// a browser, native window fullscreen on desktop) and reports external changes — Esc in the
// browser, or the native green button on desktop.
export function useFullscreen() {
  const isFullscreen = ref(false);

  async function toggle() {
    try {
      const next = !(await getFullscreen());
      await setFullscreen(next);
      isFullscreen.value = next;
    } catch { /* user denied or unsupported */ }
  }

  let unlisten: (() => void) | undefined;
  onMounted(async () => {
    isFullscreen.value = await getFullscreen();
    unlisten = await watchFullscreen((v) => { isFullscreen.value = v; });
  });
  onBeforeUnmount(() => unlisten?.());

  return { isFullscreen, toggle };
}
