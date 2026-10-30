/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base da API, validada e fixada no build por vite.config.ts. */
  readonly VITE_API_BASE_URL: string;
  /** Chave de site do reCAPTCHA Enterprise (D41), publica por natureza. */
  readonly VITE_CAPTCHA_SITE_KEY?: string;
  /** Hosts de terceiros, de `config/hosts-externos.ts`, fixados no build. */
  readonly VITE_URL_DO_SCRIPT_DO_CAPTCHA: string;
  readonly VITE_URL_DO_PERFIL_DO_INSTAGRAM: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
