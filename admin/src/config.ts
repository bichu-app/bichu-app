/**
 * Configuracao lida no build, ja validada por config/url-da-api.ts. Em
 * producao a base da API e sempre relativa (`/v1` por padrao): SPA e API na
 * mesma origem.
 */
export const configuracao = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
} as const;
