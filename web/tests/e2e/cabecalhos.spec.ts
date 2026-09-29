// Assercao de cabecalho por rota (ADR-0028, item 10.6; P10 de docs/04-seguranca.md):
// CSP sem 'unsafe-inline', frame-ancestors 'none', noindex e no-store onde o
// item 2 manda, og: generica em /t/. E a regra de homologacao: fora de
// bichu.app, tudo sai com noindex (ADR-0029).
import { test, expect, type APIResponse } from '@playwright/test';
import { CODIGOS, TOKENS } from './apoio.ts';

const HML = 'http://127.0.0.1:4323';
const INSTITUCIONAL = ['/', '/comunidade', '/como-funciona', '/para-profissionais', '/sobre', '/contato'];
const PUBLICAS = [`/t/${CODIGOS.perdido}`, `/t/${CODIGOS.desativada}`, `/verificar-email?token=${TOKENS.emailValido}`, `/redefinir-senha?token=${TOKENS.senhaValido}`];

function cspDe(r: APIResponse, html: string) {
  const cabecalho = r.headers()['content-security-policy'] ?? '';
  const meta = /<meta http-equiv="content-security-policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  return { cabecalho, meta, junta: `${cabecalho};${meta}` };
}

test('todas as rotas: CSP fechada, frame-ancestors, nosniff e sem Referer', async ({ request }) => {
  for (const rota of [...INSTITUCIONAL, '/termos', '/privacidade', ...PUBLICAS, '/nao-existe']) {
    const r = await request.get(rota, { maxRedirects: 0 });
    const html = await r.text();
    const { cabecalho, junta } = cspDe(r, html);
    expect(cabecalho, rota).toContain("frame-ancestors 'none'");
    expect(junta, rota).toContain("default-src 'none'");
    expect(junta, rota).toContain("base-uri 'none'");
    expect(junta, rota).toContain("form-action 'self'");
    expect(junta, rota).not.toContain('unsafe-inline');
    expect(junta, rota).not.toContain('unsafe-eval');
    expect(r.headers()['x-content-type-options'], rota).toBe('nosniff');
    expect(r.headers()['referrer-policy'], rota).toBe('no-referrer');
    // Nenhum script, fonte ou folha de terceiro.
    expect(html, rota).not.toMatch(/<script[^>]+src="https?:\/\//);
    expect(html, rota).not.toMatch(/<link[^>]+rel="(stylesheet|preload|modulepreload)"[^>]+href="https?:\/\//);
  }
});

test('institucional em producao: indexavel, canonico, og da pagina e cache revalidado', async ({ request }) => {
  for (const rota of INSTITUCIONAL) {
    const r = await request.get(rota);
    const html = await r.text();
    expect(r.status(), rota).toBe(200);
    expect(r.headers()['x-robots-tag'], rota).toBeUndefined();
    expect(html, rota).toContain('<meta name="robots" content="index, follow">');
    expect(html, rota).toContain(`<link rel="canonical" href="https://bichu.app${rota === '/' ? '/' : rota}">`);
    expect(html, rota).toMatch(/<meta property="og:image" content="https:\/\/bichu\.app\/_astro\/[^"]+\.jpe?g">/);
    expect(r.headers()['cache-control'], rota).toBe('public, max-age=0, must-revalidate');
  }
});

test('termos e privacidade: noindex enquanto forem rascunho', async ({ request }) => {
  for (const rota of ['/termos', '/privacidade']) {
    const html = await (await request.get(rota)).text();
    expect(html, rota).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html, rota).toContain('Rascunho — pendente de revisão jurídica');
  }
});

test('rotas publicas: noindex por cabecalho e meta, no-store, og generica', async ({ request }) => {
  for (const rota of PUBLICAS) {
    const r = await request.get(rota);
    const html = await r.text();
    expect(r.headers()['x-robots-tag'], rota).toBe('noindex, nofollow');
    expect(html, rota).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(r.headers()['cache-control'], rota).toBe('no-store');
    expect(html, rota).not.toContain('og:image');
    expect(html, rota).not.toContain('og:url');
  }
  // og generica em /t/: o nome do pet nao vai para a previa do link.
  const t = await (await request.get(`/t/${CODIGOS.perdido}`)).text();
  expect(/<meta property="og:(title|description)" content="[^"]*Thor/.test(t)).toBe(false);
});

test('404: status, noindex e sem cache', async ({ request }) => {
  const r = await request.get('/nao-existe-mesmo');
  expect(r.status()).toBe(404);
  expect(await r.text()).toContain('<meta name="robots" content="noindex, nofollow">');
});

test('robots.txt e mapa do site: libera tudo, mapa so com o institucional', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).not.toContain('Disallow');
  expect(robots).toContain('Sitemap: https://bichu.app/sitemap.xml');
  const mapa = await (await request.get('/sitemap.xml')).text();
  for (const rota of INSTITUCIONAL) expect(mapa).toContain(`<loc>https://bichu.app${rota}</loc>`);
  expect(mapa).not.toMatch(/\/t\/|\/p\/|\/@|termos|privacidade/);
});

test('homologacao: toda resposta com noindex, e sem mapa do site', async ({ request }) => {
  for (const rota of ['/', '/comunidade', `/t/${CODIGOS.perdido}`, '/robots.txt']) {
    const r = await request.get(`${HML}${rota}`);
    expect(r.headers()['x-robots-tag'], rota).toBe('noindex, nofollow');
  }
  expect((await request.get(`${HML}/sitemap.xml`)).status()).toBe(404);
  expect(await (await request.get(`${HML}/robots.txt`)).text()).not.toContain('Sitemap');
});

test('formulario enviado de outro site e recusado (Sec-Fetch-Site), o do proprio site passa', async ({ request }) => {
  const cruzado = await request.post(`/t/${CODIGOS.perdido}`, {
    form: { chave: '11111111-1111-4111-8111-111111111111' },
    headers: { 'sec-fetch-site': 'cross-site', origin: 'null' },
  });
  expect(cruzado.status()).toBe(403);
  const proprio = await request.post(`/verificar-email`, {
    form: { token: TOKENS.emailValido },
    headers: { 'sec-fetch-site': 'same-origin', origin: 'null' },
  });
  expect(proprio.status()).toBe(200);
});
