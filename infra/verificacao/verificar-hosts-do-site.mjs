/* global console, process, URL */
// A tabela de hosts do site (ADR-0028, item 5), conferida contra a borda DE
// VERDADE, atravessando o Caddy ate o `web` e a `api`.
//
// Por que um script e nao tres `curl` no YAML da esteira: a tabela tem doze
// linhas, e cada uma prova uma coisa diferente -- o host do site chega ao
// site, a documentacao NAO vaza sem credencial no host do site, a tag nao
// serve nada alem de `/t/*`, o `www` redireciona preservando caminho. Linha
// que falta nao reprova ninguem; aqui a tabela e a lista, e a lista nao pode
// ficar vazia.
//
// Uso (de dentro da rede do compose, que e onde os hosts de teste existem):
//
//   docker compose exec -T web node --input-type=module - http://edge:80 < infra/verificacao/verificar-hosts-do-site.mjs
//
// Os hosts sao os padroes do Caddyfile (`site.localhost`, `tag.localhost`,
// `www.localhost`), que nao resolvem em DNS publico: a requisicao vai para o
// endereco da borda com o `Host` escrito a mao. Saida 0 aprovado, 1 reprovado.
// So a biblioteca padrao do Node.

import { request } from 'node:http';

const borda = new URL(process.argv[2] ?? 'http://edge:80');
const SITE = process.env.SITE_HOST ?? 'site.localhost';
const TAG = process.env.TAG_HOST ?? 'tag.localhost';
const WWW = process.env.WWW_HOST ?? 'www.localhost';

// Quem respondeu: o site responde `text/html` (pagina) e a API
// `application/json` ou `application/problem+json`; a borda responde 404 em
// `text/plain` com o corpo "nao encontrado".
const CASOS = [
  // host, caminho, status, tipo (prefixo) | null, verificacao extra
  [SITE, '/', 200, 'text/html', 'o apex entrega o site'],
  [SITE, '/.well-known/assetlinks.json', 200, 'application/json', 'associacao servida pela borda (emenda 1)'],
  [SITE, '/.well-known/apple-app-site-association', 200, 'application/json', 'associacao servida pela borda (emenda 1)'],
  [SITE, '/v1/health', 200, 'application/json', '/v1 na mesma origem da pagina (item 4)'],
  [SITE, '/v1/docs', 404, 'text/plain', 'documentacao fechada fora do host da API, sem pedir credencial'],
  [SITE, '/v1/openapi.yaml', 404, 'text/plain', 'contrato fechado fora do host da API'],
  [TAG, '/.well-known/assetlinks.json', 200, 'application/json', 'associacao no host impresso'],
  [TAG, '/t/CODIGO-DE-TESTE', null, 'text/html', 'a pagina da tag e do site'],
  [TAG, '/v1/health', 200, 'application/json', '/v1 na mesma origem da pagina da tag'],
  [TAG, '/v1/docs', 404, 'text/plain', 'documentacao fechada no host da tag'],
  [TAG, '/', 308, null, 'quem digita o host impresso cai no site'],
  [TAG, '/sobre', 404, 'text/plain', 'o host irreversivel nao serve o institucional'],
  [WWW, '/qualquer?x=1', 308, null, 'www leva ao apex preservando caminho e consulta'],
];

function pedir(host, caminho) {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: borda.hostname, port: borda.port || 80, path: caminho, method: 'GET', headers: { Host: host }, timeout: 5000 },
      (res) => {
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { if (corpo.length < 4096) corpo += c; });
        res.on('end', () => resolve({ status: res.statusCode, tipo: res.headers['content-type'] ?? '', local: res.headers.location ?? '', autenticar: res.headers['www-authenticate'], corpo }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('sem resposta em 5 s')));
    req.on('error', reject);
    req.end();
  });
}

if (CASOS.length === 0) {
  console.log('REPROVADO: a tabela de casos esta vazia; sem caso, esta conferencia nao verifica nada');
  process.exit(1);
}

let falhas = 0;
for (const [host, caminho, status, tipo, motivo] of CASOS) {
  let r;
  try {
    r = await pedir(host, caminho);
  } catch (erro) {
    console.log(`  [REPROVA] ${host}${caminho}: ${erro.message}`);
    falhas++;
    continue;
  }
  const erros = [];
  if (status !== null && r.status !== status) erros.push(`status ${r.status}, esperado ${status}`);
  if (tipo !== null && !r.tipo.startsWith(tipo)) erros.push(`tipo '${r.tipo}', esperado '${tipo}...'`);
  if (r.autenticar) erros.push('pediu credencial (WWW-Authenticate): a documentacao existe neste host');
  if (status === 308) {
    const esperado = host === WWW ? caminho : '/';
    if (!r.local.endsWith(esperado) || r.local.includes(host)) erros.push(`Location '${r.local}' nao leva ao apex com '${esperado}'`);
  }
  // A pagina da tag precisa vir do SITE, e nao do 404 da borda: status livre
  // (codigo inexistente e 404 legitimo do site), mas corpo HTML.
  if (caminho.startsWith('/t/') && r.corpo.includes('nao encontrado') && !r.tipo.startsWith('text/html')) {
    erros.push('respondeu o 404 da borda; /t/* nao chegou ao site');
  }
  console.log(`  [${erros.length ? 'REPROVA' : 'ok'}] ${host}${caminho} -> ${r.status} ${r.tipo || '-'}${r.local ? ` -> ${r.local}` : ''}  (${motivo})${erros.length ? `: ${erros.join('; ')}` : ''}`);
  falhas += erros.length ? 1 : 0;
}

console.log(falhas ? `\nREPROVADO: ${falhas} de ${CASOS.length} casos` : `\nAPROVADO: ${CASOS.length} casos`);
process.exit(falhas ? 1 : 0);
