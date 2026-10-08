/**
 * **Leitor da midia publica** (ADR-0007 Emenda 1, item 4).
 *
 * A origem `img-*` da borda repassa para ca, e este processo le o objeto do
 * bucket PUBLICO com a credencial do armazenamento e devolve os bytes. Ele
 * existe porque a politica da organizacao recusa leitura anonima (`allUsers`)
 * em bucket, e a borda nao sabe assinar pedido: alguem com credencial precisa
 * estar no caminho.
 *
 * O que ele NAO faz, e cada ausencia e a regra:
 *   - nao le o bucket privado: a classe e fixa em `publico`;
 *   - nao lista: so chave que tem a forma de DERIVADA (`{categoria}/{thumb|card}/
 *     {nome}.{ext}`, ou a forma antiga `{thumb|card}/{nome}.{ext}`), e
 *     `comoObjectKey` recusa antes qualquer travessia de caminho;
 *   - so GET e HEAD; o resto e 405;
 *   - nao fala com o banco, embora suba com a mesma configuracao da API: o
 *     `loadAppConfig()` e o caminho que ja resolve segredo e valida o
 *     armazenamento, e reescrever esse pedaco seria a segunda opiniao.
 *
 * A derivada e imutavel (trocar a foto gera chave nova), entao o cache e de um
 * ano. Mesmos cabecalhos que a borda punha antes.
 */
import { createServer } from 'node:http';

import { criarObjectStorage } from '../modules/media/adapters/external/s3-object-storage.js';
import { comoObjectKey } from '../modules/media/domain/chave-de-objeto.js';
import { criarSecretProvider } from '../shared/adapters/external/env-var-secret-provider.js';
import { loadAppConfig } from '../shared/config/app-config.js';
import { optionalEnv } from '../shared/config/env.js';
import { resolverSegredos } from '../shared/config/segredos.js';
import type { ObjectKey } from '../shared/types/brands.js';

const PORTA = Number(optionalEnv('LEITOR_DE_MIDIA_PORTA') ?? '8080');
const FORMA_DE_DERIVADA = /^(?:(?:pets|products|events)\/)?(?:thumb|card)\/[A-Za-z0-9_-]+\.(?:webp|jpg|jpeg)$/;
const TIPO_POR_EXTENSAO: Readonly<Record<string, string>> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/** A chave pedida, ou `null` se ela nao for derivada publica. Nunca lanca. */
export function chaveDeDerivadaPublica(caminho: string): ObjectKey | null {
  const chave = caminho.replace(/^\//, '');
  if (!FORMA_DE_DERIVADA.test(chave)) return null;
  try {
    return comoObjectKey(chave);
  } catch {
    return null;
  }
}

async function principal(): Promise<void> {
  await resolverSegredos(criarSecretProvider(optionalEnv('ENVIRONMENT') ?? 'dev'));
  const config = loadAppConfig();
  const armazenamento = criarObjectStorage(config.objectStorage);

  const servidor = createServer((pedido, resposta) => {
    const caminho = new URL(pedido.url ?? '/', 'http://leitor').pathname;
    const responder = (status: number, texto: string): void => {
      resposta.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      resposta.end(pedido.method === 'HEAD' ? undefined : texto);
    };
    if (caminho === '/healthz') return responder(200, 'ok');
    if (pedido.method !== 'GET' && pedido.method !== 'HEAD') return responder(405, 'metodo nao permitido');
    const chave = chaveDeDerivadaPublica(caminho);
    if (chave === null) return responder(404, 'nao encontrado');

    void (async () => {
      try {
        const cabecalho = await armazenamento.head('publico', chave);
        if (cabecalho === null) return responder(404, 'nao encontrado');
        const extensao = chave.slice(chave.lastIndexOf('.') + 1);
        const comum = {
          'content-type': TIPO_POR_EXTENSAO[extensao] ?? 'application/octet-stream',
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
          'cross-origin-resource-policy': 'cross-origin',
        };
        if (pedido.method === 'HEAD') {
          resposta.writeHead(200, { ...comum, 'content-length': String(cabecalho.contentLength) });
          resposta.end();
          return;
        }
        const bytes = await armazenamento.get('publico', chave);
        resposta.writeHead(200, { ...comum, 'content-length': String(bytes.length) });
        resposta.end(bytes);
      } catch (erro) {
        // O detalhe vai para o log, nunca para quem pediu.
        console.error(JSON.stringify({ msg: 'leitura de midia falhou', chave, erro: String(erro) }));
        if (!resposta.headersSent) responder(502, 'indisponivel');
        else resposta.destroy();
      }
    })();
  });

  servidor.listen(PORTA, () => {
    console.log(JSON.stringify({ msg: 'leitor de midia no ar', porta: PORTA }));
  });
}

if (process.argv[1]?.endsWith('leitor-de-midia.js')) {
  principal().catch((erro: unknown) => {
    console.error(erro);
    process.exit(1);
  });
}
