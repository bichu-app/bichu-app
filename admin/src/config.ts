/**
 * Configuracao lida no build, ja validada por config/url-da-api.ts. Em
 * producao a base da API e sempre relativa (`/v1` por padrao): SPA e API na
 * mesma origem.
 */
export const configuracao = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  /** De `config/hosts-externos.ts`: nenhum host de terceiro e literal em `src/`. */
  urlDosTiles: import.meta.env.VITE_URL_DOS_TILES,
  urlDaAtribuicaoDoMapa: import.meta.env.VITE_URL_DA_ATRIBUICAO_DO_MAPA,
  urlDoScriptDoCaptcha: import.meta.env.VITE_URL_DO_SCRIPT_DO_CAPTCHA,
} as const;
