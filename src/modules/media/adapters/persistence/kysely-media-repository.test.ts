/**
 * A prova de que a chave que SAI do banco passa pela porta.
 *
 * Este arquivo existe porque ele não existia. O `comoObjectKey` foi escrito
 * (BICHUS-134), as seis afirmações `as ObjectKey` do adaptador foram trocadas
 * por ele — e nada provava a troca: o QA desfez as seis, repôs o `import type`,
 * e a suíte continuou 433/433. O adaptador tinha **0% de cobertura** e sequer
 * aparecia no relatório, porque nenhum teste o carregava. A porta única era
 * documentação falsa sobre documentação falsa.
 *
 * O que morde aqui é uma linha HOSTIL vinda do `SELECT`. Com a porta, a leitura
 * recusa e o log aponta a linha torta; com `as`, a mesma linha atravessa
 * calada até o `pathname` da URL do objeto, que RESOLVE `..` e lê de fora do
 * bucket.
 *
 * ## Por que dá para fazer isso sem Postgres
 *
 * O Kysely separa o *dialeto* (compilar SQL, abrir conexão) do construtor de
 * consulta. Trocando só o motor por um que devolve linhas combinadas, o
 * adaptador roda INTEIRO e de verdade: as mesmas cláusulas `WHERE`, o mesmo
 * `.select()`, o mesmo mapeamento de linha para `FotoDoPet`. O que o dublê não
 * cobre é o que só o banco responde — se a coluna existe, se o índice é usado,
 * se a transação de quatro escritas é atômica. Isso é de `tests/integration/`,
 * e continua lá. O que ESTE teste cobre é o que acontece com a linha depois que
 * ela chega, e para isso o banco é dispensável.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { Database } from '../../../../shared/db/schema.js';
import type { Instant, PetId, UserId } from '../../../../shared/types/brands.js';
import { criarMediaRepository } from './kysely-media-repository.js';

/**
 * Um `Db` que compila a consulta de verdade e devolve as linhas combinadas.
 *
 * Cada chamada consome o próximo lote da fila. Pedir mais consultas do que o
 * teste preparou é ERRO e não lote vazio: lote vazio faria um adaptador que
 * consultasse a tabela errada passar em silêncio.
 */
function bancoQueDevolve(...lotes: readonly (readonly unknown[])[]): Db {
  const fila = [...lotes];

  const conexao: DatabaseConnection = {
    executeQuery: <R,>(): Promise<QueryResult<R>> => {
      const proximo = fila.shift();
      if (proximo === undefined) {
        return Promise.reject(new Error('O adaptador fez mais consultas do que o teste preparou.'));
      }
      return Promise.resolve({
        rows: proximo as R[],
        numAffectedRows: BigInt(proximo.length),
      });
    },
    streamQuery: () => {
      throw new Error('A persistência de mídia não faz streaming.');
    },
  };

  const motor: Driver = {
    init: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(conexao),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
    releaseConnection: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };

  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => motor,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

const PET = '01a0b47d-ae11-7d5b-9b58-d77530774256' as PetId;
const DONO = '01a0b47d-ae11-7d5b-9b58-d77530774111' as UserId;
const AGORA = 1_700_000_000_000 as Instant;

const ORIGINAL_BOA = `pets/${PET}/original/KioqKioqKioqKioqKioqKg`;
const THUMB_BOA = 'thumb/KioqKioqKioqKioqKioqKg.webp';
const CARD_BOA = 'card/KioqKioqKioqKioqKioqKg.webp';

/**
 * A linha que uma importação, uma migração ou uma correção manual em produção
 * consegue gravar — nenhuma delas passa pelo domínio. `card/../../etc/senha`
 * vira `/etc/senha` no `pathname`, fora do prefixo da variante e fora do
 * bucket.
 */
const CHAVE_TORTA = 'card/../../etc/senha';

function linhaDeFoto(sobrescrever: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: '01a0b480-0000-7000-8000-000000000001',
    status: 'ready',
    is_primary: true,
    original_key: ORIGINAL_BOA,
    thumb_key: THUMB_BOA,
    card_key: CARD_BOA,
    created_at: new Date(AGORA),
    ...sobrescrever,
  };
}

const RECUSA = /Chave de objeto recusada/;

void describe('a chave que volta do banco passa por `comoObjectKey`', () => {
  /**
   * Os três da mesma linha, um a um.
   *
   * Separados de propósito: as três colunas são três afirmações distintas no
   * adaptador, e um caso só que cobrisse as três passaria com duas delas
   * desfeitas.
   */
  for (const coluna of ['original_key', 'thumb_key', 'card_key'] as const) {
    void it(`RECUSA a leitura quando \`${coluna}\` atravessa o caminho`, async () => {
      const repo = criarMediaRepository(
        bancoQueDevolve([linhaDeFoto({ [coluna]: CHAVE_TORTA })]),
      );
      await assert.rejects(() => repo.listarDoPet(PET, DONO), RECUSA);
    });
  }

  void it('RECUSA a intenção aberta com `object_key` torta', async () => {
    const repo = criarMediaRepository(
      bancoQueDevolve([
        {
          id: 'i-1',
          user_id: DONO,
          pet_id: PET,
          object_key: CHAVE_TORTA,
          declared_type: 'image/webp',
          max_bytes: 1024,
          expires_at: new Date(AGORA),
          confirmed_at: null,
        },
      ]),
    );
    await assert.rejects(() => repo.buscarIntencaoAberta('i-1', DONO, AGORA), RECUSA);
  });

  void it('RECUSA a foto que o WORKER vai processar com `original_key` torta', async () => {
    // O caminho do worker é o que menos tem olhos em cima: não há requisição de
    // usuário do outro lado, e a chave vai direto para o armazenamento.
    const repo = criarMediaRepository(
      bancoQueDevolve([{ id: 'f-1', pet_id: PET, status: 'processing', original_key: CHAVE_TORTA }]),
    );
    await assert.rejects(() => repo.buscarParaProcessar('f-1'), RECUSA);
  });

  void it('RECUSA a intenção vencida com `object_key` torta', async () => {
    // Esta chave vai para um DELETE no armazenamento. Uma torta apagaria um
    // objeto fora do prefixo da intenção.
    const repo = criarMediaRepository(
      bancoQueDevolve([{ id: 'i-1', object_key: CHAVE_TORTA }]),
    );
    await assert.rejects(() => repo.listarIntencoesVencidas(AGORA, 100), RECUSA);
  });

  void it('diz QUAL chave recusou, para a linha ruim aparecer no log', async () => {
    // Quem for diagnosticar precisa achar a linha torta no banco, e o id da
    // foto não está na mensagem do domínio: a chave está.
    const repo = criarMediaRepository(
      bancoQueDevolve([linhaDeFoto({ card_key: CHAVE_TORTA })]),
    );
    await assert.rejects(() => repo.listarDoPet(PET, DONO), /etc\/senha/);
  });

  void it('o contrapeso: a linha boa continua sendo lida, com as três chaves', async () => {
    // Sem este caso, uma conferência que recusasse tudo passaria em todos os
    // anteriores e apagaria do aplicativo a foto de todo pet — que é como a
    // tutora reconhece o animal dela num achado.
    const repo = criarMediaRepository(bancoQueDevolve([linhaDeFoto()]));
    const fotos = await repo.listarDoPet(PET, DONO);

    assert.equal(fotos.length, 1);
    const foto = fotos[0];
    assert.ok(foto !== undefined);
    assert.equal(foto.originalKey, ORIGINAL_BOA);
    assert.equal(foto.thumbKey, THUMB_BOA);
    assert.equal(foto.cardKey, CARD_BOA);
    assert.equal(foto.status, 'ready');
    assert.equal(foto.isPrimary, true);
  });

  void it('o contrapeso: derivada ainda não processada é `null`, e não recusa', async () => {
    // `thumb_key` e `card_key` são nulos até o worker rodar. Uma conferência
    // que tratasse `null` como chave inválida deixaria toda foto recém-enviada
    // ilegível entre a confirmação e o processamento.
    const repo = criarMediaRepository(
      bancoQueDevolve([linhaDeFoto({ thumb_key: null, card_key: null })]),
    );
    const fotos = await repo.listarDoPet(PET, DONO);

    assert.equal(fotos[0]?.thumbKey, null);
    assert.equal(fotos[0]?.cardKey, null);
  });

  void it('o contrapeso: a intenção e a foto do worker leem a chave boa', async () => {
    const intencoes = criarMediaRepository(
      bancoQueDevolve([
        {
          id: 'i-1',
          user_id: DONO,
          pet_id: PET,
          object_key: ORIGINAL_BOA,
          declared_type: 'image/webp',
          max_bytes: 1024,
          expires_at: new Date(AGORA),
          confirmed_at: null,
        },
      ]),
    );
    assert.equal((await intencoes.buscarIntencaoAberta('i-1', DONO, AGORA))?.objectKey, ORIGINAL_BOA);

    const worker = criarMediaRepository(
      bancoQueDevolve([{ id: 'f-1', pet_id: PET, status: 'processing', original_key: ORIGINAL_BOA }]),
    );
    assert.equal((await worker.buscarParaProcessar('f-1'))?.originalKey, ORIGINAL_BOA);

    const vencidas = criarMediaRepository(bancoQueDevolve([{ id: 'i-1', object_key: ORIGINAL_BOA }]));
    assert.equal((await vencidas.listarIntencoesVencidas(AGORA, 100))[0]?.objectKey, ORIGINAL_BOA);
  });
});
