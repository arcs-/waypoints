import { onBeforeUnmount, onMounted, ref } from 'vue';

// Toggles the whole document into the browser's fullscreen mode (layout is unchanged —
// handy for presenting a trip on a big screen). Reflects external changes (e.g. Esc to exit).
export function useFullscreen() {
  const isFullscreen = ref(false);
  const sync = () => (isFullscreen.value = !!document.fullscreenElement);

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* user denied or unsupported */ }
  }

  onMounted(() => document.addEventListener('fullscreenchange', sync));
  onBeforeUnmount(() => document.removeEventListener('fullscreenchange', sync));

  return { isFullscreen, toggle };
}
