/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_X402_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
