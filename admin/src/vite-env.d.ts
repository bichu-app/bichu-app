/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base da API, validada e fixada no build por vite.config.ts. */
  readonly VITE_API_BASE_URL: string;
  /**
   * Chave de site do reCAPTCHA Enterprise (D41), publica por natureza. Lida so
   * pelo documento `/entrar/`. Ausente no build de producao, o login mostra
   * "A verificacao de seguranca do login nao carregou" (1.9).
   */
  readonly VITE_CAPTCHA_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
