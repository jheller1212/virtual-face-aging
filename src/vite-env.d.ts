/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SNAP_STAGING_TOKEN: string;
  readonly VITE_SNAP_PRODUCTION_TOKEN: string;
  readonly VITE_SNAP_LENS_GROUP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
