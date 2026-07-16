/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG_DIALOGUE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
