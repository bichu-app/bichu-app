/**
 * Os hosts de terceiros que o painel usa no navegador, fora de `src/`
 * (portao de portabilidade, docs/07-devops.md 3.9). O vite os embute no bundle
 * pela `define` de `vite.config.ts`; o codigo le `configuracao` em
 * `src/config.ts`, e nunca um literal.
 *
 * Cada um pode ser sobrescrito pelo ambiente do build (`VITE_*`), sempre em
 * `https:` e sem `userinfo`. A CSP da borda (`infra/caddy`) libera estes hosts
 * pelo nome exato: trocar aqui pede trocar la.
 */
export const HOSTS_PADRAO = {
  /** Tiles do mapa (ADR-0027 item 6), com `{z}`, `{x}` e `{y}`. */
  VITE_URL_DOS_TILES: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  /** Atribuicao que a politica de uso do OpenStreetMap exige visivel. */
  VITE_URL_DA_ATRIBUICAO_DO_MAPA: 'https://www.openstreetmap.org/copyright',
  /** Script do reCAPTCHA Enterprise (D41), so no documento `/entrar/`. */
  VITE_URL_DO_SCRIPT_DO_CAPTCHA: 'https://www.google.com/recaptcha/enterprise.js',
} as const;

export type ChaveDeHost = keyof typeof HOSTS_PADRAO;

/** Valor do ambiente ou o padrao, recusando o que nao for `https:` limpo. */
export function hostsExternos(env: Partial<Record<string, string>>): Record<ChaveDeHost, string> {
  const saida = {} as Record<ChaveDeHost, string>;
  for (const chave of Object.keys(HOSTS_PADRAO) as ChaveDeHost[]) {
    const valor = env[chave]?.trim() || HOSTS_PADRAO[chave];
    const url = new URL(valor.replace(/\{[xyz]\}/g, '0'));
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error(`${chave} precisa ser https: sem usuario nem senha: "${valor}"`);
    }
    saida[chave] = valor;
  }
  return saida;
}
