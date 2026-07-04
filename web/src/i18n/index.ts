import { createI18n } from 'vue-i18n';
import en from './locales/en';
import de from './locales/de';
import fr from './locales/fr';

export const SUPPORTED = ['en', 'de', 'fr'] as const;
export type Locale = (typeof SUPPORTED)[number];

const KEY = 'trips.locale';
const isSupported = (v: string): v is Locale => (SUPPORTED as readonly string[]).includes(v);

function detect(): Locale {
  const saved = localStorage.getItem(KEY);
  if (saved && isSupported(saved)) return saved;
  const nav = navigator.language.slice(0, 2).toLowerCase();
  return isSupported(nav) ? nav : 'en';
}

const locale = detect();

export const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: 'en',
  messages: { en, de, fr },
});

document.documentElement.lang = locale;

export function setLocale(next: Locale) {
  i18n.global.locale.value = next;
  localStorage.setItem(KEY, next);
  document.documentElement.lang = next;
}
