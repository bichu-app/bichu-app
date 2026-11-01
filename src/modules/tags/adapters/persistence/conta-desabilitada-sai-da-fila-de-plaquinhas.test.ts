import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type RootOperationNode,
} from 'kysely';

import type { Db, DbTransaction } from '../../../../shared/db/pool.js';
import type { Database } from '../../../../shared/db/schema.js';
import { criarPedidoDePlaquinhaRepository } from './kysely-pedido-de-plaquinha.js';

const REF = 'yjJwZ3hBc0RmR2hKa0xtTg';

const PREDICADO_DA_CONTA = /conta_habilitada\(\s*"?r"?\."?requested_by"?\s*\)/u;

const SEM_O_PREDICADO =
  'a consulta perdeu `conta_habilitada(r.requested_by)`. O pedido de quem desabilitou a ' +
  'conta volta a aparecer nesta superficie, e a decisao do cliente de 17/10 e que conta ' +
  'desabilitada nao e mais encontrada em nenhuma pagina ou funcionalidade.';

function bancadaQueEspia(): { readonly db: Db; readonly compiladas: string[] } {
  const compiladas: string[] = [];

  class CompiladorQueEspia extends PostgresQueryCompiler {
    public override compileQuery(node: RootOperationNode, queryId: never): CompiledQuery {
      const compilada = super.compileQuery(node, queryId);
      compiladas.push(compilada.sql);
      return compilada;
    }
  }

  const db = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (instancia) => new PostgresIntrospector(instancia),
      createQueryCompiler: () => new CompiladorQueEspia(),
    },
  });

  return { db, compiladas };
}

void describe('o pedido de plaquinha de conta desabilitada sai da fila do painel', () => {
  void it('1. a PAGINA da listagem carrega `conta_habilitada(r.requested_by)`', async () => {
    const { db, compiladas } = bancadaQueEspia();
    await criarPedidoDePlaquinhaRepository({ db }).listarFila({ page: 1, limit: 50 });

    const pagina = compiladas.find((sql) => /limit/iu.test(sql));
    assert.ok(pagina !== undefined, `nenhuma consulta com LIMIT foi compilada: ${compiladas.join(' | ')}`);
    assert.match(pagina, PREDICADO_DA_CONTA, `${SEM_O_PREDICADO} SQL: ${pagina}`);
  });

  void it('2. a CONTAGEM da listagem carrega o MESMO predicado da pagina', async () => {
    const { db, compiladas } = bancadaQueEspia();
    await criarPedidoDePlaquinhaRepository({ db }).listarFila({ page: 1, limit: 50 });

    const contagem = compiladas.find((sql) => /count\(\*\)/iu.test(sql));
    assert.ok(contagem !== undefined, `nenhuma contagem foi compilada: ${compiladas.join(' | ')}`);
    assert.match(
      contagem,
      PREDICADO_DA_CONTA,
      'a CONTAGEM divergiu da pagina: o painel passa a dizer "N pendentes" sobre pedidos que a ' +
        `lista nao mostra, que e o defeito que a fila da Rede ja produziu. SQL: ${contagem}`,
    );
  });

  void it('3. a LEITURA de um pedido carrega o predicado, e nao so a listagem', async () => {
    const { db, compiladas } = bancadaQueEspia();
    const lido = await criarPedidoDePlaquinhaRepository({ db }).pedidoParaLeitura(REF);

    assert.equal(lido, undefined);
    const leitura = compiladas[0];
    assert.ok(leitura !== undefined, 'a leitura nao compilou consulta nenhuma');
    assert.match(
      leitura,
      PREDICADO_DA_CONTA,
      `${SEM_O_PREDICADO} Sem ele, o pedido que a listagem esconde volta a ser alcancavel por ` +
        `quem tiver o \`ref\`. SQL: ${leitura}`,
    );
    assert.match(leitura, /"?ref"?\s*=\s*\$\d+/u, `o \`ref\` saiu do WHERE. SQL: ${leitura}`);
  });

  void it('4. a leitura de ESCRITA (`pedidoPorRef`) tambem carrega o predicado', async () => {
    const { db, compiladas } = bancadaQueEspia();
    await criarPedidoDePlaquinhaRepository({ db }).pedidoPorRef(db as unknown as DbTransaction, REF);

    const escrita = compiladas[0];
    assert.ok(escrita !== undefined, '`pedidoPorRef` nao compilou consulta nenhuma');
    assert.match(
      escrita,
      PREDICADO_DA_CONTA,
      'sem o predicado AQUI, o painel nao LISTA o pedido da conta desabilitada mas ainda o ' +
        `DECIDE e ainda atualiza a entrega dele -- a porta de escrita fica aberta. SQL: ${escrita}`,
    );
    assert.match(
      escrita,
      /for update of\s+"?r"?/iu,
      `a leitura de escrita perdeu o \`FOR UPDATE OF r\`. SQL: ${escrita}`,
    );
  });
});
