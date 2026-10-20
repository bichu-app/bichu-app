/**
 * A lista de conversas ordena pela ULTIMA MENSAGEM, e o SQL compilado prova.
 *
 * ## O que esta bancada existe para impedir
 *
 * Pedido do cliente de 18/10/2026, literal: *"ordene por ultima mensagem"*.
 * Ate aqui `construtorDaListaDoChamador` ordenava por
 * `conversations.opened_at` -- quando a conversa NASCEU --, e o cursor saia da
 * mesma coluna.
 *
 * **Nao da para conferir isso pela resposta.** Com um duble de repositorio, a
 * ordem e a do array que o duble devolve; com o banco de integracao, uma massa
 * em que a ordem de abertura coincide com a ordem da ultima mensagem passa com
 * a chave antiga de pe -- e massa em que elas coincidem e o caso comum, porque
 * a conversa recem-aberta costuma ser a que acabou de receber mensagem. O fato
 * mora no `ORDER BY`, e o `ORDER BY` so e observavel lendo o SQL.
 *
 * Mesmo instrumento de `autorizacao-na-clausula-where.test.ts`: `DummyDriver`
 * compila a consulta REAL, com o mesmo construtor e o mesmo compilador de
 * dialeto da aplicacao, e nao a executa. Um SQL escrito a mao aqui seria o
 * atalho que parece equivalente e esconde justamente o que se foi conferir.
 *
 * ## A SEGUNDA PAGINA e o caso que decide
 *
 * O caso `o cursor da segunda pagina carrega a MESMA chave do ORDER BY` e o
 * mais importante do arquivo, e nao e redundante com o primeiro: a ordem e o
 * cursor sao dois textos diferentes no mesmo construtor, e com eles divergindo
 * a PRIMEIRA pagina sai perfeita -- o defeito aparece so depois de a pessoa
 * rolar, pulando e repetindo linhas. E o defeito que a rolagem infinita de 10
 * em 10 encontra dez vezes mais rapido que o botao `Carregar mais`.
 *
 * ## A isca, e como ela foi provada
 *
 * Em `kysely-conversation-repository.ts`, `CHAVE_DA_ORDEM` foi trocada por
 * `sql`conversations.opened_at``, a suite rodou, os casos reprovaram pelo nome,
 * e a constante foi restaurada. Os numeros medidos estao no rodape.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaContagemDoChamador,
  construtorDaListaDoChamador,
} from './kysely-conversation-repository.js';

const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PRIMEIRA = { limit: 10, depoisDe: undefined, termo: undefined };
const QUANDO = new Date('2026-10-18T12:00:00.000Z');
const SEGUNDA = {
  limit: 10,
  depoisDe: { criadaEm: QUANDO, id: '018f3a2b-0000-7000-8000-0000000000bb' },
  termo: undefined,
};

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/** Do primeiro ` order by ` em diante. */
function clausulaOrderBy(sql: string): string {
  const corte = sql.indexOf(' order by ');
  return corte < 0 ? '' : sql.slice(corte);
}

/** Do primeiro ` where ` ate o ` order by `, que e onde o cursor mora. */
function clausulaWhere(sql: string): string {
  const inicio = sql.indexOf(' where ');
  if (inicio < 0) return '';
  const fim = sql.indexOf(' order by ');
  return fim < 0 ? sql.slice(inicio) : sql.slice(inicio, fim);
}

/**
 * A chave que o `ORDER BY` (ou o cursor) usa, com os espacos colapsados.
 *
 * Colapsar o espaco e o que permite comparar as duas por IGUALDADE DE TEXTO: a
 * subconsulta e escrita em varias linhas, e a comparacao caractere a caractere
 * reprovaria por indentacao em vez de por chave diferente.
 */
function semEspaco(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

void describe('a lista de conversas ordena pela ultima mensagem, e nao pela abertura', () => {
  void it('o ORDER BY tem a ultima mensagem como PRIMEIRA chave, e a abertura so como reserva', () => {
    const compilada = construtorDaListaDoChamador(semBanco, CHAMADOR, PRIMEIRA).compile();
    const ordem = clausulaOrderBy(compilada.sql);

    assert.ok(
      ordem !== '',
      'a lista perdeu o `ORDER BY`: sem ele a ordem e a do plano do Postgres, ' +
        `que muda com o volume e com a estatistica da tabela. SQL: ${compilada.sql}`,
    );
    assert.match(
      semEspaco(ordem),
      /^order by coalesce\(\( SELECT msg\.created_at FROM conversation_messages msg/,
      'a PRIMEIRA chave do `ORDER BY` nao e a ultima mensagem. A conversa que o ' +
        'tutor abre o aplicativo para achar e a que acabou de receber recado, e ' +
        `nao a que nasceu por ultimo (pedido do cliente, 18/10/2026). SQL: ${compilada.sql}`,
    );
    assert.match(
      semEspaco(ordem),
      /, conversations\.opened_at\) desc, "conversations"\."id" desc/,
      'a abertura saiu do `coalesce`, ou o `id` saiu do desempate. Sem a abertura, ' +
        'conversa sem mensagem visivel ordena por `NULL` e o Postgres a joga para o ' +
        'TOPO (`NULLS FIRST` e o default do `DESC`): a lista abriria com as conversas ' +
        'em que ninguem escreveu nada. Sem o `id`, duas conversas com a mesma ' +
        `ultima mensagem trocam de lugar entre as paginas. SQL: ${compilada.sql}`,
    );
  });

  void it('o cursor da segunda pagina carrega a MESMA chave do ORDER BY', () => {
    const compilada = construtorDaListaDoChamador(semBanco, CHAMADOR, SEGUNDA).compile();
    const where = semEspaco(clausulaWhere(compilada.sql));
    const ordem = semEspaco(clausulaOrderBy(compilada.sql));

    // A tupla do cursor: `(<chave>, conversations.id) < ($n, $m)`.
    const tupla = /\((coalesce\(.*?\)), conversations\.id\) < \(\$(\d+), \$(\d+)\)/.exec(where);
    assert.ok(
      tupla !== null,
      'a segunda pagina perdeu a tupla do cursor. Sem ela, `cursor` e ignorado e ' +
        'a rolagem infinita devolve a PRIMEIRA pagina para sempre -- a lista para ' +
        `de crescer e ninguem recebe erro. WHERE compilado: ${where}`,
    );

    const chaveDaOrdem = /^order by (coalesce\(.*?\)) desc,/.exec(ordem);
    assert.ok(chaveDaOrdem !== null, `nao achei a chave do ORDER BY. ORDER BY: ${ordem}`);

    assert.equal(
      tupla[1],
      chaveDaOrdem[1],
      'o cursor e a ordem usam chaves DIFERENTES. Esta e a divergencia que deixa a ' +
        'PRIMEIRA pagina perfeita e estraga a segunda: a pagina seguinte continua de ' +
        'um lugar que nao e onde a ordem parou, entao linhas sao PULADAS e outras ' +
        'REPETIDAS. Com rolagem infinita de 10 em 10 isso acontece a cada dez linhas.',
    );

    // E o valor ligado a tupla e o que o cursor trouxe, e nao outro parametro.
    assert.deepEqual(
      [compilada.parameters[Number(tupla[2]) - 1], compilada.parameters[Number(tupla[3]) - 1]],
      [QUANDO, SEGUNDA.depoisDe.id],
      'a tupla do cursor esta ligada aos parametros ERRADOS: posicao certa, valor ' +
        'de outra clausula. Coluna certa com valor errado e o furo que a bancada da ' +
        'autorizacao ja pagou uma vez neste modulo.',
    );
  });

  void it('sem cursor nao ha tupla: a primeira pagina comeca no comeco', () => {
    const where = semEspaco(
      clausulaWhere(construtorDaListaDoChamador(semBanco, CHAMADOR, PRIMEIRA).compile().sql),
    );
    assert.ok(
      !where.includes('conversations.id) < ('),
      'a PRIMEIRA pagina carrega tupla de cursor. Com um instante qualquer ligado ' +
        `ali, a abertura da tela recorta a lista sem ninguem ter rolado. WHERE: ${where}`,
    );
  });
});

void describe('o `q` recorta a lista e a contagem, e nunca substitui o `WHERE` do chamador', () => {
  void it('o termo entra como ILIKE sobre pet e sobre os dois nomes do outro lado', () => {
    const compilada = construtorDaListaDoChamador(semBanco, CHAMADOR, {
      limit: 10,
      depoisDe: undefined,
      termo: 'thor',
    }).compile();
    const where = semEspaco(clausulaWhere(compilada.sql));

    assert.match(
      where,
      /"pets"\."name" ILIKE \$\d+/,
      `o termo deixou de recortar pelo nome do pet. WHERE: ${where}`,
    );
    assert.match(
      where,
      /"tutor"\."display_name" ILIKE \$\d+/,
      `o termo deixou de recortar pelo nome do tutor. WHERE: ${where}`,
    );
    assert.match(
      where,
      /coalesce\("found_reports"\."finder_display_name", "achador"\."display_name"\) ILIKE \$\d+/,
      'o termo recorta o nome do achador por UMA das duas colunas. O `coalesce` e o ' +
        'mesmo da projecao: buscar so por `found_reports.finder_display_name` deixa de ' +
        'achar quem tem conta e nao preencheu o formulario do aviso -- isto e, o achado ' +
        `avulso inteiro (BICHUS-86). WHERE: ${where}`,
    );
    assert.match(
      where,
      /"conversations"\."tutor_user_id" = \$\d+ or "conversations"\."finder_user_id" = \$\d+/,
      'o recorte do termo apagou o predicado do chamador. O `q` e um `AND` sobre a ' +
        'autorizacao (ADR-0021) e nunca o lugar dela: sem aquele predicado, um termo ' +
        `casaria conversa de terceiro. WHERE: ${where}`,
    );
  });

  void it('`%` e `_` digitados sao escapados, e nao viram curinga', () => {
    const compilada = construtorDaListaDoChamador(semBanco, CHAMADOR, {
      limit: 10,
      depoisDe: undefined,
      termo: 'th_or%',
    }).compile();
    assert.ok(
      compilada.parameters.includes('%th\\_or\\%%'),
      'o termo foi para o `ILIKE` sem escapar `%` e `_`. Um `_` digitado casaria ' +
        'qualquer caractere e um `%` casaria qualquer trecho: a pessoa leria o ' +
        `resultado como defeito da busca. Parametros: ${JSON.stringify(compilada.parameters)}`,
    );
  });

  void it('a contagem passa pelo MESMO WHERE, sem `limit` e sem `ORDER BY`', () => {
    const compilada = construtorDaContagemDoChamador(semBanco, CHAMADOR, 'thor').compile();
    const where = semEspaco(clausulaWhere(compilada.sql));

    assert.match(
      compilada.sql,
      /^select count\(\*\) as "n" from "conversations"/,
      `a contagem deixou de contar. SQL: ${compilada.sql}`,
    );
    assert.ok(
      !compilada.sql.includes(' limit '),
      '`ConversationPage.total` saiu com `limit`: ele seria no maximo o tamanho da ' +
        `pagina, e a linha de resumo diria 10 a quem tem 57. SQL: ${compilada.sql}`,
    );
    assert.match(
      where,
      /"conversations"\."tutor_user_id" = \$\d+ or "conversations"\."finder_user_id" = \$\d+/,
      'a contagem perdeu o predicado do chamador: ela contaria conversa de terceiro ' +
        `e o numero publicaria quantas conversas existem no banco. WHERE: ${where}`,
    );
    assert.match(
      where,
      /"pets"\."name" ILIKE \$\d+/,
      'a contagem ignora o `q`: a lista mostraria 3 resultados com a linha de resumo ' +
        `dizendo 57. WHERE: ${where}`,
    );
  });

  void it('sem termo nao ha ILIKE: a lista inteira nao paga predicado nenhum', () => {
    const compilada = construtorDaListaDoChamador(semBanco, CHAMADOR, PRIMEIRA).compile();
    assert.ok(
      !compilada.sql.includes('ILIKE'),
      'a lista sem busca monta `ILIKE`. `q` ausente e `q=` querem a lista inteira, e ' +
        'um curinga que casa tudo e a mesma resposta por um caminho mais caro. ' +
        `SQL: ${compilada.sql}`,
    );
  });
});

/**
 * ---------------------------------------------------------------------------
 * A ISCA, MEDIDA
 *
 * Os numeros abaixo foram escritos DEPOIS de rodar, e nao antes.
 *
 * Ver o relatorio da entrega: `CHAVE_DA_ORDEM` trocada por
 * `sql`conversations.opened_at`` em `kysely-conversation-repository.ts`,
 * `npm test` com Node 22, casos reprovados pelo nome, constante restaurada.
 */
