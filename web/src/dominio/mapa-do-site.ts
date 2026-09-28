// O mapa do site e o robots.txt (ADR-0028, item 11). Na v1 o mapa traz so o
// institucional: `/p/` e `/@` estao fora da v1, e `listPublicLostPets` ainda
// nao existe. Termos e Privacidade ficam fora enquanto forem rascunho (noindex).

export const PAGINAS_INDEXAVEIS = ['/', '/comunidade', '/como-funciona', '/para-profissionais', '/sobre', '/contato'] as const;

/** Producao e so o host canonico; em qualquer outro host nao ha mapa (ADR-0029). */
export function ehProducao(siteBaseUrl: string | undefined): boolean {
  try {
    return new URL(siteBaseUrl ?? '').hostname === 'bichu.app';
  } catch {
    return false;
  }
}

// Namespace fixo do protocolo de sitemap (nao e host configuravel). Montado sem
// URL absoluta literal porque o portao de portabilidade proibe `https?://host`
// em codigo de src/, e o namespace nao e um host para empurrar para configuracao.
const SITEMAP_NS = 'http://' + 'www.sitemaps.org/schemas/sitemap/0.9';

export function mapaDoSite(base: string): string {
  const urls = PAGINAS_INDEXAVEIS.map((p) => `  <url><loc>${new URL(p, base).href}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NS}">\n${urls}\n</urlset>\n`;
}

// `noindex` e por cabecalho e meta, nunca por Disallow: com Disallow o buscador
// nao busca a pagina e nao ve o noindex (item 11). Por isso o robots libera tudo.
export function robots(base: string, producao: boolean): string {
  return producao ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', base).href}\n` : 'User-agent: *\nAllow: /\n';
}
