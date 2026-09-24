/* global process, URL, performance */
// Servidor minimo do site (ADR-0028, item 7). Tres responsabilidades, e so
// elas:
//
//   1. cabecalhos de seguranca em TODA resposta, inclusive nas paginas
//      pre-renderizadas (que nao passam pelo middleware do Astro, e onde
//      `frame-ancestors` nao vale em <meta>);
//   2. os arquivos do build (`dist/client`), com cache imutavel so para o que
//      tem hash no nome;
//   3. o resto para o adaptador Node do Astro, em modo `middleware`.
//
// Mais `GET /healthz`, que e o que o compose e o Dockerfile sondam.
//
// Nao ha dependencia alem do Node: o servidor que entra na imagem final e este
// arquivo, `dist/` e as dependencias de producao.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORTA = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? '0.0.0.0';
const RAIZ = fileURLToPath(new URL('./dist/client/', import.meta.url));

// O adaptador so gera o ponto de entrada do servidor quando existe rota
// renderizada no servidor. Sem ele, tudo que nao e arquivo vira 404.
let astro = null;
try {
  ({ handler: astro } = await import('./dist/server/entry.mjs'));
} catch (erro) {
  if (erro?.code !== 'ERR_MODULE_NOT_FOUND') throw erro;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
};

// Producao e so o host canonico. Em qualquer outro (homologacao, local, CI),
// toda resposta sai com `X-Robots-Tag: noindex` (ADR-0028, item 11, e ADR-0029):
// e o que impede a copia de homologacao de entrar no indice sem depender de
// cada pagina lembrar.
const PRODUCAO = (() => {
  try {
    return new URL(process.env.SITE_BASE_URL ?? '').hostname === 'bichu.app';
  } catch {
    return false;
  }
})();

const FRAME = "frame-ancestors 'none'";

// `frame-ancestors` nao vale em <meta>, entao ele sai daqui em toda resposta.
// Nas rotas do servidor o Astro escreve a propria CSP no mesmo cabecalho, e ela
// sobrescreveria esta: por isso a diretiva e costurada em qualquer CSP que o
// Astro mandar, em vez de so definida antes.
function comFrameAncestors(valor) {
  const texto = Array.isArray(valor) ? valor.join('; ') : String(valor ?? '');
  if (/frame-ancestors/i.test(texto)) return texto;
  const base = texto.trim().replace(/;\s*$/, '');
  return base ? `${base}; ${FRAME}` : FRAME;
}

function cabecalhosDeSeguranca(res) {
  res.setHeader('Content-Security-Policy', FRAME);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!PRODUCAO) res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const setHeader = res.setHeader.bind(res);
  res.setHeader = (nome, valor) => {
    const n = String(nome).toLowerCase();
    if (n === 'content-security-policy') return setHeader(nome, comFrameAncestors(valor));
    if (n === 'x-robots-tag' && !PRODUCAO) return setHeader(nome, 'noindex, nofollow');
    return setHeader(nome, valor);
  };
  const writeHead = res.writeHead.bind(res);
  res.writeHead = (status, ...resto) => {
    const cabecalhos = resto.find((r) => r && typeof r === 'object');
    if (cabecalhos && !Array.isArray(cabecalhos)) {
      for (const nome of Object.keys(cabecalhos)) {
        if (nome.toLowerCase() === 'content-security-policy') cabecalhos[nome] = comFrameAncestors(cabecalhos[nome]);
        // Fora de producao o noindex do servidor prevalece sobre o da pagina.
        if (!PRODUCAO && nome.toLowerCase() === 'x-robots-tag') cabecalhos[nome] = 'noindex, nofollow';
      }
    }
    return writeHead(status, ...resto);
  };
}

// Resolve o caminho pedido DENTRO de `dist/client`, ou devolve null. Caminho
// que escapa da raiz (`..`, barra invertida, byte nulo) nunca chega ao disco.
async function arquivoDo(caminho) {
  let decodificado;
  try {
    decodificado = decodeURIComponent(caminho);
  } catch {
    return null;
  }
  if (decodificado.includes('\0')) return null;
  const alvo = normalize(join(RAIZ, decodificado));
  if (alvo !== RAIZ.slice(0, -1) && !alvo.startsWith(RAIZ)) return null;
  for (const candidato of [alvo, join(alvo, 'index.html')]) {
    if (!candidato.startsWith(RAIZ)) continue;
    const info = await stat(candidato).catch(() => null);
    if (info?.isFile()) return { arquivo: candidato, tamanho: info.size };
  }
  return null;
}

function servirArquivo(req, res, { arquivo, tamanho }, status = 200) {
  const comHash = arquivo.startsWith(join(RAIZ, '_astro') + sep);
  res.statusCode = status;
  res.setHeader('Content-Type', TIPOS[extname(arquivo)] ?? 'application/octet-stream');
  res.setHeader('Content-Length', tamanho);
  res.setHeader(
    'Cache-Control',
    status !== 200 ? 'no-store' : comHash ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
  );
  if (req.method === 'HEAD') return res.end();
  createReadStream(arquivo).pipe(res);
}

async function naoEncontrado(req, res) {
  const pagina = await arquivoDo('/404.html');
  if (pagina) return servirArquivo(req, res, pagina, 404);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end('nao encontrado');
}

function registrar(req, res, inicio) {
  process.stdout.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      correlation_id: req.headers['x-correlation-id'] ?? null,
      method: req.method,
      path: (req.url ?? '').split('?')[0],
      status: res.statusCode,
      ms: Math.round(performance.now() - inicio),
    }) + '\n',
  );
}

const servidor = createServer(async (req, res) => {
  const inicio = performance.now();
  res.on('finish', () => registrar(req, res, inicio));
  cabecalhosDeSeguranca(res);
  try {
    const caminho = new URL(req.url ?? '/', 'http://site').pathname;

    if (caminho === '/healthz') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end('ok');
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const arquivo = await arquivoDo(caminho);
      if (arquivo) return servirArquivo(req, res, arquivo);
    }

    if (astro) return astro(req, res, () => naoEncontrado(req, res));
    return naoEncontrado(req, res);
  } catch (erro) {
    process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), erro: String(erro?.stack ?? erro) })}\n`);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Cache-Control', 'no-store');
    }
    res.end();
  }
});

servidor.listen(PORTA, HOST, () => {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), msg: 'site no ar', porta: PORTA, ssr: Boolean(astro) }) + '\n');
});

// O processo e o PID 1 do container: SIGTERM precisa fechar o servidor e sair,
// ou o `docker stop` espera os 10 s e mata.
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => servidor.close(() => process.exit(0)));
}
