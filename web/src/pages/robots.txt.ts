import type { APIRoute } from 'astro';
import { ehProducao, robots } from '../dominio/mapa-do-site.ts';

export const prerender = false;

export const GET: APIRoute = () => {
  const base = process.env.SITE_BASE_URL ?? 'https://bichu.app';
  return new Response(robots(base, ehProducao(process.env.SITE_BASE_URL)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
};
