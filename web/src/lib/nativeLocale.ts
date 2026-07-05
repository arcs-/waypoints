import { onNativeLocale } from './host';
import { SUPPORTED, setLocale, type Locale } from '@/i18n';

// Wire the host's native locale signal (desktop Language menu) into i18n. No-op in a browser.
export function listenForNativeLocale() {
  onNativeLocale((code) => {
    if ((SUPPORTED as readonly string[]).includes(code)) setLocale(code as Locale);
  });
}
