import { ref } from 'vue';

// Manual light/dark theme, persisted. Applied as `data-theme` on <html>; Tailwind's `dark:`
// variant + the map CSS are keyed off that attribute (see styles.css @custom-variant).
type Theme = 'light' | 'dark';
const KEY = 'trips.theme';

function initial(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const theme = ref<Theme>(initial());
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  // In the Tauri desktop shell, match the native window (incl. the macOS title bar) to the theme.
  if (isTauri) {
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTheme(t)).catch(() => {});
  }
}
apply(theme.value); // run on module load (imported from main.ts) so there's no flash

export function useTheme() {
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, theme.value);
    apply(theme.value);
  }
  return { theme, toggle };
}
