/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** MapTiler API key for the basemap tiles. Restrict it to this domain in the MapTiler dashboard. */
  readonly VITE_MAPTILER_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
