/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** MapTiler API key — reverse geocoding only. Restrict it to this domain in the MapTiler dashboard. */
  readonly VITE_MAPTILER_KEY: string;
  /** Protomaps API key for the vector basemap. Set allowed origins in the Protomaps portal. */
  readonly VITE_PROTOMAPS_KEY: string;
  /** Photos root share id for deep links into Proton's web app (optional — see proton/link.ts). */
  readonly VITE_PROTON_PHOTOS_SHARE_ID?: string;
  /** Account index in Proton's multi-account URLs (`/u/<slot>/`). Defaults to 0. */
  readonly VITE_PROTON_ACCOUNT_SLOT?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/** App version, injected from package.json at build time (vite define). */
declare const __APP_VERSION__: string;
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
