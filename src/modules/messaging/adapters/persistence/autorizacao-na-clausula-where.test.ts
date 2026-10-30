/** A autorização da conversa está na cláusula `WHERE`, e o SQL compilado prova. */
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
import type { ConversationId, Instant, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaBuscaDoChamador,
  construtorDaContagemDoParticipante,
  construtorDaListaDoChamador,
  construtorDaRetencao,
  construtorDasMensagens,
  construtorDosCasosDistintosDaConta,
} from './kysely-conversation-repository.js';

const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc' as ConversationId;
const DESDE = 1_790_000_000_000 as Instant;
const PAGINA = { limit: 20, depoisDe: undefined, termo: undefined };

/** Kysely sem banco: ele compila a consulta e não a executa. */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/** Os dois predicados do chamador, como o compilador do Postgres os escreve. */
const PREDICADO_DO_TUTOR = /"tutor_user_id"\s*=\s*\$(\d+)/g;
const PREDICADO_DO_ACHADOR = /"finder_user_id"\s*=\s*\$(\d+)/g;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/** **A cláusula `WHERE`, e nada antes dela.** */
function clausulaWhere(sql: string): string {
  const corte = sql.indexOf(' where ');
  assert.ok(
    corte >= 0,
    'a consulta ficou SEM clausula WHERE: ela atinge a tabela inteira, e o ' +
      `recorte nao teria onde procurar a autorizacao. SQL: ${sql}`,
  );
  return sql.slice(corte);
}

void describe('o recorte da clausula WHERE', () => {
  void it('REPROVA um SQL sem `WHERE`, em vez de devolver vazio', () => {
    assert.throws(
      () => clausulaWhere('select "c"."id" from "conversations" as "c"'),
      /SEM clausula WHERE/,
    );
  });

  void it('com `WHERE`, o recorte deixa a lista de selecao FORA', () => {
    const recorte = clausulaWhere(
      'select case when "m"."sender" = $1 then 1 else 0 end as "meu" ' +
        'from "messages" as "m" where "m"."conversation" = $2',
    );
    assert.ok(!recorte.includes('case when'), 'o `CASE` da selecao entrou no recorte');
    assert.ok(recorte.includes('"m"."conversation"'), 'o predicado saiu do recorte');
  });
});

/** TODOS os valores ligados às posições que aquele predicado ocupa NO `WHERE`. */
function valoresLigadosA(predicado: RegExp, compilada: Compilada): unknown[] {
  const copia = new RegExp(predicado.source, 'g');
  const clausula = clausulaWhere(compilada.sql);
  const valores: unknown[] = [];
  let achado = copia.exec(clausula);
  while (achado !== null) {
    valores.push(compilada.parameters[Number(achado[1]) - 1]);
    achado = copia.exec(clausula);
  }
  return valores;
}

/** O predicado do chamador existe NO `WHERE`, e TUDO que ele liga é o chamador. */
function exigirChamadorNoWhere(compilada: Compilada, onde: string): void {
  const doTutor = valoresLigadosA(PREDICADO_DO_TUTOR, compilada);
  const doAchador = valoresLigadosA(PREDICADO_DO_ACHADOR, compilada);
  assert.ok(
    doTutor.length > 0,
    `${onde} perdeu o predicado do tutor. SQL compilado: ${compilada.sql}`,
  );
  assert.ok(
    doAchador.length > 0,
    `${onde} perdeu o predicado do achador: um dos dois lados deixou de ser ` +
      `autorizado pela consulta. SQL compilado: ${compilada.sql}`,
  );
  for (const valor of [...doTutor, ...doAchador]) {
    assert.equal(
      valor,
      CHAMADOR,
      `${onde} compara a coluna certa com o valor ERRADO (${String(valor)}). ` +
        `Coluna certa, operador certo e valor errado é uma igualdade acidental ` +
        `esperando dois uuids coincidirem. SQL: ${compilada.sql}`,
    );
  }
}

void describe('toda consulta de conversa que responde a uma pessoa carrega o chamador no WHERE', () => {
  void it('a lista tem os dois predicados, e os dois ligados ao chamador', () => {
    exigirChamadorNoWhere(construtorDaListaDoChamador(semBanco, CHAMADOR, PAGINA).compile(), 'a lista');
  });

  void it('a busca por id tem os dois predicados, e o id é filtro A MAIS', () => {
    const compilada = construtorDaBuscaDoChamador(semBanco, CONVERSA, CHAMADOR).compile();
    exigirChamadorNoWhere(compilada, 'a busca');
    assert.match(
      compilada.sql,
      /"conversations"\."id"\s*=\s*\$\d+/,
      `a busca perdeu o filtro do id. SQL: ${compilada.sql}`,
    );
  });

  void it('as MENSAGENS carregam o chamador na própria consulta', () => {
    const compilada = construtorDasMensagens(semBanco, CONVERSA, CHAMADOR, PAGINA).compile();
    exigirChamadorNoWhere(compilada, 'a leitura de mensagens');
    assert.match(
      compilada.sql,
      /inner join "conversations"/,
      `a junção que carrega o dono sumiu. SQL: ${compilada.sql}`,
    );
  });

  void it('a contagem do participante é presa à conversa e ao papel', () => {
    const { sql, parameters } = construtorDaContagemDoParticipante(
      semBanco,
      CONVERSA,
      'tutor',
      DESDE,
    ).compile();
    assert.match(sql, /"conversation_id"\s*=\s*\$\d+/, `SQL: ${sql}`);
    assert.match(sql, /"sender_role"\s*=\s*\$\d+/, `SQL: ${sql}`);
    assert.ok(parameters.includes(CONVERSA));
  });

  void it('a contagem de casos distintos é presa à conta que escreveu', () => {
    const { sql, parameters } = construtorDosCasosDistintosDaConta(
      semBanco,
      CHAMADOR,
      DESDE,
    ).compile();
    const achado = /"sender_user_id"\s*=\s*\$(\d+)/.exec(sql);
    assert.ok(achado !== null, `a contagem perdeu o predicado da conta. SQL: ${sql}`);
    assert.equal(parameters[Number(achado[1]) - 1], CHAMADOR);
  });

  void it('a contagem do falso achador em série olha só o lado do ACHADOR', () => {
    const compilada = construtorDosCasosDistintosDaConta(semBanco, CHAMADOR, DESDE).compile();
    const achado = /"finder_user_id"\s*=\s*\$(\d+)/.exec(compilada.sql);
    assert.ok(
      achado !== null,
      `a contagem perdeu o recorte do achador e voltou a alcançar o tutor. SQL: ${compilada.sql}`,
    );
    assert.equal(compilada.parameters[Number(achado[1]) - 1], CHAMADOR);
  });

  void it('a contagem conta CASOS DISTINTOS, e não mensagens (critério 17)', () => {
    const { sql } = construtorDosCasosDistintosDaConta(semBanco, CHAMADOR, DESDE).compile();
    assert.match(
      sql,
      /count\(distinct coalesce\(conversations\.case_id, conversations\.id\)\)/,
      `a contagem deixou de contar casos distintos. SQL: ${sql}`,
    );
  });
});

/** Duas junções cuja quebra NÃO aparece em predicado nenhum. */
void describe('a correlação entre as tabelas, e não só o predicado', () => {
  void it('as mensagens são correlacionadas À conversa, coluna contra coluna', () => {
    const { sql } = construtorDasMensagens(semBanco, CONVERSA, CHAMADOR, PAGINA).compile();
    assert.match(
      sql,
      /inner join "conversations" on "conversations"\."id" = "conversation_messages"\."conversation_id"/,
      'a correlação entre mensagem e conversa sumiu: o predicado do chamador continuaria ' +
        'ligado, e a consulta passaria a perguntar "esta pessoa participa de alguma ' +
        `conversa?" em vez de "estas mensagens são desta conversa?". SQL: ${sql}`,
    );
  });

  void it('o nome do tutor vem do tutor DESTA conversa', () => {
    const { sql } = construtorDaBuscaDoChamador(semBanco, CONVERSA, CHAMADOR).compile();
    assert.match(
      sql,
      /inner join "users" as "tutor" on "tutor"\."id" = "conversations"\."tutor_user_id"/,
      'a correlação do nome do tutor sumiu. Sem ela o cabeçalho da conversa passa a ' +
        `mostrar o primeiro nome de outra pessoa. SQL: ${sql}`,
    );
  });

  void it('o nome do achador vem do aviso DESTA conversa', () => {
    const { sql } = construtorDaBuscaDoChamador(semBanco, CONVERSA, CHAMADOR).compile();
    assert.match(
      sql,
      /inner join "found_reports" on "found_reports"\."id" = "conversations"\."found_report_id"/,
      `a correlação do aviso sumiu. SQL: ${sql}`,
    );
  });

  void it('o estado do caso vem do caso DESTA conversa', () => {
    const { sql } = construtorDaBuscaDoChamador(semBanco, CONVERSA, CHAMADOR).compile();
    assert.match(
      sql,
      /left join "lost_cases" on "lost_cases"\."id" = "conversations"\."case_id"/,
      `a correlação do caso sumiu. SQL: ${sql}`,
    );
  });

  void it('a contagem de casos distintos é correlacionada à conversa de cada mensagem', () => {
    const { sql } = construtorDosCasosDistintosDaConta(semBanco, CHAMADOR, DESDE).compile();
    assert.match(
      sql,
      /inner join "conversations" on "conversations"\."id" = "conversation_messages"\."conversation_id"/,
      `a correlação sumiu, e o gatilho do critério 17 passa a contar outra coisa. SQL: ${sql}`,
    );
  });

  void it('ISCA — uma junção correlacionada a um PARÂMETRO é outra pergunta', () => {
    const solta = semBanco
      .selectFrom('conversation_messages')
      .innerJoin('conversations', (j) => j.on('conversations.id', '=', CONVERSA))
      .select(['conversation_messages.id'])
      .where('conversations.tutor_user_id', '=', CHAMADOR)
      .where('conversations.finder_user_id', '=', CHAMADOR)
      .compile();
    exigirChamadorNoWhere(solta, 'a isca da correlação');
    assert.ok(
      !/on "conversations"\."id" = "conversation_messages"\."conversation_id"/.test(solta.sql),
      'a isca precisa mesmo estar sem a correlação, senão ela não prova nada',
    );
  });
});

void describe('a retenção preserva a primeira, e não a última', () => {
  void it('ela só escreve quando ainda não havia retenção', () => {
    const { sql } = construtorDaRetencao(semBanco, CONVERSA, 'serial_finder', DESDE).compile();
    assert.match(sql, /"held_for_review_at"\s+is\s+null/, `SQL: ${sql}`);
    assert.match(sql, /"id"\s*=\s*\$\d+/, `SQL: ${sql}`);
  });
});

void describe('ISCA: a mesma conferência REPROVA uma consulta sem o chamador', () => {
  void it('um SELECT sem predicado nenhum é acusado', () => {
    const semDono = semBanco
      .selectFrom('conversations')
      .select(['id'])
      .where('id', '=', CONVERSA)
      .compile();
    assert.throws(
      () => exigirChamadorNoWhere(semDono, 'a isca'),
      /perdeu o predicado do tutor/,
      'a conferência aprovou uma consulta que lê conversa de qualquer pessoa: ela ' +
        'parou de enxergar a ausência do chamador, e os casos acima passaram a ' +
        'medir o silêncio dela',
    );
  });

  void it('um WHERE com a coluna certa e o operador errado também é acusado', () => {
    const operadorErrado = semBanco
      .selectFrom('conversations')
      .select(['id'])
      .where('tutor_user_id', 'is not', CHAMADOR)
      .where('finder_user_id', '=', CHAMADOR)
      .compile();
    assert.ok(operadorErrado.sql.includes('"tutor_user_id"'), 'a isca precisa citar a coluna');
    assert.throws(
      () => exigirChamadorNoWhere(operadorErrado, 'a isca'),
      /perdeu o predicado do tutor/,
      `uma conferência que só procurasse o NOME aprovaria isto: ${operadorErrado.sql}`,
    );
  });

  void it('um WHERE com a coluna e o operador certos e o VALOR errado é acusado', () => {
    const valorErrado = semBanco
      .selectFrom('conversations')
      .select(['id'])
      .where('tutor_user_id', '=', CONVERSA as unknown as UserId)
      .where('finder_user_id', '=', CHAMADOR)
      .compile();
    assert.ok(
      valorErrado.parameters.includes(CHAMADOR),
      'a isca precisa mesmo ter o chamador entre os parâmetros, senão não prova nada',
    );
    assert.throws(
      () => exigirChamadorNoWhere(valorErrado, 'a isca'),
      /valor ERRADO/,
      `uma conferência por \`includes\` aprovaria isto: ${valorErrado.sql}`,
    );
  });

  void it('ISCA — o predicado que só existe no `CASE` NÃO conta como autorização', () => {
    const soNoCase = semBanco
      .selectFrom('conversations')
      .select((eb) => [
        'conversations.id',
        eb
          .case()
          .when('conversations.tutor_user_id', '=', CHAMADOR)
          .then('tutor')
          .else('finder')
          .end()
          .as('papel_do_chamador'),
      ])
      .where('conversations.finder_user_id', '=', CHAMADOR)
      .compile();

    assert.ok(
      /"tutor_user_id"\s*=\s*\$\d+/.test(soNoCase.sql),
      'a isca precisa MESMO ter a coluna no SQL, fora do WHERE, senão não prova nada',
    );
    assert.throws(
      () => exigirChamadorNoWhere(soNoCase, 'a isca do CASE'),
      /perdeu o predicado do tutor/,
      `a conferência voltou a olhar o SQL inteiro e aprovou isto: ${soNoCase.sql}`,
    );
  });

  void it('perder UM dos dois lados é acusado, e não só perder os dois', () => {
    const soOTutor = semBanco
      .selectFrom('conversations')
      .select(['id'])
      .where('tutor_user_id', '=', CHAMADOR)
      .compile();
    assert.throws(() => exigirChamadorNoWhere(soOTutor, 'a isca'), /predicado do achador/);
  });
});
