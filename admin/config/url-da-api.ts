/**
 * URL base da API embutida no bundle.
 *
 * O padrao e RELATIVO: SPA e `/v1/admin` servidos na mesma origem
 * (`admin.bichu.app`), recomendacao de seguranca para a sessao em cookie
 * httpOnly. Sem host no bundle, o navegador fala sempre com a origem que
 * entregou a pagina.
 *
 * `VITE_API_BASE_URL` existe so como sobrescrita de desenvolvimento local. No
 * build de producao ela aceita apenas caminho relativo: URL absoluta ali
 * quebraria a mesma origem em silencio, entao reprova o build.
 */
export const API_PADRAO = '/v1';

/**
 * Para onde o servidor de desenvolvimento encaminha `/v1`. Nao vai para o
 * bundle (nao tem prefixo `VITE_`); vale so para `npm run dev`.
 */
export const PROXY_PADRAO = 'http://localhost:3000';

/** Reprova o build com motivo, em vez de embutir uma URL que nao funciona. */
export function urlDaApi(bruta: string | undefined, producao: boolean): string {
  const valor = bruta?.trim() || API_PADRAO;
  if (valor.startsWith('/') && !valor.startsWith('//')) return valor.replace(/\/+$/, '') || '/';
  if (producao) {
    throw new Error(
      `VITE_API_BASE_URL precisa ser caminho relativo no build de producao (SPA e API na mesma origem): "${valor}"`,
    );
  }
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`VITE_API_BASE_URL nao e caminho relativo nem URL absoluta: "${valor}"`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`VITE_API_BASE_URL precisa ser http(s): "${valor}"`);
  }
  return valor.replace(/\/+$/, '');
}
