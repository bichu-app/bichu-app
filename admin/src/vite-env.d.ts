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
  /** Hosts de terceiros, de `config/hosts-externos.ts`, fixados no build. */
  readonly VITE_URL_DOS_TILES: string;
  readonly VITE_URL_DA_ATRIBUICAO_DO_MAPA: string;
  readonly VITE_URL_DO_SCRIPT_DO_CAPTCHA: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
