/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base da API, validada e fixada no build por vite.config.ts. */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
