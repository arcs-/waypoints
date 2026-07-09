import { ref } from 'vue';
import { setNativeTheme } from '@/shared/host';
import { THEME_KEY as KEY } from '@/shared/lib/storageKeys';

// Manual light/dark theme, persisted. Applied as `data-theme` on <html>; Tailwind's `dark:`
// variant + the map CSS are keyed off that attribute (see styles.css @custom-variant).
type Theme = 'light' | 'dark';

function initial(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const theme = ref<Theme>(initial());

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  setNativeTheme(t);
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
