import './proton/polyfills'; // MUST be first — Buffer/global/process before SDK code loads

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { i18n } from './i18n';

import './composables/useTheme'; // sets <html data-theme> before mount (no flash)
import './assets/styles.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { syncWindowTitle } from './lib/host';
import { listenForNativeLocale } from './lib/nativeLocale';

syncWindowTitle();        // desktop only: album name → native window title (no-op in a browser)
listenForNativeLocale();  // desktop only: native Language menu → i18n

createApp(App)
    .use(router)
    .use(i18n)
    .mount('#app');
