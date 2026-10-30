/**
 * O QUE `LogotipoDaIndicacao.autorizar` FAZ, medido -- e o que ele NAO deixa
 * passar.
 *
 * O caso de uso chegou em 29/10/2026 com o pedido do cliente (*"nao tem o
 * campo do logotipo para o usuario subir e indicar o estabelecimento"*) e
 * **nenhuma suite o carregava**: `verificar-cobertura` o acusou como fonte
 * ausente dos dois lcov, que para o SonarCloud e 0% sem uma reclamacao. Este
 * arquivo e a divida paga, e ela e a BARATA -- `autorizar` e logica sobre
 * portas, e as tres dependencias (`envios`, `registrarIntencao`, `db`) entram
 * pelo construtor. Nao precisa de banco: `db` atravessa o caso de uso OPACO,
 * sem uma consulta, e quem o recebe e a funcao de gravacao.
 *
 * Por isso aqui e nao na suite de INTEGRACAO. O que precisa de banco neste
 * fluxo e a clausula `WHERE` do adaptador, e ela ja esta medida em
 * `tests/integration/logotipo-da-indicacao.test.ts`; um dobre que a imitasse
 * faria o teste medir a si mesmo. O que esta aqui e o que o caso de uso decide
 * ANTES de qualquer escrita, e isso e comparacao de valor.
 *
 * ## AS TRES COISAS QUE ESTE ARQUIVO MEDE
 *
 * 1. **O proposito assinado e `directory_suggestion_logo`, nos DOIS lados** (o
 *    que vai ao preparador e o que vai a gravacao). Nao e vocabulario: e a
 *    fronteira da fila de revisao. `imagemDoEnvio` em
 *    `professionals/application/diretorio-administrativo.ts` exige
 *    `directory_logo` para aceitar um `upload_id` em
 *    `professionals.logo_image_id`, e `professionals` E a superficie publica --
 *    com o proposito errado aqui, a logo de uma indicacao que ninguem aprovou
 *    caberia naquela conferencia e chegaria ao `Perto`. A direcao dessa recusa
 *    esta em `professionals/application/logotipo-da-indicacao-nao-vaza.test.ts`;
 *    o que falta, e que e isto, e que o valor que SAI daqui e o certo.
 *
 * 2. **A recusa da dimensao declarada pequena roda ANTES de assinar.** E o que
 *    o cabecalho do modulo afirma, e "antes" nao e mensuravel por tipo: so se
 *    ve contando chamadas. Sem o caso, trocar a ordem das duas linhas compila,
 *    passa no lint, e volta a entregar politica valida por dez minutos para um
 *    arquivo que ja se sabe pequeno.
 *
 * 3. **A gravacao recebe o executor de quem chama, e o autor e `users`.** O
 *    `db` que chega a `registrarIntencao` e o MESMO objeto injetado -- e e
 *    assim que se ve que `autorizar` nao abre transacao propria, o que o
 *    cabecalho do modulo justifica (assinar e chamada de rede, e segurar
 *    conexao esperando por ela e o que esgota o pool num pico).
 *
 * ## O CONTRAPESO, e ele nao e opcional
 *
 * O caso que ACEITA (256 x 256 exatos, e a dimensao nao declarada) esta aqui de
 * proposito: sem ele, um `autorizar` que recusasse TUDO deixaria o caso da
 * recusa verde e o campo do logotipo quebrado. Recusa sem aceitacao medida nao
 * e fronteira, e sim porta trancada. 256 e o piso de `DIMENSAO_MINIMA`, lido da
 * porta e nao copiado: numero copiado em duas listas foi exatamente o que
 * divergiu em 18/10/2026.
 *
 * ## AS ISCAS, provadas
 *
 * | o que se poe no codigo de producao | reprova |
 * |---|---|
 * | `PROPOSITO_DO_LOGOTIPO_DA_INDICACAO` virando `'directory_logo'` na assinatura | o proposito assinado |
 * | `recusarDimensaoDeclaradaPequena` movida para DEPOIS de `preparar` | a ordem |
 * | `userId: autor` virando outro identificador | o autor gravado |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DbExecutor } from '../../../shared/db/pool.js';
import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../shared/types/brands.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';
import {
  DIMENSAO_MINIMA,
  PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
  type EnvioPreparado,
  type PreparadorDeEnvioDeCatalogo,
  type PropositoDaImagem,
} from '../ports/imagem-de-catalogo.js';
import { LogotipoDaIndicacao, type CorpoDaIntencaoDoLogotipo } from './logotipo-da-indicacao.js';

const AUTOR = '0192a3b4-0000-7000-8000-00000000aaaa' as UserId;
const ID_DO_ENVIO = '0192a3b4-0000-7000-8000-00000000bbbb';
const CHAVE = comoObjectKey('directory/original/0192a3b40000700080000000000000cc');
const EXPIRA_EM = 1_770_000_000_000 as Instant;
const TETO_DE_BYTES = 6_000_000;

/**
 * O executor injetado, com uma MARCA: a asercao da identidade e por referencia,
 * e um objeto vazio dos dois lados passaria por `deepEqual` sem provar nada.
 */
const DB = { marcaDoExecutorInjetado: 'o-de-quem-chama' } as unknown as DbExecutor;

/** O corpo que PASSA, do qual cada caso muda uma coisa so. */
const CORPO_BOM: CorpoDaIntencaoDoLogotipo = {
  content_type: 'image/png',
  byte_size: 180_000,
  width: 512,
  height: 512,
};

interface IntencaoGravada {
  readonly db: DbExecutor;
  readonly id: string;
  readonly userId: string;
  readonly objectKey: string;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
  readonly purpose: PropositoDaImagem;
}

function bancada() {
  const assinaturas: { contentType: string; byteSize: number; proposito: PropositoDaImagem }[] = [];
  const gravadas: IntencaoGravada[] = [];
  /** A ordem das duas chamadas, que e o que mede o "ANTES". */
  const ordem: ('assinar' | 'gravar')[] = [];

  const envios: PreparadorDeEnvioDeCatalogo = {
    preparar: (contentType: string, byteSize: number, proposito: PropositoDaImagem) => {
      ordem.push('assinar');
      assinaturas.push({ contentType, byteSize, proposito });
      const preparado: EnvioPreparado = {
        uploadId: ID_DO_ENVIO,
        chave: CHAVE,
        contentType,
        maxBytes: TETO_DE_BYTES,
        autorizacao: {
          metodo: 'POST',
          url: 'https://armazenamento.exemplo.invalid/envio' as AbsoluteUrl,
          campos: { key: CHAVE },
          expiraEm: comoData(EXPIRA_EM),
          maxBytes: TETO_DE_BYTES,
        },
      };
      return Promise.resolve(preparado);
    },
  };

  const caso = new LogotipoDaIndicacao({
    envios,
    registrarIntencao: (db, nova) => {
      ordem.push('gravar');
      gravadas.push({ db, ...nova });
      return Promise.resolve();
    },
    db: DB,
  });

  return { caso, assinaturas, gravadas, ordem };
}

void describe('LogotipoDaIndicacao.autorizar', () => {
  void it('assina com `directory_suggestion_logo`, e esse e o proposito que vai a gravacao', async () => {
    const { caso, assinaturas, gravadas } = bancada();

    await caso.autorizar(AUTOR, CORPO_BOM);

    // O valor, nos DOIS lados. Nao basta um: foi o proposito divergindo entre
    // dois pontos que custou o dia 18/10.
    assert.equal(assinaturas.length, 1);
    assert.equal(assinaturas[0]?.proposito, PROPOSITO_DO_LOGOTIPO_DA_INDICACAO);
    assert.equal(gravadas.length, 1);
    assert.equal(gravadas[0]?.purpose, PROPOSITO_DO_LOGOTIPO_DA_INDICACAO);

    // E a FRONTEIRA escrita como afirmacao, e nao como prosa de cabecalho: o
    // proposito do painel nao sai daqui. Com `directory_logo` no lugar,
    // `imagemDoEnvio` aceitaria este envio em `professionals.logo_image_id`.
    assert.notEqual(assinaturas[0]?.proposito, 'directory_logo');
    assert.notEqual(gravadas[0]?.purpose, 'directory_logo');
  });

  void it('entrega a autorizacao do preparador, e o corpo declarado chega inteiro a assinatura', async () => {
    const { caso, assinaturas } = bancada();

    const saida = await caso.autorizar(AUTOR, CORPO_BOM);

    assert.equal(saida.uploadId, ID_DO_ENVIO);
    assert.equal(saida.autorizacao.metodo, 'POST');
    assert.equal(saida.autorizacao.maxBytes, TETO_DE_BYTES);
    assert.deepEqual(saida.autorizacao.expiraEm, comoData(EXPIRA_EM));
    // O tipo e o tamanho DECLARADOS chegam ao preparador sem passar por
    // conferencia nem valor padrao daqui: quem recusa o tipo fora da lista com
    // 415 e o preparador, num ponto so.
    assert.equal(assinaturas[0]?.contentType, CORPO_BOM.content_type);
    assert.equal(assinaturas[0]?.byteSize, CORPO_BOM.byte_size);
  });

  void it('grava a intencao com autor de `users`, os valores do envio e o executor de quem chama', async () => {
    const { caso, gravadas } = bancada();

    await caso.autorizar(AUTOR, CORPO_BOM);

    const gravada = gravadas[0];
    assert.ok(gravada);
    assert.equal(gravada.id, ID_DO_ENVIO);
    // O autor e o USUARIO que pediu, e nunca uma conta administrativa: e isso
    // que poe a imagem na fila de revisao em vez da superficie publica.
    assert.equal(gravada.userId, AUTOR);
    assert.equal(gravada.objectKey, CHAVE);
    assert.equal(gravada.declaredType, CORPO_BOM.content_type);
    assert.equal(gravada.maxBytes, TETO_DE_BYTES);
    assert.deepEqual(gravada.expiresAt, comoData(EXPIRA_EM));
    // POR REFERENCIA. `autorizar` nao abre transacao propria -- se abrisse,
    // chegaria aqui outro executor, e a conexao ficaria segurada durante a
    // chamada de rede da assinatura.
    assert.equal(gravada.db, DB);
  });

  void it('assina ANTES de gravar, e a gravacao acontece uma vez so', async () => {
    const { caso, ordem } = bancada();

    await caso.autorizar(AUTOR, CORPO_BOM);

    assert.deepEqual(ordem, ['assinar', 'gravar']);
  });

  void it('recusa a dimensao declarada abaixo da minima SEM assinar nem gravar', async () => {
    const minima = DIMENSAO_MINIMA[PROPOSITO_DO_LOGOTIPO_DA_INDICACAO];
    const { caso, assinaturas, gravadas, ordem } = bancada();

    const erro = await caso
      .autorizar(AUTOR, { ...CORPO_BOM, width: minima.largura - 1, height: minima.altura - 1 })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    assert.ok(erro instanceof AppError);
    assert.equal(erro.problemType, 'image-too-small');
    // Os DOIS campos, com o codigo que o app usa para decidir onde pintar o
    // erro -- e nao so o `problemType`.
    assert.deepEqual(
      (erro.errors ?? []).map((e) => ({ field: e.field, code: e.code })),
      [
        { field: 'width', code: 'minimum' },
        { field: 'height', code: 'minimum' },
      ],
    );
    // O PONTO do caso: nada foi assinado. Uma politica valida por dez minutos
    // nao e entregue para um arquivo que ja se sabe pequeno.
    assert.deepEqual(ordem, []);
    assert.equal(assinaturas.length, 0);
    assert.equal(gravadas.length, 0);
  });

  void it('recusa quando SO a largura declarada e pequena, nomeando so ela', async () => {
    const minima = DIMENSAO_MINIMA[PROPOSITO_DO_LOGOTIPO_DA_INDICACAO];
    const { caso, assinaturas } = bancada();

    const erro = await caso.autorizar(AUTOR, { ...CORPO_BOM, width: minima.largura - 1 }).then(
      () => undefined,
      (e: unknown) => e,
    );

    assert.ok(erro instanceof AppError);
    assert.deepEqual(
      (erro.errors ?? []).map((e) => e.field),
      ['width'],
    );
    assert.equal(assinaturas.length, 0);
  });

  void it('CONTRAPESO: a dimensao exatamente na minima passa, e a nao declarada tambem', async () => {
    const minima = DIMENSAO_MINIMA[PROPOSITO_DO_LOGOTIPO_DA_INDICACAO];

    // O piso e aceito: a comparacao e `<` e nao `<=`, e `sharp` nao amplia --
    // em 256 a derivada `card` de 512 ainda fica aceitavel.
    const noPiso = bancada();
    const saidaNoPiso = await noPiso.caso.autorizar(AUTOR, {
      ...CORPO_BOM,
      width: minima.largura,
      height: minima.altura,
    });
    assert.equal(saidaNoPiso.uploadId, ID_DO_ENVIO);
    assert.equal(noPiso.gravadas.length, 1);

    // Sem dimensao declarada, assina: a declaracao e OPCIONAL e vem do
    // navegador, que pode mentir. Quem decide de verdade e o worker, nos bytes.
    const semDimensao = bancada();
    const saidaSemDimensao = await semDimensao.caso.autorizar(AUTOR, {
      content_type: CORPO_BOM.content_type,
      byte_size: CORPO_BOM.byte_size,
    });
    assert.equal(saidaSemDimensao.uploadId, ID_DO_ENVIO);
    assert.equal(semDimensao.gravadas.length, 1);
  });

  void it('nao grava intencao nenhuma quando a assinatura falha', async () => {
    const gravadas: IntencaoGravada[] = [];
    const envios: PreparadorDeEnvioDeCatalogo = {
      preparar: () => Promise.reject(new AppError('unsupported-media-type', 'tipo fora da lista')),
    };
    const caso = new LogotipoDaIndicacao({
      envios,
      registrarIntencao: (db, nova) => {
        gravadas.push({ db, ...nova });
        return Promise.resolve();
      },
      db: DB,
    });

    const erro = await caso.autorizar(AUTOR, CORPO_BOM).then(
      () => undefined,
      (e: unknown) => e,
    );

    assert.ok(erro instanceof AppError);
    assert.equal(erro.problemType, 'unsupported-media-type');
    // Sem isto, uma linha de `catalog_upload_intents` sobraria apontando para
    // um envio que nunca foi assinado, e o varredor de vencidos e que a
    // recolheria dez minutos depois.
    assert.equal(gravadas.length, 0);
  });
});
