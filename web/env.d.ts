/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** MapTiler API key — reverse geocoding only. Restrict it to this domain in the MapTiler dashboard. */
  readonly VITE_MAPTILER_KEY: string;
  /** Protomaps API key for the vector basemap. Set allowed origins in the Protomaps portal. */
  readonly VITE_PROTOMAPS_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
