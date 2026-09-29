import type { APIRoute } from 'astro';
import { ehProducao, robots } from '../dominio/mapa-do-site.ts';

export const prerender = false;

export const GET: APIRoute = () => {
  // `base` so entra no texto quando ehProducao e verdade, e isso exige
  // SITE_BASE_URL apontando para o host canonico. Sem a variavel, nao ha
  // Sitemap no robots e `base` nao e usado -- por isso o vazio, e nao um host
  // literal (que o portao de portabilidade proibe em src/).
  const base = process.env.SITE_BASE_URL ?? '';
  return new Response(robots(base, ehProducao(process.env.SITE_BASE_URL)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
};
