import './proton/polyfills'; // MUST be first — Buffer/global/process before SDK code loads

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { i18n } from './i18n';

import './composables/useTheme'; // sets <html data-theme> before mount (no flash)
import './assets/styles.css';
import 'leaflet/dist/leaflet.css';

createApp(App)
    .use(router)
    .use(i18n)
    .mount('#app');
