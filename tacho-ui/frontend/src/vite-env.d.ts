/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Maps JS API key. Set in tacho-ui/frontend/.env.local. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** Optional Google Maps Map ID for cloud-styled basemaps. */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
