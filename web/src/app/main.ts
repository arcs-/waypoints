import '@/domain/proton/polyfills'; // MUST be first — Buffer/global/process before SDK code loads

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { i18n, setLocale, SUPPORTED, type Locale } from '@/shared/i18n';

import '@/shared/ui/useTheme'; // sets <html data-theme> before mount (no flash)
import './assets/styles.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { syncWindowTitle, onNativeLocale } from '@/shared/host';

// Desktop-only wiring (each is a no-op in a browser):
syncWindowTitle(); // album name → native window title
onNativeLocale((code) => { // native Language menu → i18n
  if ((SUPPORTED as readonly string[]).includes(code)) setLocale(code as Locale);
});

createApp(App)
    .use(router)
    .use(i18n)
    .mount('#app');
