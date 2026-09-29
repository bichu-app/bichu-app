// Protecao dos formularios contra envio a partir de outro site (CSRF), por
// Fetch Metadata.
//
// POR QUE NAO A CONFERENCIA DE ORIGEM DO ASTRO (`security.checkOrigin`): o ADR-0028
// (item 7) exige `Referrer-Policy: no-referrer` em toda resposta, para o token
// da query nunca sair no Referer. Com essa politica, o navegador manda
// `Origin: null` em TODO POST de formulario, inclusive do proprio site (Fetch,
// "serializing a request origin"), e a conferencia do Astro recusa com 403 o
// aviso legitimo. Medido no Chromium em 23/09/2026.
//
// O `Sec-Fetch-Site` nao depende da politica de referer: todo navegador atual o
// manda, e ele diz se o pedido nasceu no mesmo site. Recusa-se o que vier
// declaradamente de outro site; navegador antigo, que nao manda o cabecalho,
// passa, como passaria sem protecao nenhuma. Nenhuma destas paginas usa cookie
// ou sessao, entao o que se protege aqui e so o teto por IP da API de ser
// distribuido pelos visitantes de um site hostil.
import { defineMiddleware } from 'astro:middleware';

const PERMITIDOS = new Set(['same-origin', 'same-site', 'none']);

export const onRequest = defineMiddleware((contexto, seguir) => {
  if (contexto.request.method === 'POST') {
    const site = contexto.request.headers.get('sec-fetch-site');
    if (site && !PERMITIDOS.has(site)) {
      return new Response('Envio de outro site recusado.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  }
  return seguir();
});
