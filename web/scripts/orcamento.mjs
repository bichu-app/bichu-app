#!/usr/bin/env node
// Orcamento que quebra o build (ADR-0028, item 10.4): por rota, HTML com CSS
// <= 30 KB e JavaScript inicial <= 30 KB, comprimidos.
//
// Mede o que o navegador baixa para pintar a primeira tela: o HTML e toda folha
// de estilo que ele liga (a regra do ADR fala em "CSS critico"; aqui entra o CSS
// inteiro, que e o mais conservador), e todo script de modulo que ele carrega,
// com os imports estaticos. Compressao gzip nivel 9, que perde para o brotli:
// se passa em gzip, passa no que a borda servir.
//
// As rotas do servidor sao renderizadas contra o mock gerado de api/openapi.yaml
// (tests/mock/), em cada estado. ROTA SEM MEDICAO REPROVA: toda pagina de
// src/pages precisa aparecer na tabela abaixo, ou o orcamento sai 1 dizendo qual.
//
// Pre-requisito: `npm run build`.

import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { CODIGOS, SENHAS, TOKENS } from '../tests/mock/cenarios.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(AQUI, '..');
// ORCAMENTO_TETO so existe para a isca da esteira (um teto de 1 KB PRECISA reprovar).
const TETO = Number(process.env.ORCAMENTO_TETO ?? 30 * 1024);
const PORTA_MOCK = 4499;
const PORTA_SITE = 4498;
const BASE = `http://127.0.0.1:${PORTA_SITE}`;

// arquivo de src/pages -> as URLs que o medem (um estado por URL nas rotas do servidor)
const MEDICOES = {
  'index.astro': ['/'],
  'comunidade.astro': ['/comunidade'],
  'como-funciona.astro': ['/como-funciona'],
  'para-profissionais.astro': ['/para-profissionais'],
  'sobre.astro': ['/sobre'],
  'contato.astro': ['/contato'],
  'termos.astro': ['/termos'],
  'privacidade.astro': ['/privacidade'],
  '404.astro': ['/nao-existe'],
  '500.astro': ['/500.html'],
  't/index.astro': ['/t'],
  't/[code].astro': [
    `/t/${CODIGOS.perdido}`,
    `/t/${CODIGOS.semFoto}`,
    `/t/${CODIGOS.malformado}`,
    `/t/${CODIGOS.inexistente}`,
    `/t/${CODIGOS.desativada}`,
    `/t/${CODIGOS.muitasTentativas}`,
    `/t/${CODIGOS.lento}`,
    `/t/${CODIGOS.foraDoAr}`,
    `/t/${CODIGOS.tipoInesperado}`,
    ['POST', `/t/${CODIGOS.perdido}`],
    ['POST', `/t/${CODIGOS.avisoLento}`],
  ],
  'verificar-email.astro': [`/verificar-email?token=${TOKENS.emailValido}`, ['POST', '/verificar-email', `token=${TOKENS.emailVencido}`]],
  'redefinir-senha.astro': [
    `/redefinir-senha?token=${TOKENS.senhaValido}`,
    `/redefinir-senha?token=${TOKENS.senhaVencido}`,
    // A senha vem da fixture do mock (SENHAS.vazada), fonte unica: e o valor que
    // faz o mock responder 422 `weak-password`, o estado que esta rota mede. Nao
    // repetir o literal aqui tambem evita que o gitleaks o leia como segredo.
    ['POST', '/redefinir-senha', `token=${TOKENS.senhaValido}&new_password=${SENHAS.vazada}`],
  ],
  'robots.txt.ts': ['/robots.txt'],
  'sitemap.xml.ts': ['/sitemap.xml'],
};

function paginas(dir, base = dir) {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    return statSync(c).isDirectory() ? paginas(c, base) : [relative(base, c)];
  });
}

const semMedicao = paginas(resolve(WEB, 'src/pages')).filter((p) => !MEDICOES[p]?.length);
if (semMedicao.length) {
  console.error(`ERRO: rota sem medicao no orcamento: ${semMedicao.join(', ')}. Acrescente em scripts/orcamento.mjs; rota que o orcamento nao mede reprova.`);
  process.exit(1);
}

function subir(comando, args, env, url) {
  const proc = spawn(process.execPath, [comando, ...args], { cwd: WEB, env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit'] });
  return {
    proc,
    pronto: (async () => {
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(url)).ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`nao subiu: ${comando}`);
    })(),
  };
}

const mock = subir('tests/mock/servidor-mock.mjs', [String(PORTA_MOCK)], {}, `http://127.0.0.1:${PORTA_MOCK}/__mock/pedidos`);
await mock.pronto;
const site = subir('servidor.mjs', [], {
  PORT: String(PORTA_SITE), HOST: '127.0.0.1', API_INTERNAL_URL: `http://127.0.0.1:${PORTA_MOCK}`,
  MEDIA_PUBLIC_BASE_URL: 'https://img.dominio-a-definir.com.br', SITE_BASE_URL: 'https://bichu.app',
}, `${BASE}/healthz`);
await site.pronto;

const cacheDeArquivo = new Map();
async function baixar(url) {
  if (!cacheDeArquivo.has(url)) {
    const r = await fetch(new URL(url, BASE));
    if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
    cacheDeArquivo.set(url, Buffer.from(await r.arrayBuffer()));
  }
  return cacheDeArquivo.get(url);
}

async function jsComImports(url, vistos = new Set()) {
  if (vistos.has(url)) return 0;
  vistos.add(url);
  const corpo = await baixar(url);
  let total = gzipSync(corpo, { level: 9 }).length;
  const texto = corpo.toString('utf8');
  for (const m of texto.matchAll(/(?:^|[;\s])import\s*(?:[^'"()]*from\s*)?["']([^"']+)["']/g)) {
    total += await jsComImports(new URL(m[1], new URL(url, BASE)).pathname, vistos);
  }
  return total;
}

const linhas = [];
let falhas = 0;
try {
  for (const [pagina, urls] of Object.entries(MEDICOES)) {
    for (const item of urls) {
      const [metodo, url, corpo] = Array.isArray(item) ? item : ['GET', item];
      const r = await fetch(new URL(url, BASE), {
        method: metodo,
        redirect: 'manual',
        headers: metodo === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded', origin: BASE } : {},
        body: metodo === 'POST' ? (corpo ?? `chave=${crypto.randomUUID()}`) : undefined,
      });
      const html = Buffer.from(await r.arrayBuffer());
      let css = 0;
      let js = 0;
      const texto = html.toString('utf8');
      for (const m of texto.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) css += gzipSync(await baixar(m[1]), { level: 9 }).length;
      const vistos = new Set();
      for (const m of texto.matchAll(/<script[^>]+src="([^"]+)"/g)) js += await jsComImports(m[1], vistos);
      const htmlCss = gzipSync(html, { level: 9 }).length + css;
      const passou = htmlCss <= TETO && js <= TETO;
      if (!passou) falhas += 1;
      linhas.push({ pagina, rota: `${metodo === 'POST' ? 'POST ' : ''}${url}`, status: r.status, htmlCss, js, passou });
    }
  }
} finally {
  site.proc.kill();
  mock.proc.kill();
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log('| rota | status | HTML + CSS (gzip) | JS inicial (gzip) | |');
console.log('|---|---|---|---|---|');
for (const l of linhas) console.log(`| ${l.rota} | ${l.status} | ${kb(l.htmlCss)} | ${kb(l.js)} | ${l.passou ? 'ok' : 'ESTOUROU'} |`);
if (falhas) {
  console.error(`\nERRO: ${falhas} rota(s) acima do teto de ${kb(TETO)} (ADR-0028, item 10.4).`);
  process.exit(1);
}
console.log(`\n${linhas.length} medicoes em ${Object.keys(MEDICOES).length} paginas, todas dentro de ${kb(TETO)} (HTML + CSS) e ${kb(TETO)} (JS).`);
