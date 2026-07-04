import { isTauri } from './platform';
import { SUPPORTED, setLocale, type Locale } from '@/i18n';

// Desktop only: the native "Language" menu (built in src-tauri) emits a `set-locale` event
// with the locale code; apply it to i18n. No-op in a browser (there the in-app switcher is used).
export function listenForNativeLocale() {
  if (!isTauri) return;
  import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen<string>('set-locale', (e) => {
        if ((SUPPORTED as readonly string[]).includes(e.payload)) setLocale(e.payload as Locale);
      }),
    )
    .catch(() => { /* not in Tauri / API unavailable */ });
}
