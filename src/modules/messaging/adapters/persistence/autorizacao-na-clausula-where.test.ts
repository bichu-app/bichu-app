/**
 * A autorização da conversa está na cláusula `WHERE`, e o SQL compilado prova.
 *
 * ## Por que conferir o SQL, e não a resposta
 *
 * `application/conversation-service.test.ts` afirma que conversa de outra
 * pessoa responde 404, e ele passa. Ele passa porque **o dublê devolve
 * `undefined`**, e não porque a consulta filtra: o repositório de verdade não
 * participa daquele arquivo. Um `buscarDoChamador` que ignorasse o segundo
 * argumento continuaria verde lá com o furo de pé.
 *
 * O ADR-0021 não diz "não devolva a linha do outro". Ele diz **onde** a decisão
 * mora, e isso não é observável de fora: a consulta que traz a linha do outro e
 * a descarta num `if` responde igual — até o dia em que alguém mexe no `if`, e
 * aí não existe teste que acuse, porque o `if` era o teste.
 *
 * Este arquivo é o instrumento da BICHUS-92
 * (`identity/adapters/persistence/autorizacao-na-clausula-where.test.ts`) com a
 * emenda da BICHUS-237, aplicado ao adaptador de conversas: ele compila as
 * consultas com `DummyDriver`, sem banco e sem executá-las, lê o predicado, e
 * confere o valor ligado à posição `$n` **daquele** predicado. Conferir
 * `parameters.includes(CHAMADOR)` seria mais frouxo do que parece — numa
 * consulta que também liga o id da conversa, ela aprovaria
 * `where('tutor_user_id', '=', conversaId)`: coluna certa, operador certo,
 * valor errado.
 *
 * Ele lê o **SQL compilado**, nunca o texto-fonte do adaptador. A distinção
 * importa: uma conferência que procurasse a coluna no arquivo casaria com a
 * menção dentro deste comentário e dentro do comentário do próprio adaptador, e
 * ficaria verde com a cláusula removida.
 *
 * ## A isca, e como ela foi provada
 *
 * Cada mecanismo foi desligado em `kysely-conversation-repository.ts`, a suíte
 * rodou, e o mecanismo foi restaurado. Os números medidos estão no rodapé do
 * arquivo, escritos depois da execução.
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
const PAGINA = { limit: 20, depoisDe: undefined };

/**
 * Kysely sem banco: ele compila a consulta e não a executa.
 *
 * É o caminho REAL — o mesmo construtor e o mesmo compilador de dialeto do
 * Postgres que a aplicação usa. Um SQL escrito à mão aqui seria o atalho que
 * parece equivalente e esconde exatamente o que se foi conferir.
 */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/**
 * Os dois predicados do chamador, como o compilador do Postgres os escreve.
 *
 * As expressões cobram o OPERADOR junto do nome. Sem isso, um `is not` com a
 * coluna certa passaria — e `is not $1` casa toda linha da tabela.
 */
const PREDICADO_DO_TUTOR = /"tutor_user_id"\s*=\s*\$(\d+)/g;
const PREDICADO_DO_ACHADOR = /"finder_user_id"\s*=\s*\$(\d+)/g;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * **A cláusula `WHERE`, e nada antes dela.**
 *
 * Esta função existe por um furo medido, e o furo é o motivo deste comentário
 * ser longo. A leitura da conversa menciona `tutor_user_id` DUAS vezes: uma no
 * `WHERE`, que autoriza, e outra na expressão `CASE` que decide de que lado
 * está quem chamou, que não autoriza nada. A primeira versão desta bancada
 * procurava o predicado no SQL inteiro — e, com a cláusula de autorização
 * REMOVIDA do `WHERE`, ela continuava achando a ocorrência do `CASE` e
 * **aprovava**. Medido: a suíte inteira ficou verde com o furo de pé, 0 casos
 * reprovados.
 *
 * É a forma exata do defeito que a bancada existe para impedir, um nível acima:
 * conferir a cláusula que se espera encontrar em vez da que existe. Agora o
 * recorte é explícito — só o texto a partir do primeiro ` where ` conta, e o
 * `CASE` da lista de seleção fica de fora dele.
 */
function clausulaWhere(sql: string): string {
  const corte = sql.indexOf(' where ');
  return corte < 0 ? '' : sql.slice(corte);
}

/**
 * TODOS os valores ligados às posições que aquele predicado ocupa NO `WHERE`.
 *
 * Plural de propósito: uma consulta pode carregar o chamador em mais de um
 * predicado, e todos precisam estar ligados a ele. A posição `$n` é lida de
 * volta contra a lista completa de parâmetros, porque a numeração do Postgres é
 * do enunciado inteiro e não do recorte.
 */
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
    // Este é o caso que justifica o `INNER JOIN` do adaptador. Sem ele, a
    // autorização passaria a depender de quem chama ter lido a conversa antes,
    // e um caminho novo que esquecesse a leitura publicaria a conversa inteira
    // sem que nenhum teste de comportamento acusasse.
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
    // Sem este predicado, quem tem três animais perdidos ao mesmo tempo escreve
    // em três casos distintos em 24 h fazendo o que o produto existe para ele
    // fazer, e é retido para revisão humana SEM ser avisado — porque o critério
    // 11 manda não avisar. A nota do contrato nomeia o alvo: quem ABORDA.
    const compilada = construtorDosCasosDistintosDaConta(semBanco, CHAMADOR, DESDE).compile();
    const achado = /"finder_user_id"\s*=\s*\$(\d+)/.exec(compilada.sql);
    assert.ok(
      achado !== null,
      `a contagem perdeu o recorte do achador e voltou a alcançar o tutor. SQL: ${compilada.sql}`,
    );
    assert.equal(compilada.parameters[Number(achado[1]) - 1], CHAMADOR);
  });

  void it('a contagem conta CASOS DISTINTOS, e não mensagens (critério 17)', () => {
    // `count(*)` aqui inverteria a contramedida: trinta mensagens num caso só
    // disparariam o gatilho do falso achador em série, e uma mensagem em três
    // casos diferentes não disparia.
    const { sql } = construtorDosCasosDistintosDaConta(semBanco, CHAMADOR, DESDE).compile();
    assert.match(
      sql,
      /count\(distinct coalesce\(conversations\.case_id, conversations\.id\)\)/,
      `a contagem deixou de contar casos distintos. SQL: ${sql}`,
    );
  });
});

/**
 * Duas junções cuja quebra NÃO aparece em predicado nenhum.
 *
 * O predicado do chamador responde "esta pessoa é parte de ALGUMA conversa".
 * Quem responde "estas mensagens são DESTA conversa" e "este nome é do tutor
 * DESTA conversa" é a correlação entre as tabelas, e ela é coluna contra
 * coluna: nenhum parâmetro é ligado, então uma isca que só lesse `$n` fica
 * verde com a correlação removida e a consulta passa a perguntar a pergunta
 * errada com a resposta certa ao lado.
 */
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
    // Quebrada, o critério 8 inverte de lado: a conversa fecharia (ou deixaria
    // de fechar) pelo caso de outra pessoa.
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
    // A forma exata do defeito que o molde de predicado não pega: o dono certo
    // continua ligado no SQL, e a consulta deixa de correlacionar as tabelas.
    const solta = semBanco
      .selectFrom('conversation_messages')
      .innerJoin('conversations', (j) => j.on('conversations.id', '=', CONVERSA))
      .select(['conversation_messages.id'])
      .where('conversations.tutor_user_id', '=', CHAMADOR)
      .where('conversations.finder_user_id', '=', CHAMADOR)
      .compile();
    // O predicado do chamador está intacto: a conferência de cima APROVA isto.
    exigirChamadorNoWhere(solta, 'a isca da correlação');
    assert.ok(
      !/on "conversations"\."id" = "conversation_messages"\."conversation_id"/.test(solta.sql),
      'a isca precisa mesmo estar sem a correlação, senão ela não prova nada',
    );
  });
});

void describe('a retenção preserva a primeira, e não a última', () => {
  void it('ela só escreve quando ainda não havia retenção', () => {
    // Sobrescrever faria a fila de moderação perder há quanto tempo aquilo está
    // esperando, que é o único número pelo qual ela se organiza.
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
    // `is not $1` tem o nome da coluna e casa toda linha da tabela.
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
    // A emenda da BICHUS-237. `parameters.includes(CHAMADOR)` aprovaria esta
    // consulta, porque o chamador está entre os parâmetros por causa do outro
    // predicado.
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
    // O furo medido, e o motivo de `clausulaWhere` existir. A leitura real
    // menciona `tutor_user_id` na lista de seleção, dentro do `CASE` que decide
    // o papel do chamador. Uma bancada que procurasse o predicado no SQL
    // inteiro acharia essa ocorrência e aprovaria a consulta SEM autorização
    // nenhuma no `WHERE` — e foi exatamente o que aconteceu na primeira versão
    // deste arquivo: a mutação que removeu a cláusula reprovou 0 casos.
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
    // O furo realista: alguém "simplifica" o `OR` e deixa só o tutor. O achador
    // com conta passa a receber 404 na própria conversa, e nenhum teste de
    // comportamento do tutor acusa.
    const soOTutor = semBanco
      .selectFrom('conversations')
      .select(['id'])
      .where('tutor_user_id', '=', CHAMADOR)
      .compile();
    assert.throws(() => exigirChamadorNoWhere(soOTutor, 'a isca'), /predicado do achador/);
  });
});
