/**
 * ISCA (c): a denuncia de quem desabilitou a conta sai da fila de moderacao, e
 * sai dos TRES lugares de uma vez -- da LISTAGEM, da LEITURA e da CONTAGEM.
 *
 * ## A decisao
 *
 * Decisao do cliente de 17/10/2026: conta desabilitada "nao e mais encontrada
 * em nenhuma pagina ou funcionalidade". A fila de moderacao e uma
 * funcionalidade.
 *
 * ## Por que TRES, e nao um
 *
 * Na fila da Rede, filtrar so a listagem fez o painel dizer "1 pendente" sobre
 * uma fila vazia, e quem abriu procurou um pedido que a listagem nao mostrava
 * mais. A `20261017000016` deixou isso escrito por extenso. Os tres lugares
 * desta fila sao:
 *
 * 1. a **LISTAGEM** (`listar`, a consulta das linhas, reconhecida pelo
 *    `LIMIT`) -- e a contagem do recorte, que e a irma dela;
 * 2. a **LEITURA de um item** (`itemPorAlvo`), sem a qual o item que a
 *    listagem esconde volta a ser alcancavel -- e DECIDIVEL, porque e pela
 *    mesma funcao que a escrita le o item antes de gravar;
 * 3. a **CONTAGEM DO AVISO DO MENU** (`listar`, o `pendentes`), que e o numero
 *    que a casca do painel mostra ao lado do item da navegacao. **Esta fila
 *    TEM aviso de menu** -- ao contrario da fila da plaquinha --, entao aqui o
 *    terceiro lugar e literalmente o da fila da Rede.
 *
 * ## Por que ler o SQL COMPILADO, e nao a resposta da rota
 *
 * A protecao nao e "a rota nao devolveu o item": e **onde** a decisao mora.
 * Uma consulta que trouxesse a denuncia da conta desabilitada e a descartasse
 * num `filter` da aplicacao responderia igual -- ate o dia em que alguem mexe
 * no `filter`, e ai nao existe caso que acuse, porque o `filter` era o caso.
 *
 * Mesmo instrumento de `conta-desabilitada-sai-da-fila-de-plaquinhas.test.ts`:
 * o compilador do Postgres de verdade, com um que ESPIA cada consulta
 * compilada. `DummyDriver` nao vai a banco nenhum e devolve zero linhas; o que
 * este arquivo le e o texto que teria ido ao Postgres.
 *
 * ## Como estas iscas SERIAM desligadas
 *
 * | o que mexer em `kysely-fila-de-moderacao.ts` | esperado |
 * |---|---|
 * | apagar `AND ${DENUNCIANTE_ATIVO}` da pagina de `listar` | reprova o caso 1 |
 * | apagar o mesmo da contagem do recorte | reprova o caso 2 |
 * | apagar o mesmo de `lerItem` | reprova o caso 3 |
 * | apagar o mesmo da contagem de `pendentes` | reprova o caso 4 |
 * | trocar `f.reporter_active` por um `filter` em TypeScript | reprovam os quatro |
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

/**
 * O predicado, como o compilador do Postgres o escreve.
 *
 * `reporter_active` e a coluna BOOLEANA da visao `fila_de_moderacao`, que vem
 * das funcoes `denuncia_de_*_com_denunciante_ativo(uuid)` -- as duas delegando
 * a `conta_habilitada(uuid)`, o ponto unico da definicao. A isca cobra a
 * coluna, e nao o nome da funcao, porque e a coluna que `src/` escreve: o nome
 * da coluna de autoria nao pode aparecer em `.ts` nenhum (`portao-colunas-que-
 * nao-saem.ts`), e e justamente por isso que o predicado e funcao no SQL.
 */
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

/**
 * Kysely sem banco, com o compilador trocado por um que GUARDA o SQL.
 *
 * O compilador e o do Postgres de verdade (`PostgresQueryCompiler`), e nao um
 * gerador de texto escrito aqui: um SQL montado a mao neste arquivo seria o
 * atalho que faz a isca medir a si mesma.
 */
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

    // `listar` compila TRES consultas: a contagem do recorte, a pagina e a
    // contagem do aviso do menu. A pagina e a unica com `LIMIT`, e e por ela
    // que este caso a reconhece -- a ordem das tres no adaptador nao e o que o
    // caso mede.
    const pagina = compiladas.find((sql) => /limit/iu.test(sql));
    assert.ok(
      pagina !== undefined,
      `nenhuma consulta com LIMIT foi compilada: ${compiladas.join(' | ')}`,
    );
    assert.match(pagina, PREDICADO, `${SEM_O_PREDICADO} SQL: ${pagina}`);
    // E a agregacao por ALVO continua: a isca nao pode ficar verde sobre uma
    // consulta que perdeu o `GROUP BY` e voltou a listar denuncia por denuncia.
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

    // `DummyDriver` devolve zero linhas, entao a leitura e `null`. O que este
    // caso mede e o SQL, e nao a linha.
    assert.equal(lido, null);
    const leitura = compiladas[0];
    assert.ok(leitura !== undefined, 'a leitura nao compilou consulta nenhuma');
    assert.match(
      leitura,
      PREDICADO,
      `${SEM_O_PREDICADO} Sem ele, o item que a listagem esconde volta a ser alcancavel -- e ` +
        `DECIDIVEL, porque e por esta mesma funcao que a escrita le o item antes de gravar. SQL: ${leitura}`,
    );
    // E o alvo continua no `WHERE`: a isca nao pode ficar verde por uma
    // consulta que perdeu o proprio criterio de busca.
    assert.match(leitura, /target_ref"?\s*=\s*\$\d+/u, `o \`target_ref\` saiu do WHERE. SQL: ${leitura}`);
  });

  void it('4. a CONTAGEM DO AVISO DO MENU (`pending_total`) carrega o predicado', async () => {
    const { db, compiladas } = bancadaQueEspia();
    // Com recorte de `resolved`: o aviso do menu IGNORA o recorte e continua
    // contando o que esta ABERTO. Se ele seguisse o recorte, o menu mostraria
    // "quantas denuncias ja foram decididas", que nao e trabalho esperando.
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
