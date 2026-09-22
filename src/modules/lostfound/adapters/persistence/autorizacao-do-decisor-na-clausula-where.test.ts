/**
 * **Quem decide a correspondência é o tutor do caso**, e o SQL compilado prova.
 *
 * ## O buraco que este arquivo fecha, medido e não deduzido
 *
 * A migração `20260922000003_achado-avulso-e-correspondencia.sql` escreve, em
 * prosa, que quem decide é o tutor. O `CHECK` que ela cria não cobra isso:
 *
 *   CONSTRAINT match_candidates_decisao_tem_autor
 *     CHECK ((status = 'suggested' AND decided_by_user_id IS NULL ...)
 *            OR (status IN ('confirmed','rejected')
 *                AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL))
 *
 * Ele cobra **uma pessoa e um instante**. Qualquer `users.id` satisfaz os dois,
 * inclusive o de uma conta que não tem nada a ver com o caso — e
 * `match_candidates` não tem coluna de dono para o banco comparar, porque o dono
 * do candidato é o dono do CASO. O comentário da migração descreve uma garantia
 * que a DDL não dá.
 *
 * `tests/integration/decisao-do-candidato.test.ts` mostra isso contra o Postgres:
 * o `UPDATE` de um terceiro, escrito à mão, **é aceito pelo banco**. Este arquivo
 * é a outra metade: ele prova que a consulta que a aplicação emite não deixa
 * esse `UPDATE` existir.
 *
 * ## Por que ler o SQL, e não só o comportamento
 *
 * O teste de comportamento passa igual se a consulta trouxer a linha e um `if`
 * na aplicação a descartar depois. As duas implementações são indistinguíveis
 * pelo lado de fora **até** o dia em que alguém mexe no `if`, e aí não existe
 * teste que acuse, porque o `if` era o teste. O ADR-0021 não diz "não decida o
 * candidato do outro"; ele diz **onde** a decisão mora.
 *
 * ## Duas armadilhas deste molde, e as duas já ficaram verdes em outro lugar
 *
 * **Conferir o predicado que existe, não o que se espera encontrar.** Os
 * predicados abaixo foram escritos depois de imprimir o SQL compilado, e cada um
 * carrega o nome QUALIFICADO da tabela. `"status" = $n` sem qualificação casaria
 * `match_candidates.status` quando a intenção era `lost_cases.status`, e a
 * conferência passaria a medir outra coluna sem mudar de cor.
 *
 * **A cláusula `RETURNING` tem os mesmos nomes de coluna que o `WHERE`.** Uma
 * busca sobre o SQL inteiro encontra `"lost_cases"."pet_id"` e
 * `"match_candidates"."status"` na lista de retorno, e aprova um `UPDATE` que
 * perdeu o predicado. Por isso tudo aqui é conferido em `apenasOWhere`, e o
 * último caso deste arquivo é a isca que prova que o corte importa.
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
import type { CaseId, Instant, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaDecisaoDoCandidato,
  construtorDoCandidatoDecidido,
} from './kysely-lost-case-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const CASO = '018f3a2b-0000-7000-8000-0000000000dd' as CaseId;
const CANDIDATO = '018f3a2b-0000-7000-8000-0000000000ee';
const AGORA = 1_800_000_000_000 as Instant;

/** Kysely sem banco: ele compila a consulta e não a executa. É o caminho REAL. */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/**
 * **A REGRA DE AUTORIZAÇÃO DESTA OPERAÇÃO, em uma frase:**
 *
 * > Um candidato é decidido **somente pela conta dona do caso a que ele
 * > pertence** (`lost_cases.owner_user_id`), e o vínculo entre os dois é
 * > `lost_cases.id = match_candidates.case_id`.
 *
 * A coluna é de `lost_cases` e não de `match_candidates` porque a segunda não
 * tem dono: o candidato é uma sugestão sobre um par, e quem manda nele é o dono
 * do caso.
 */
const PREDICADO_DO_DONO = /"lost_cases"\."owner_user_id"\s*=\s*\$(\d+)/;

/** A correlação. Sem ela o dono responde sobre o conjunto errado. */
const CORRELACAO_DO_CASO = /"lost_cases"\."id"\s*=\s*"match_candidates"\."case_id"/;

/** O que faz *"rejeitado não volta"* ser propriedade da escrita. */
const PREDICADO_DE_SUGERIDO = /"match_candidates"\."status"\s*=\s*\$(\d+)/;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * O SQL **até** o `RETURNING`.
 *
 * `RETURNING` repete os nomes de coluna do `WHERE`, sem operador e sem
 * parâmetro. Procurar no texto inteiro é o erro que aprova a consulta que
 * perdeu o predicado e manteve a coluna no retorno — e ele não é hipotético:
 * o último caso deste arquivo o executa.
 */
function apenasOWhere(compilada: Compilada): string {
  const corte = compilada.sql.indexOf(' returning ');
  return corte === -1 ? compilada.sql : compilada.sql.slice(0, corte);
}

/**
 * Confere que o predicado existe **e** que o valor ligado à posição dele é o
 * esperado.
 *
 * `parameters.includes(DONO)` responde "o dono está em algum lugar da lista", e
 * esta consulta liga **oito** parâmetros, com o dono aparecendo em dois deles
 * (`decided_by_user_id` e o predicado). Uma consulta que escrevesse
 * `"lost_cases"."owner_user_id" = $4` — ligando o id do CANDIDATO à coluna do
 * dono — teria a coluna certa, o operador certo, e o dono na lista por causa do
 * `SET`. Passaria por `includes` e decidiria o candidato de qualquer um.
 */
function exigirNaPosicao(
  compilada: Compilada,
  predicado: RegExp,
  esperado: unknown,
  onde: string,
): void {
  const casado = predicado.exec(apenasOWhere(compilada));
  assert.ok(
    casado !== null,
    `${onde}: o predicado ${String(predicado)} sumiu do WHERE (ou trocou de operador). ` +
      `SQL: ${compilada.sql}`,
  );
  const posicao = Number(casado[1]) - 1;
  assert.equal(
    compilada.parameters[posicao],
    esperado,
    `${onde}: o predicado existe e está ligado a OUTRO valor — ` +
      `\`$${String(posicao + 1)}\` vale ${JSON.stringify(compilada.parameters[posicao])}. ` +
      `Parâmetros: ${JSON.stringify(compilada.parameters)}`,
  );
}

function decisao(dono: UserId = DONO) {
  return construtorDaDecisaoDoCandidato(semBanco, {
    caso: CASO,
    candidato: CANDIDATO,
    dono,
    decisao: 'confirmed',
    agora: AGORA,
  }).compile();
}

void describe('a decisão do candidato carrega o TUTOR DO CASO no WHERE', () => {
  void it('o dono do caso está no WHERE, ligado à posição do próprio predicado', () => {
    exigirNaPosicao(decisao(), PREDICADO_DO_DONO, DONO, 'a decisão');
  });

  void it('o dono viaja de verdade: trocar quem chama troca o parâmetro ligado', () => {
    // Sem este caso, um `construtorDaDecisaoDoCandidato` que ignorasse o
    // argumento e ligasse uma constante passaria no caso acima.
    const outro = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
    exigirNaPosicao(decisao(outro), PREDICADO_DO_DONO, outro, 'a decisão de outro chamador');
  });

  void it('a correlação entre o candidato e o caso está escrita', () => {
    // Sem ela, o mesmo SQL com o mesmo dono ligado pergunta "esta conta tem
    // ALGUM caso?" em vez de "este candidato é de um caso DESTA conta", e o
    // produto cartesiano decide o candidato de qualquer pessoa.
    assert.match(apenasOWhere(decisao()), CORRELACAO_DO_CASO);
  });

  void it('o id do candidato e o do caso são filtro A MAIS, nunca no lugar do dono', () => {
    const compilada = decisao();
    const onde = apenasOWhere(compilada);
    assert.match(onde, /"match_candidates"\."id"\s*=\s*\$\d+/);
    assert.match(onde, /"match_candidates"\."case_id"\s*=\s*\$\d+/);
    assert.ok(compilada.parameters.includes(CANDIDATO));
    assert.ok(compilada.parameters.includes(CASO));
  });

  void it('só sai de `suggested`, e o predicado está no WHERE e não num `if` antes', () => {
    // É ele que faz "rejeitado não volta" (seção 4.10 de docs/03-arquitetura.md,
    // critério 12 da BICHUS-86) valer contra duas requisições simultâneas, que é
    // o que a fila offline produz quando o sinal volta.
    exigirNaPosicao(decisao(), PREDICADO_DE_SUGERIDO, 'suggested', 'a decisão');
  });

  void it('o caso precisa estar aberto, e o predicado é o de `lost_cases`', () => {
    // Qualificado de propósito: `"status" = $n` sem tabela casa
    // `match_candidates.status`, que é outro predicado e outra regra.
    exigirNaPosicao(
      decisao(),
      /"lost_cases"\."status"\s*=\s*\$(\d+)/,
      'open',
      'a decisão',
    );
  });

  void it('a escrita grava QUEM decidiu e QUANDO, que é o que o CHECK do banco cobra', () => {
    const { sql, parameters } = decisao();
    assert.match(sql, /set[^]*"decided_by_user_id"\s*=\s*\$\d+/);
    assert.match(sql, /set[^]*"decided_at"\s*=\s*\$\d+/);
    assert.ok(
      parameters.some((p) => p instanceof Date && p.getTime() === Number(AGORA)),
      `o instante da decisão não é o do relógio injetado. Parâmetros: ${JSON.stringify(parameters)}`,
    );
  });

  void it('a leitura do já decidido carrega o MESMO predicado do dono', () => {
    // O reenvio da fila offline não relaxa autorização nenhuma: o que muda é só
    // o predicado de status, que aqui é o complementar.
    const compilada = construtorDoCandidatoDecidido(semBanco, CASO, CANDIDATO, DONO).compile();
    exigirNaPosicao(compilada, PREDICADO_DO_DONO, DONO, 'a leitura do já decidido');
    assert.match(compilada.sql, /"match_candidates"\."status"\s*(<>|!=)\s*\$\d+/);
  });
});

void describe('ISCA: a mesma conferência REPROVA a consulta sem o dono do caso', () => {
  void it('um UPDATE sem `owner_user_id` no WHERE é acusado', () => {
    const semDono = semBanco
      .updateTable('match_candidates')
      .set({ status: 'confirmed' })
      .where('match_candidates.id', '=', CANDIDATO)
      .compile();
    assert.ok(
      !PREDICADO_DO_DONO.test(apenasOWhere(semDono)),
      'a conferência aprovou uma escrita que não filtra por tutor nenhum: ela parou de ' +
        'enxergar a ausência do dono, e os casos acima passaram a medir o silêncio dela',
    );
  });

  void it('coluna certa com o VALOR ERRADO ligado passa por `includes` e é acusada aqui', () => {
    // **O caso que uma conferência por `includes` aprova.** A coluna do dono
    // está ligada ao id do CANDIDATO, e o dono aparece na lista de parâmetros
    // por causa do `SET`. Uma conta decidiria o candidato de outra.
    const trocada = semBanco
      .updateTable('match_candidates')
      .from('lost_cases')
      .set({ decided_by_user_id: DONO, status: 'confirmed' })
      .whereRef('lost_cases.id', '=', 'match_candidates.case_id')
      .where('lost_cases.owner_user_id', '=', CANDIDATO)
      .compile();

    // Primeiro: a isca precisa MESMO ser o furo, senão ela não prova nada.
    assert.ok(PREDICADO_DO_DONO.test(apenasOWhere(trocada)));
    assert.ok(trocada.parameters.includes(DONO));

    // Agora: a conferência posicional reprova.
    assert.throws(
      () => exigirNaPosicao(trocada, PREDICADO_DO_DONO, DONO, 'a isca'),
      /ligado a OUTRO valor/,
      'a conferência posicional parou de enxergar a troca, e voltou a valer o que ' +
        '`parameters.includes` valia — que é aprovar coluna certa com valor errado',
    );
  });

  void it('a conferência da correlação ACUSA o produto cartesiano', () => {
    // Tem o predicado do dono, na posição certa, e responde sobre o conjunto
    // errado: "esta conta tem ALGUM caso aberto?".
    const semCorrelacao = semBanco
      .updateTable('match_candidates')
      .from('lost_cases')
      .set({ status: 'confirmed' })
      .where('match_candidates.id', '=', CANDIDATO)
      .where('lost_cases.owner_user_id', '=', DONO)
      .compile();

    exigirNaPosicao(semCorrelacao, PREDICADO_DO_DONO, DONO, 'a isca sem correlação');
    assert.ok(
      !CORRELACAO_DO_CASO.test(apenasOWhere(semCorrelacao)),
      'a conferência da correlação parou de enxergar o produto cartesiano, e o caso ' +
        `acima passou a medir o silêncio dela. SQL: ${semCorrelacao.sql}`,
    );
  });

  void it('a conferência de `suggested` ACUSA a escrita que desfaria uma rejeição', () => {
    const semGuarda = semBanco
      .updateTable('match_candidates')
      .from('lost_cases')
      .set({ status: 'confirmed' })
      .whereRef('lost_cases.id', '=', 'match_candidates.case_id')
      .where('match_candidates.id', '=', CANDIDATO)
      .where('lost_cases.owner_user_id', '=', DONO)
      .compile();

    // A autorização desta isca está CERTA. O que falta nela é a guarda que
    // impede o tutor de desfazer a própria rejeição — e sem um caso que a
    // separe, remover o predicado de `suggested` não reprovaria nada.
    exigirNaPosicao(semGuarda, PREDICADO_DO_DONO, DONO, 'a isca sem guarda de status');
    assert.ok(
      !PREDICADO_DE_SUGERIDO.test(apenasOWhere(semGuarda)),
      `"rejeitado não volta" deixou de ser conferível. SQL: ${semGuarda.sql}`,
    );
  });

  void it('ISCA DO `RETURNING`: procurar no SQL inteiro aprova a consulta sem o predicado', () => {
    // **O caso que fez uma isca ficar verde com a autorização removida.** A
    // escrita abaixo NÃO filtra por tutor. Ela só menciona a coluna na lista de
    // retorno — sem operador, sem parâmetro, sem efeito nenhum sobre que linhas
    // são alteradas.
    const soNoReturning = semBanco
      .updateTable('match_candidates')
      .from('lost_cases')
      .set({ status: 'confirmed' })
      .whereRef('lost_cases.id', '=', 'match_candidates.case_id')
      .where('match_candidates.id', '=', CANDIDATO)
      .returning(['match_candidates.id', 'lost_cases.owner_user_id'])
      .compile();

    // O nome está lá, no texto inteiro.
    assert.ok(soNoReturning.sql.includes('"lost_cases"."owner_user_id"'));

    // E mesmo assim a conferência reprova, porque ela lê só o `WHERE`.
    assert.throws(
      () => exigirNaPosicao(soNoReturning, PREDICADO_DO_DONO, DONO, 'a isca do returning'),
      /sumiu do WHERE/,
      'o corte em `RETURNING` deixou de funcionar, e a bancada voltou a aprovar uma ' +
        'escrita que decide o candidato de qualquer tutor',
    );
  });
});
