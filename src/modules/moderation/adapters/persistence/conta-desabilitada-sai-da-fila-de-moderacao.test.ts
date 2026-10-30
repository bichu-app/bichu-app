/**
 * ISCA (c): a denuncia de quem desabilitou a conta sai da fila de moderacao, e sai
 * dos TRES lugares de uma vez -- da LISTAGEM, da LEITURA e da CONTAGEM.
 */
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

import type { Db } from '../../../../shared/db/pool.js';
import type { Database } from '../../../../shared/db/schema.js';
import type { TrilhaTransacional } from '../../../audit/ports/audit-log.js';
import { criarFilaDeModeracaoRepository } from './kysely-fila-de-moderacao.js';

const ALVO = 'yjJwZ3hBc0RmR2hKa0xtTg';

/** O predicado, como o compilador do Postgres o escreve. */
const PREDICADO = /"?f"?\."?reporter_active"?/u;

const SEM_O_PREDICADO =
  'a consulta perdeu `f.reporter_active`. A denuncia de quem desabilitou a conta volta a ' +
  'aparecer nesta superficie, e a decisao do cliente de 17/10 e que conta desabilitada nao e ' +
  'mais encontrada em nenhuma pagina ou funcionalidade.';

/** A trilha nao e exercitada por nenhum caso deste arquivo: so leitura. */
const TRILHA_NAO_CHAMADA: TrilhaTransacional = {
  recordIn: () => {
    throw new Error('nenhum caso deste arquivo escreve: a trilha nao devia ser chamada.');
  },
};

/** Kysely sem banco, com o compilador trocado por um que GUARDA o SQL. */
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

function fila(db: Db) {
  return criarFilaDeModeracaoRepository({ db, trilha: TRILHA_NAO_CHAMADA });
}

void describe('a denuncia de conta desabilitada sai da fila de moderacao', () => {
  void it('1. a PAGINA da listagem carrega `f.reporter_active`', async () => {
    const { db, compiladas } = bancadaQueEspia();
    await fila(db).listar({ page: 1, limit: 50 });

    const pagina = compiladas.find((sql) => /limit/iu.test(sql));
    assert.ok(
      pagina !== undefined,
      `nenhuma consulta com LIMIT foi compilada: ${compiladas.join(' | ')}`,
    );
    assert.match(pagina, PREDICADO, `${SEM_O_PREDICADO} SQL: ${pagina}`);
    assert.match(
      pagina,
      /group by/iu,
      `a pagina perdeu o GROUP BY: o item da fila volta a ser a denuncia e nao o alvo, e \`report_count\` deixa de existir. SQL: ${pagina}`,
    );
  });

  void it('2. a CONTAGEM DO RECORTE carrega o MESMO predicado da pagina', async () => {
    const { db, compiladas } = bancadaQueEspia();
    await fila(db).listar({ page: 1, limit: 50 });

    const contagens = compiladas.filter((sql) => /count\(\*\)/iu.test(sql) && !/limit/iu.test(sql));
    assert.equal(
      contagens.length,
      2,
      `esperava DUAS contagens sem LIMIT (o recorte e o aviso do menu); vieram ${contagens.length}: ${compiladas.join(' | ')}`,
    );
    for (const contagem of contagens) {
      assert.match(
        contagem,
        PREDICADO,
        'uma CONTAGEM divergiu da pagina: o painel passa a dizer "N pendentes" sobre itens que a ' +
          `lista nao mostra, que e o defeito que a fila da Rede ja produziu. SQL: ${contagem}`,
      );
    }
  });

  void it('3. a LEITURA de um item carrega o predicado, e nao so a listagem', async () => {
    const { db, compiladas } = bancadaQueEspia();
    const lido = await fila(db).itemPorAlvo('review', ALVO);

    assert.equal(lido, null);
    const leitura = compiladas[0];
    assert.ok(leitura !== undefined, 'a leitura nao compilou consulta nenhuma');
    assert.match(
      leitura,
      PREDICADO,
      `${SEM_O_PREDICADO} Sem ele, o item que a listagem esconde volta a ser alcancavel -- e ` +
        `DECIDIVEL, porque e por esta mesma funcao que a escrita le o item antes de gravar. SQL: ${leitura}`,
    );
    assert.match(leitura, /target_ref"?\s*=\s*\$\d+/u, `o \`target_ref\` saiu do WHERE. SQL: ${leitura}`);
  });

  void it('4. a CONTAGEM DO AVISO DO MENU (`pending_total`) carrega o predicado', async () => {
    const { db, compiladas } = bancadaQueEspia();
    await fila(db).listar({ estado: 'resolved', page: 1, limit: 50 });

    const aviso = compiladas.find(
      (sql) => /count\(\*\)/iu.test(sql) && /resolved_at"? is null/iu.test(sql),
    );
    assert.ok(
      aviso !== undefined,
      'nenhuma contagem com `resolved_at is null` foi compilada: o aviso do menu passou a seguir ' +
        `o recorte, e o numero do menu deixa de responder "quanto trabalho esta esperando". SQL: ${compiladas.join(' | ')}`,
    );
    assert.match(
      aviso,
      PREDICADO,
      'o AVISO DO MENU perdeu o predicado: e exatamente este o defeito que a fila da Rede ' +
        `produziu -- o painel diz "1 pendente" sobre uma fila que a listagem mostra vazia. SQL: ${aviso}`,
    );
  });
});
