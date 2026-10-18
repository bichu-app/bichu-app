/**
 * ISCA: o pedido de plaquinha de quem desabilitou a conta sai da fila do
 * painel, e sai dos TRES lugares de uma vez.
 *
 * ## A decisao
 *
 * Decisao do cliente de 17/10/2026: conta desabilitada "nao e mais encontrada
 * em nenhuma pagina ou funcionalidade". A fila administrativa e uma
 * funcionalidade.
 *
 * ## Por que TRES, e nao um
 *
 * Na fila da Rede, filtrar so a listagem fez o painel dizer "1 pendente" sobre
 * uma fila vazia, e quem abriu procurou um pedido que a listagem nao mostrava
 * mais. A `20261017000016` deixou isso escrito por extenso. Os tres lugares
 * desta fila sao:
 *
 * 1. a PAGINA da listagem (`listarFila`, a consulta dos itens);
 * 2. a CONTAGEM da listagem (`listarFila`, o `count(*)`) -- e o numero que a
 *    tela mostra, e divergir dele da o defeito acima;
 * 3. a LEITURA de um (`pedidoParaLeitura`), sem a qual o pedido que a listagem
 *    esconde volta a ser alcancavel por quem tiver o `ref`.
 *
 * Ha um QUARTO, e ele e de escrita: `pedidoPorRef`, por onde passam a decisao e
 * a atualizacao de entrega. Sem o predicado la, o painel nao LISTA o pedido mas
 * ainda o DECIDE -- e o caso 4 deste arquivo e o que guarda isso.
 *
 * **Nao ha contagem no MENU para esta fila.** `AdminCollarTagRequestPage` nao
 * tem `pending_total` e a casca do painel nao pede nenhum numero para
 * `/admin/tag-requests` -- o aviso do menu e so da fila de indicacoes. Entao o
 * "terceiro lugar" da fila da Rede aqui e a contagem da propria listagem, que e
 * o unico numero que esta superficie produz. Se um aviso de menu for criado um
 * dia, ele precisa deste mesmo predicado, e e por isso que a ausencia esta
 * escrita aqui em vez de apenas omitida.
 *
 * ## Por que ler o SQL COMPILADO, e nao a resposta da rota
 *
 * A protecao nao e "a rota nao devolveu o pedido": e **onde** a decisao mora.
 * Uma consulta que trouxesse o pedido da conta desabilitada e o descartasse num
 * `filter` da aplicacao responderia igual -- ate o dia em que alguem mexe no
 * `filter`, e ai nao existe caso que acuse, porque o `filter` era o caso.
 *
 * Mesmo instrumento de `conta-desabilitada-sai-da-agenda.test.ts`, com uma
 * diferenca de mecanica: aquele adaptador usa o construtor tipado do Kysely e
 * basta compilar o construtor. Este usa `sql` cru executado contra o `Db`,
 * entao o compilador do dialeto e substituido por um que ESPIA cada consulta
 * compilada. `DummyDriver` nao vai a banco nenhum e devolve zero linhas; o que
 * este arquivo le e o texto que teria ido ao Postgres.
 *
 * ## Como estas iscas SERIAM desligadas
 *
 * | o que mexer em `kysely-pedido-de-plaquinha.ts` | esperado |
 * |---|---|
 * | apagar `AND ${SOLICITANTE_ATIVO}` da pagina de `listarFila` | reprova o caso 1 |
 * | apagar o mesmo da contagem de `listarFila` | reprova o caso 2 |
 * | apagar o mesmo de `pedidoParaLeitura` | reprova o caso 3 |
 * | apagar o mesmo de `pedidoPorRef` | reprova o caso 4 |
 * | trocar `conta_habilitada` por outro nome de funcao | reprovam os quatro |
 * | chamar `conta_habilitada()` sem argumento, ou com outra coluna | reprovam os quatro |
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

import type { Db, DbTransaction } from '../../../../shared/db/pool.js';
import type { Database } from '../../../../shared/db/schema.js';
import { criarPedidoDePlaquinhaRepository } from './kysely-pedido-de-plaquinha.js';

const REF = 'yjJwZ3hBc0RmR2hKa0xtTg';

/**
 * O predicado, como o compilador do Postgres o escreve.
 *
 * Cobra a CHAMADA COM O ARGUMENTO, e nao so o nome da funcao: um
 * `conta_habilitada(NULL)` ou uma mencao em comentario nao protegem nada. O
 * `sql` cru deste adaptador nao cita identificador, entao `r.requested_by` sai
 * literal -- as aspas opcionais da expressao cobrem o dia em que alguem passar
 * a consulta para o construtor tipado.
 */
const PREDICADO_DA_CONTA = /conta_habilitada\(\s*"?r"?\."?requested_by"?\s*\)/u;

const SEM_O_PREDICADO =
  'a consulta perdeu `conta_habilitada(r.requested_by)`. O pedido de quem desabilitou a ' +
  'conta volta a aparecer nesta superficie, e a decisao do cliente de 17/10 e que conta ' +
  'desabilitada nao e mais encontrada em nenhuma pagina ou funcionalidade.';

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

void describe('o pedido de plaquinha de conta desabilitada sai da fila do painel', () => {
  void it('1. a PAGINA da listagem carrega `conta_habilitada(r.requested_by)`', async () => {
    const { db, compiladas } = bancadaQueEspia();
    await criarPedidoDePlaquinhaRepository({ db }).listarFila({ page: 1, limit: 50 });

    // `listarFila` compila DUAS consultas: a pagina e a contagem. A pagina e a
    // que carrega `LIMIT`, e e por ela que este caso a reconhece -- a ordem das
    // duas no adaptador nao e o que o caso mede.
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

    // `DummyDriver` devolve zero linhas, entao a leitura e `undefined`. O que
    // este caso mede e o SQL, e nao a linha.
    assert.equal(lido, undefined);
    const leitura = compiladas[0];
    assert.ok(leitura !== undefined, 'a leitura nao compilou consulta nenhuma');
    assert.match(
      leitura,
      PREDICADO_DA_CONTA,
      `${SEM_O_PREDICADO} Sem ele, o pedido que a listagem esconde volta a ser alcancavel por ` +
        `quem tiver o \`ref\`. SQL: ${leitura}`,
    );
    // E o `ref` continua no `WHERE`: a isca nao pode ficar verde por uma
    // consulta que perdeu o proprio criterio de busca.
    assert.match(leitura, /"?ref"?\s*=\s*\$\d+/u, `o \`ref\` saiu do WHERE. SQL: ${leitura}`);
  });

  void it('4. a leitura de ESCRITA (`pedidoPorRef`) tambem carrega o predicado', async () => {
    const { db, compiladas } = bancadaQueEspia();
    // `pedidoPorRef` recebe uma transacao; `DummyDriver` nao abre banco, e o
    // `Db` serve de executor para a compilacao -- e o SQL que interessa.
    await criarPedidoDePlaquinhaRepository({ db }).pedidoPorRef(db as unknown as DbTransaction, REF);

    const escrita = compiladas[0];
    assert.ok(escrita !== undefined, '`pedidoPorRef` nao compilou consulta nenhuma');
    assert.match(
      escrita,
      PREDICADO_DA_CONTA,
      'sem o predicado AQUI, o painel nao LISTA o pedido da conta desabilitada mas ainda o ' +
        `DECIDE e ainda atualiza a entrega dele -- a porta de escrita fica aberta. SQL: ${escrita}`,
    );
    // E o `FOR UPDATE` continua, travando a linha do pedido e nao a do pet.
    assert.match(
      escrita,
      /for update of\s+"?r"?/iu,
      `a leitura de escrita perdeu o \`FOR UPDATE OF r\`. SQL: ${escrita}`,
    );
  });
});
