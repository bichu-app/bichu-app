import type { APIRoute } from 'astro';
import { ehProducao, mapaDoSite } from '../dominio/mapa-do-site.ts';

export const prerender = false;

export const GET: APIRoute = () => {
  const base = process.env.SITE_BASE_URL;
  if (!ehProducao(base) || !base) {
    return new Response('nao encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  return new Response(mapaDoSite(base), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
};
