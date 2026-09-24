#!/usr/bin/env node
// A borda entrega o backoffice como a seguranca pediu, PELA BORDA DE PE.
//
// docs/04-seguranca.md secao 22: D33 (superficie administrativa so no host
// administrativo), D34 (mesma origem, sem CORS), D41 (CSP propria so no login)
// e D48 (cabecalhos do host administrativo). E a metade de COMPORTAMENTO da
// prova P15/P18; a metade de LEITURA do arquivo esta em `verificar_borda.py`.
//
// Por que as duas: a leitura vale para todo bloco, inclusive os que ainda nao
// existem, e nao ve o que o Caddy faz de fato (ordem de `handle`, `header` que
// nao chega ao erro, fallback da SPA engolindo `/assets/`). Esta sonda ve, mas
// so para os hosts que ela recebe. Uma nao substitui a outra.
//
// ONDE RODA: dentro da rede do compose, com o Node da imagem da API (mesmo
// digest), porque o host administrativo local e `http://admin.localhost` na
// porta 80 de DENTRO da borda, que a pilha nao publica -- e o `wget` do
// BusyBox nao manda `OPTIONS` nem mostra cabecalho de resposta de erro, que e
// exatamente o que o 404 da borda precisa provar.
//
//   docker run --rm --network <projeto>_default -v "$PWD/infra/verificacao:/v:ro" \
//     node:22-bookworm-slim@sha256:... node /v/verificar-backoffice-na-borda.mjs \
//     --admin http://edge:80 --admin-host admin.localhost \
//     --app http://edge:3000 --app-host localhost:3000 [--eco]
//
// `--eco`: a API atras da borda e o eco de teste (`compose.sonda-do-backoffice.yaml`), que
// devolve no corpo os cabecalhos internos que recebeu. So com ele da para
// provar que `X-Internal-Surface: admin` chega e que o forjado nao chega. Sem
// ele, as asserções de eco NAO rodam e a saida diz isso.
//
//   node verificar-backoffice-na-borda.mjs --autoteste   (sem rede: as iscas)
//
// Saida: 0 aprovado, 1 reprovado. Quando nao consegue verificar, reprova.

import http from 'node:http';

const CABECALHOS_DO_HOST_ADMIN = [
  ['strict-transport-security', /max-age=\d{8,}/],
  ['x-frame-options', /^DENY$/],
  ['x-content-type-options', /^nosniff$/],
  ['referrer-policy', /^no-referrer$/],
  ['permissions-policy', /camera=\(\)/],
  ['cross-origin-opener-policy', /^same-origin$/],
  ['cross-origin-resource-policy', /^same-origin$/],
  ['x-robots-tag', /noindex/],
  ['content-security-policy', /frame-ancestors 'none'/],
];

const PROIBIDO_NA_CSP_DA_SPA = [/'unsafe-inline'/, /'unsafe-eval'/, /(^|\s)\*(\s|;|$)/, /google/i, /gstatic/i];

function pedir(base, host, caminho, { metodo = 'GET', cabecalhos = {} } = {}) {
  const url = new URL(caminho, base);
  return new Promise((resolver, rejeitar) => {
    const req = http.request(
      {
        host: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: metodo,
        headers: { host, ...cabecalhos },
        timeout: 10_000,
      },
      (res) => {
        const partes = [];
        res.on('data', (p) => partes.push(p));
        res.on('end', () =>
          resolver({ status: res.statusCode, cabecalhos: res.headers, corpo: Buffer.concat(partes).toString('utf8') }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error(`tempo esgotado em ${metodo} ${host}${caminho}`)));
    req.on('error', rejeitar);
    req.end();
  });
}

const tipo = (r) => String(r.cabecalhos['content-type'] ?? '');
const cabecalho = (r, nome) => r.cabecalhos[nome];

/**
 * O juizo, puro. Recebe as respostas ja coletadas e devolve a lista de falhas.
 * Separado da rede para o autoteste poder alimenta-lo com respostas erradas.
 */
export function julgar(r, { eco }) {
  const falhas = [];
  const exigir = (cond, msg) => {
    if (!cond) falhas.push(msg);
  };

  // --- host administrativo: a SPA ---
  exigir(r.adminRaiz.status === 200 && tipo(r.adminRaiz).startsWith('text/html'),
    `admin /: esperado 200 text/html, veio ${r.adminRaiz.status} ${tipo(r.adminRaiz)}`);
  exigir(cabecalho(r.adminRaiz, 'cache-control') === 'no-store',
    `admin /: Cache-Control precisa ser no-store (D48), veio '${cabecalho(r.adminRaiz, 'cache-control')}'`);
  for (const [chave, resp] of [['admin /', r.adminRaiz], ['admin /assets/<js>', r.adminAsset], ['admin /v1/admin/...', r.adminApi]]) {
    for (const [nome, forma] of CABECALHOS_DO_HOST_ADMIN) {
      const valor = cabecalho(resp, nome);
      exigir(valor !== undefined && forma.test(String(valor)),
        `${chave}: cabecalho \`${nome}\` ausente ou fora da forma ${forma} (D48): '${valor ?? ''}'`);
    }
    exigir(cabecalho(resp, 'server') === undefined, `${chave}: a borda deixou \`Server\` na resposta`);
  }
  const cspSpa = String(cabecalho(r.adminRaiz, 'content-security-policy') ?? '');
  exigir(/script-src 'self'(;|$)/.test(cspSpa), `admin /: CSP sem \`script-src 'self'\` exato: '${cspSpa}'`);
  for (const proibido of PROIBIDO_NA_CSP_DA_SPA) {
    exigir(!proibido.test(cspSpa), `admin /: a CSP da SPA contem ${proibido} (D48): '${cspSpa}'`);
  }
  const cspLogin = String(cabecalho(r.adminLogin, 'content-security-policy') ?? '');
  exigir(/www\.google\.com\/recaptcha\//.test(cspLogin) && /frame-ancestors 'none'/.test(cspLogin),
    `admin /entrar/: a CSP do login precisa admitir o reCAPTCHA e manter frame-ancestors 'none' (D41): '${cspLogin}'`);
  exigir(!/'unsafe-inline'|'unsafe-eval'/.test(cspLogin), `admin /entrar/: CSP do login com unsafe-*: '${cspLogin}'`);

  exigir(r.adminRotaDeCliente.status === 200 && tipo(r.adminRotaDeCliente).startsWith('text/html'),
    `admin rota de cliente: esperado o index.html com 200 (fallback da SPA), veio ${r.adminRotaDeCliente.status} ${tipo(r.adminRotaDeCliente)}`);
  exigir(r.adminAsset.status === 200 && /javascript/.test(tipo(r.adminAsset)),
    `admin /assets/<js>: esperado 200 JavaScript, veio ${r.adminAsset.status} ${tipo(r.adminAsset)}`);
  exigir(/immutable/.test(String(cabecalho(r.adminAsset, 'cache-control') ?? '')),
    `admin /assets/<js>: arquivo com hash sem \`immutable\`: '${cabecalho(r.adminAsset, 'cache-control')}'`);
  exigir(r.adminAssetSumido.status === 404,
    `admin /assets/<inexistente>: esperado 404, veio ${r.adminAssetSumido.status} ${tipo(r.adminAssetSumido)}. O fallback da SPA esta engolindo /assets/, e o navegador vai executar HTML como JavaScript`);
  exigir(!/immutable/.test(String(cabecalho(r.adminAssetSumido, 'cache-control') ?? '')),
    'admin /assets/<inexistente>: o 404 saiu com `immutable` e ficaria um ano no navegador');

  // --- host administrativo: a API na mesma origem ---
  exigir(r.adminApi.status !== 404 || !tipo(r.adminApi).startsWith('text/plain'),
    `admin /v1/admin/...: a borda respondeu 404 em texto puro; o host administrativo precisa REPASSAR /v1/admin/* a API`);
  exigir(cabecalho(r.adminApi, 'cache-control') === 'no-store',
    `admin /v1/admin/...: Cache-Control precisa ser no-store (D48), veio '${cabecalho(r.adminApi, 'cache-control')}'`);
  exigir(r.adminOutraApi.status === 404 && tipo(r.adminOutraApi).startsWith('text/plain'),
    `admin /v1/health: o host administrativo nao e endereco da API inteira; esperado 404 da borda, veio ${r.adminOutraApi.status} ${tipo(r.adminOutraApi)}`);
  if (eco) {
    exigir(/surface=\[admin\]/.test(r.adminApi.corpo),
      `admin /v1/admin/...: a API nao recebeu \`X-Internal-Surface: admin\` (D33). Corpo do eco: ${r.adminApi.corpo}`);
    exigir(/forjado=\[\]/.test(r.adminApi.corpo),
      `admin /v1/admin/...: um \`X-Internal-*\` mandado pelo cliente chegou a API (D33). Corpo do eco: ${r.adminApi.corpo}`);
  }

  // --- host da aplicacao: a superficie administrativa nao existe aqui (D33) ---
  for (const [chave, resp] of [['app /v1/admin/ping', r.appAdmin], ['app /v1/admin', r.appAdminSemBarra], ['app OPTIONS /v1/admin/ping', r.appAdminOptions]]) {
    exigir(resp.status === 404 && tipo(resp).startsWith('text/plain'),
      `${chave}: esperado 404 text/plain DA BORDA, veio ${resp.status} ${tipo(resp)}. Com application/problem+json quem respondeu foi a APLICACAO, que e o estado medido em hml.bichu.app em 23/09`);
  }

  // --- CORS em lugar nenhum (D34) ---
  for (const [chave, resp] of Object.entries(r)) {
    exigir(cabecalho(resp, 'access-control-allow-origin') === undefined,
      `${chave}: resposta com Access-Control-Allow-Origin '${cabecalho(resp, 'access-control-allow-origin')}'. Mesma origem, sem CORS (D34)`);
  }
  return falhas;
}

// ---------------------------------------------------------------------------
// Autoteste: cada isca e uma coleta CERTA com um defeito so, e precisa reprovar
// ---------------------------------------------------------------------------

function respostaCerta() {
  const csp = "default-src 'none'; script-src 'self'; style-src 'self'; frame-ancestors 'none'";
  const cspLogin = "default-src 'none'; script-src 'self' https://www.google.com/recaptcha/; frame-ancestors 'none'";
  const seguranca = {
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'x-robots-tag': 'noindex, nofollow, noarchive',
    'content-security-policy': csp,
  };
  const r = (status, t, extra = {}, corpo = '') => ({ status, cabecalhos: { 'content-type': t, ...extra }, corpo });
  return {
    adminRaiz: r(200, 'text/html; charset=utf-8', { ...seguranca, 'cache-control': 'no-store' }),
    adminLogin: r(200, 'text/html', { ...seguranca, 'content-security-policy': cspLogin, 'cache-control': 'no-store' }),
    adminRotaDeCliente: r(200, 'text/html', { ...seguranca, 'cache-control': 'no-store' }),
    adminAsset: r(200, 'text/javascript', { ...seguranca, 'cache-control': 'public, max-age=31536000, immutable' }),
    adminAssetSumido: r(404, 'text/plain', { ...seguranca, 'cache-control': 'no-store' }),
    adminApi: r(200, 'application/problem+json', { ...seguranca, 'cache-control': 'no-store' }, 'API surface=[admin] forjado=[]'),
    adminOutraApi: r(404, 'text/plain; charset=utf-8', seguranca),
    appAdmin: r(404, 'text/plain; charset=utf-8'),
    appAdminSemBarra: r(404, 'text/plain; charset=utf-8'),
    appAdminOptions: r(404, 'text/plain; charset=utf-8'),
    appSaudeComOrigem: r(200, 'application/json'),
  };
}

export function autoteste() {
  const falhas = [];
  const base = julgar(respostaCerta(), { eco: true });
  if (base.length > 0) falhas.push(`a coleta CERTA reprovou: o juizo reprova qualquer coisa (${base.join('; ')})`);

  const iscas = [
    ['app /v1/admin chega a aplicacao (o estado de hml em 23/09)', (r) => { r.appAdmin = { ...r.appAdmin, cabecalhos: { 'content-type': 'application/problem+json' } }; }],
    ['OPTIONS administrativo no host da aplicacao repassado', (r) => { r.appAdminOptions = { ...r.appAdminOptions, status: 204 }; }],
    ['CORS na API', (r) => { r.appSaudeComOrigem.cabecalhos['access-control-allow-origin'] = 'https://admin.bichu.app'; }],
    ['CSP da SPA com unsafe-inline', (r) => { r.adminRaiz.cabecalhos['content-security-policy'] += "; script-src 'self' 'unsafe-inline'"; }],
    ['CSP da SPA com host do Google', (r) => { r.adminRaiz.cabecalhos['content-security-policy'] = "default-src 'none'; script-src 'self' https://www.google.com/recaptcha/; frame-ancestors 'none'"; }],
    ['sem HSTS no host administrativo', (r) => { delete r.adminAsset.cabecalhos['strict-transport-security']; }],
    ['sem X-Robots-Tag', (r) => { delete r.adminApi.cabecalhos['x-robots-tag']; }],
    ['HTML com cache', (r) => { r.adminRaiz.cabecalhos['cache-control'] = 'no-cache'; }],
    ['fallback engolindo /assets/', (r) => { r.adminAssetSumido = { ...r.adminAssetSumido, status: 200 }; }],
    ['marca interna ausente', (r) => { r.adminApi.corpo = 'API surface=[] forjado=[]'; }],
    ['cabecalho interno forjado sobrevivendo', (r) => { r.adminApi.corpo = 'API surface=[admin] forjado=[x]'; }],
    ['host administrativo servindo a API inteira', (r) => { r.adminOutraApi = { ...r.adminOutraApi, status: 200, cabecalhos: { ...r.adminOutraApi.cabecalhos, 'content-type': 'application/json' } }; }],
    ['login sem a CSP propria', (r) => { r.adminLogin.cabecalhos['content-security-policy'] = r.adminRaiz.cabecalhos['content-security-policy']; }],
  ];
  for (const [nome, estragar] of iscas) {
    const r = respostaCerta();
    estragar(r);
    if (julgar(r, { eco: true }).length === 0) falhas.push(`isca "${nome}" PASSOU: o juizo parou de enxergar esse defeito`);
  }
  return falhas;
}

// ---------------------------------------------------------------------------

function argumentos(argv) {
  const a = { eco: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--eco') a.eco = true;
    else if (k === '--autoteste') a.autoteste = true;
    else if (k.startsWith('--')) a[k.slice(2)] = argv[++i];
  }
  return a;
}

async function main() {
  const a = argumentos(process.argv.slice(2));
  console.log('sonda do backoffice na borda (docs/04-seguranca.md, D33 D34 D41 D48)');
  const cegueira = autoteste();
  console.log(`  [${cegueira.length === 0 ? 'ok' : 'REPROVA'}] autoteste das iscas`);
  if (cegueira.length > 0) {
    for (const f of cegueira) console.log(`  - ${f}`);
    return 1;
  }
  if (a.autoteste) return 0;
  for (const k of ['admin', 'admin-host', 'app', 'app-host']) {
    if (!a[k]) {
      console.log(`REPROVADO: falta --${k}. Sem os quatro enderecos nao ha o que sondar, e nao sondar nao e aprovar`);
      return 1;
    }
  }
  const A = (c, o) => pedir(a.admin, a['admin-host'], c, o);
  const P = (c, o) => pedir(a.app, a['app-host'], c, o);
  const forjado = { 'X-Internal-Surface': 'forjado-pelo-cliente', 'X-Internal-Forjado': 'x' };
  const r = {};
  try {
    r.adminRaiz = await A('/');
    const asset = r.adminRaiz.corpo.match(/\/assets\/[^"']+\.js/);
    if (!asset) {
      console.log(`REPROVADO: o index.html do backoffice nao referencia nenhum /assets/*.js. Sem arquivo com hash nao ha como conferir a classe de cache. Corpo: ${r.adminRaiz.corpo.slice(0, 300)}`);
      return 1;
    }
    r.adminAsset = await A(asset[0]);
    r.adminAssetSumido = await A(`/assets/nao-existe-${Date.now()}.js`);
    r.adminLogin = await A('/entrar/');
    r.adminRotaDeCliente = await A('/eventos/123');
    r.adminApi = await A('/v1/admin/sonda-da-borda', { cabecalhos: forjado });
    r.adminOutraApi = await A('/v1/health');
    r.appAdmin = await P('/v1/admin/ping', { cabecalhos: { Origin: 'https://evil.example' } });
    r.appAdminSemBarra = await P('/v1/admin');
    r.appAdminOptions = await P('/v1/admin/ping', {
      metodo: 'OPTIONS',
      cabecalhos: { Origin: 'https://bichu.app', 'Access-Control-Request-Method': 'POST' },
    });
    r.appSaudeComOrigem = await P('/v1/health', { cabecalhos: { Origin: `https://${a['admin-host']}` } });
  } catch (erro) {
    console.log(`REPROVADO: a borda nao respondeu: ${erro instanceof Error ? erro.message : erro}`);
    return 1;
  }
  for (const [k, v] of Object.entries(r)) {
    console.log(`  ${k.padEnd(20)} ${v.status} ${tipo(v)}  cache=${cabecalho(v, 'cache-control') ?? '-'}`);
  }
  if (!a.eco) console.log('  [aviso] sem --eco: a chegada de `X-Internal-Surface` e a remocao do forjado NAO foram conferidas');
  const falhas = julgar(r, { eco: a.eco });
  if (falhas.length > 0) {
    console.log(`\nREPROVADO com ${falhas.length} achado(s):`);
    for (const f of falhas) console.log(`  - ${f}`);
    return 1;
  }
  console.log('\nAPROVADO');
  return 0;
}

const invocadoDiretamente = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invocadoDiretamente) {
  main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}
