import './proton/polyfills'; // MUST be first — Buffer/global/process before SDK code loads
import { createApp } from 'vue';
import App from './App.vue';
import './assets/styles.css';
import 'leaflet/dist/leaflet.css';

createApp(App).mount('#app');
