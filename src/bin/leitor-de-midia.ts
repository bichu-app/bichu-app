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
import { CATEGORIAS_PUBLICAS, comoObjectKey } from '../modules/media/domain/chave-de-objeto.js';
import { criarSecretProvider } from '../shared/adapters/external/env-var-secret-provider.js';
import { loadAppConfig } from '../shared/config/app-config.js';
import { optionalEnv } from '../shared/config/env.js';
import { resolverSegredos } from '../shared/config/segredos.js';
import type { ObjectKey } from '../shared/types/brands.js';

const PORTA = Number(optionalEnv('LEITOR_DE_MIDIA_PORTA') ?? '8080');
/**
 * A FORMA DA DERIVADA PÚBLICA, e é esta linha que garante que o app nunca
 * recebe o original.
 *
 * Nenhuma chave de original casa com ela, e a razão é estrutural e não feliz: o
 * segundo segmento tem de ser `thumb`, `card` ou `banner`, e **toda** chave de
 * original tem `original` nessa posição — `pets/{petId}/original/{nome}`,
 * `found-reports/{id}/original/{nome}`, `{products|events}/original/{nome}`. A
 * derivada higienizada do achado (`found-reports/{dono}/sanitized/{nome}.{ext}`)
 * também não casa, e isso é o critério 9: ela é privada, vista dentro da
 * conversa mediada e só.
 *
 * `banner` entrou com a capa de borda a borda do detalhe do encontro
 * (1280 px): a mesma imagem é desenhada em três tamanhos, e uma derivada só
 * servia mal aos três.
 *
 * ## A CATEGORIA VEM DE `CATEGORIAS_PUBLICAS`, E NÃO DE UMA LISTA ESCRITA AQUI
 *
 * Até 20/10/2026 esta linha trazia `(?:pets|products|events)` digitado à mão, e
 * era a QUARTA cópia da lista de categorias — `CATEGORIAS_PUBLICAS`,
 * `comoObjectKey` e `CATEGORIA_DO_PROPOSITO` já a tinham. `directory/` e
 * `people/` entraram em 18/10/2026 nas outras três e **não entraram nesta**.
 *
 * O defeito foi medido contra homologação em 20/10/2026, e ele não estava na
 * escrita: a foto do perfil subia, o `PUT` no armazenamento dava `204`,
 * `PATCH /v1/me` devolvia `200`, `catalog_images.status` virava `ready`, o
 * objeto existia em `gs://bichu-hml-media-public/people/card/...` e
 * `GET /v1/me` devolvia a URL dela — e
 * `GET https://img-hml.bichu.app/people/card/{nome}.jpeg` respondia **404
 * `nao encontrado`**, porque `chaveDeDerivadaPublica` recusava a chave ANTES de
 * olhar o balde. Na tela isso é indistinguível de "a foto não salvou", que foi
 * exatamente como o cliente relatou. Valia para a foto do perfil, para a
 * vitrine e para a foto do Mural (as três são `people/`) e para a logo e a foto
 * do diretório (`directory/`).
 *
 * Derivar a forma da constante é o conserto, e não acrescentar duas palavras à
 * alternação: a sexta categoria entra em `CATEGORIAS_PUBLICAS` e passa a ser
 * servida sem ninguém lembrar deste arquivo. Era a conferência que faltava.
 */
const FORMA_DE_DERIVADA = new RegExp(
  `^(?:(?:${CATEGORIAS_PUBLICAS.join('|')})/)?(?:thumb|card|banner)/[A-Za-z0-9_-]+\\.(?:webp|jpg|jpeg)$`,
);
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
