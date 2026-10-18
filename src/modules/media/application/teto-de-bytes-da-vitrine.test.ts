/**
 * ISCA (e): ACIMA DE 5 MB É RECUSADO NO SERVIDOR, ANTES DE ASSINAR.
 *
 * Mede o PREPARADOR DE VERDADE, com o propósito `user_showcase`. Mora em
 * `media/application/` e não no módulo da vitrine porque é aqui que a recusa
 * vive, e a fronteira da arquitetura não deixa `showcase` importar
 * `media/application` — ela está certa: o que a vitrine enxerga é a porta.
 *
 * ## Por que "antes de assinar" é a parte que importa
 *
 * O backend **nunca recebe os bytes** (ADR-0007): o app envia direto ao
 * armazenamento. Uma conferência de tamanho feita *depois* não recusa nada —
 * reclama de um objeto já gravado e já pago. O teto tem de estar na **política
 * assinada**, e o `byte_size` declarado tem de ser recusado **antes** de a
 * assinatura existir, porque uma política assinada vale dez minutos e **não se
 * desfaz**.
 *
 * É por isso que estes casos medem **se alguma assinatura foi pedida**, e não só
 * o código de erro: recusar com 400 *depois* de assinar produz a mesma resposta
 * ao cliente e deixa a autorização de escrita de pé no armazenamento.
 *
 * ## O dublê é o ARMAZENAMENTO, e só ele
 *
 * Uma versão anterior destes casos dublava o PREPARADOR, e por isso
 * `byte_size` acima do teto **passava**: o dublê não tinha como recusar, porque
 * a recusa está aqui. O teste media a si mesmo. Agora o que é de mentira é a
 * chamada de rede; as conferências de tipo, tamanho e propósito são as de
 * produção.
 *
 * O número vem de `TETO_DE_BYTES_DO_ENVIO`, o PONTO ÚNICO. Ele já existiu em
 * três lugares com três números (10 MiB na foto de pet, 2 MiB na do achado,
 * 5 MiB no catálogo), e um teste que repetisse o literal continuaria verde no
 * dia em que um deles divergisse.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { criarPreparadorDeEnvioDeCatalogo } from './preparar-envio-de-catalogo.js';
import { TETO_DE_BYTES_DO_ENVIO } from '../domain/derivadas.js';
import { TETO_DE_BYTES_DO_CATALOGO } from '../ports/imagem-de-catalogo.js';
import { dataFixa } from '../../../shared/time/relogio-de-teste.js';

interface Bancada {
  readonly preparar: (contentType: string, byteSize: number) => Promise<unknown>;
  readonly assinaturas: { contentType: string; maxBytes: number; chave: string }[];
}

function montar(): Bancada {
  const assinaturas: { contentType: string; maxBytes: number; chave: string }[] = [];
  const preparador = criarPreparadorDeEnvioDeCatalogo({
    armazenamento: {
      createUploadIntent: (pedido: { chave: string; contentType: string; maxBytes: number }) => {
        assinaturas.push({
          contentType: pedido.contentType,
          maxBytes: pedido.maxBytes,
          chave: pedido.chave,
        });
        return Promise.resolve({
          metodo: 'PUT',
          url: 'https://exemplo.invalid/x',
          expiraEm: dataFixa(0),
          maxBytes: pedido.maxBytes,
        });
      },
    } as never,
    ids: {
      uuidv7: () => '018f7c1e-7a2b-7c3d-9e4f-000000000001',
      random128: () => new Uint8Array(16),
    } as never,
  });
  return {
    preparar: (contentType, byteSize) => preparador.preparar(contentType, byteSize, 'user_showcase'),
    assinaturas,
  };
}

async function erroDe(acao: () => Promise<unknown>): Promise<{ status: number; codes: string[] }> {
  try {
    await acao();
  } catch (erro) {
    const e = erro as { status?: number; errors?: readonly { code: string }[] };
    return { status: e.status ?? 0, codes: (e.errors ?? []).map((x) => x.code) };
  }
  throw new Error('A ação deveria ter lançado, e não lançou.');
}

void describe('o teto de 5 MB da vitrine é cobrado no SERVIDOR, antes de assinar', () => {
  void it('a premissa: o teto do catálogo É o ponto único, e vale 5 MB', () => {
    assert.equal(TETO_DE_BYTES_DO_CATALOGO, TETO_DE_BYTES_DO_ENVIO, 'reexportação, e não um segundo número');
    assert.equal(TETO_DE_BYTES_DO_ENVIO, 5 * 1024 * 1024, '5 MB, o mesmo número nos cinco caminhos');
  });

  void it('ISCA -- 1 byte ACIMA do teto é recusado, e NADA é assinado', async () => {
    const { preparar, assinaturas } = montar();
    const { status, codes } = await erroDe(() => preparar('image/jpeg', TETO_DE_BYTES_DO_ENVIO + 1));
    assert.equal(status, 400);
    assert.deepEqual(codes, ['maximum']);
    assert.deepEqual(
      assinaturas,
      [],
      'NADA pode ser assinado: uma política assinada vale dez minutos e não se desfaz',
    );
  });

  void it('CONTRAPESO -- EXATAMENTE no teto passa, e a política LEVA o teto', async () => {
    const { preparar, assinaturas } = montar();
    await preparar('image/jpeg', TETO_DE_BYTES_DO_ENVIO);
    assert.equal(assinaturas.length, 1, 'sem este caso, o teto poderia ser qualquer número menor');
    assert.equal(
      assinaturas.at(0)?.maxBytes,
      TETO_DE_BYTES_DO_ENVIO,
      'o teto vai DENTRO da política assinada: é lá que ele vale, porque o backend não recebe os bytes',
    );
  });

  void it('ISCA -- `byte_size` zero, negativo ou fracionário é recusado', async () => {
    for (const tamanho of [0, -1, 1.5]) {
      const { preparar, assinaturas } = montar();
      const { status } = await erroDe(() => preparar('image/jpeg', tamanho));
      assert.equal(status, 400, `byte_size ${String(tamanho)} tem de ser recusado`);
      assert.deepEqual(assinaturas, []);
    }
  });

  void it('ISCA -- SVG é recusado com 415, por IGUALDADE e nunca por prefixo `image/`', async () => {
    const { preparar, assinaturas } = montar();
    const { status } = await erroDe(() => preparar('image/svg+xml', 1024));
    assert.equal(status, 415, 'SVG é documento com script, e nunca entra');
    assert.deepEqual(assinaturas, []);
  });

  void it('CONTRAPESO -- HEIC ENTRA na vitrine: ela sai de um celular', async () => {
    const { preparar, assinaturas } = montar();
    await preparar('image/heic', 1024);
    assert.equal(
      assinaturas.at(0)?.contentType,
      'image/heic',
      'recusar HEIC tiraria a vitrine da mão de metade dos aparelhos',
    );
  });

  void it('a chave nasce no prefixo `people/`, com a foto única da pessoa', async () => {
    const { preparar, assinaturas } = montar();
    await preparar('image/jpeg', 1024);
    assert.match(
      assinaturas.at(0)?.chave ?? '',
      /^people\/original\//,
      'vitrine e foto única dividem o prefixo: as duas somem juntas no expurgo da conta',
    );
  });
});
