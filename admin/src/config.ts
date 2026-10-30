/** Configuracao lida no build, ja validada por config/url-da-api.ts. */
export const configuracao = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  /** De `config/hosts-externos.ts`: nenhum host de terceiro e literal em `src/`. */
  urlDoScriptDoCaptcha: import.meta.env.VITE_URL_DO_SCRIPT_DO_CAPTCHA,
  /** Base de perfil do Instagram, usada so para montar o EXEMPLO do campo. */
  urlDoPerfilDoInstagram: import.meta.env.VITE_URL_DO_PERFIL_DO_INSTAGRAM,
} as const;
