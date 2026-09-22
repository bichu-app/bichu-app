/**
 * A autorização está na cláusula `WHERE`, e o SQL compilado prova isso.
 *
 * ## Por que conferir o SQL e não o comportamento
 *
 * O teste de comportamento — "a conta B não vê o achado da conta A" — existe,
 * roda contra Postgres de verdade e está em
 * `tests/integration/achado-avulso.test.ts`. Ele é necessário e não é
 * suficiente, por um motivo concreto: ele passa igual se a consulta trouxer a
 * linha de A e um `if` na aplicação a descartar depois. As duas implementações
 * são indistinguíveis pelo lado de fora **até** o dia em que alguém mexe no
 * `if`, e aí não existe teste que acuse, porque o `if` era o teste.
 *
 * O ADR-0021 não diz "não devolva a linha do outro". Ele diz **onde** a decisão
 * mora. Este arquivo é o único lugar do repositório que consegue verificar essa
 * parte para o módulo `found`, porque ela não é observável na resposta.
 *
 * ## A emenda da BICHUS-237, e por que ela muda a conferência
 *
 * A versão anterior deste molde (BICHUS-92) conferia o predicado com uma regex e
 * depois `parameters.includes(DONO)`. Isso tem um furo que só aparece em consulta
 * com mais de um parâmetro, que é exatamente o caso aqui: `buscarDoRelator` liga
 * o **id do achado** e o **dono**, nessa ordem.
 *
 * `parameters.includes(DONO)` responde "o dono está em algum lugar da lista", e
 * não "o dono é o valor ligado ao predicado que acabei de encontrar". Uma
 * consulta que escrevesse `"reporter_user_id" = $1` — ligando o id do achado à
 * coluna do dono — teria a coluna certa, o operador certo, e o dono na lista de
 * parâmetros por causa do OUTRO predicado. Passaria.
 *
 * Então aqui a conferência **lê a posição `$n` que o predicado ocupa** e confere
 * o valor ligado **àquela posição**. A isca `troca de posições` é o caso que
 * precisa reprovar, e ela reprova.
 *
 * ## Como as iscas foram provadas
 *
 * Cada linha foi desligada no código de produção, a mudança foi conferida no
 * disco (`git diff --stat` não vazio), a suíte rodou e reprovou, e o arquivo foi
 * restaurado. 22/09/2026, Node 22 no contêiner / Node 26.8.2 nesta máquina.
 * O número é o `fail` que o próprio `node --test` reporta.
 *
 * | o que foi desligado em `kysely-found-report-repository.ts` | `fail` |
 * |---|---|
 * | `.where('reporter_user_id', '=', dono)` fora de `construtorDaLeitura` | 1 |
 * | `=` virando `is not` em `construtorDaLeitura` | 1 |
 * | idem fora de `construtorDaLista` | 1 |
 * | idem fora de `construtorDoEnriquecimento` | 1 |
 * | `.where('status', '<>', 'closed')` fora do enriquecimento | 1 |
 * | a contagem autorizando por `upload_intents.user_id` (coluna trocada) | 2 |
 * | `onRef` virando `on` na contagem (correlação some) | 1 |
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
import type { FoundReportId, Instant, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaContagemDeFotos,
  construtorDaLeitura,
  construtorDaLista,
  construtorDoEnriquecimento,
} from './kysely-found-report-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const ACHADO = '018f3a2b-0000-7000-8000-00000000f001' as FoundReportId;
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
 * O predicado do dono, com o número do parâmetro capturado.
 *
 * A regex cobra o OPERADOR junto do nome — sem isso, um `is not` com a coluna
 * certa passaria, e `is not $1` casa toda linha da tabela. E ela captura o `n`
 * de `$n`, que é a metade acrescentada pela BICHUS-237.
 */
const PREDICADO_DO_DONO = /"reporter_user_id"\s*=\s*\$(\d+)/;

/**
 * A REGRA DE AUTORIZAÇÃO DESTE MÓDULO, em uma frase:
 *
 * > Um achado avulso é lido e alterado **somente pela conta que o registrou**
 * > (`found_reports.reporter_user_id`), e nunca por posse de token.
 *
 * Quem avisou sem conta usa as rotas do achador, que não têm id no caminho
 * (SEC-001) e não passam por este arquivo. Por isso a coluna é sempre
 * `found_reports.reporter_user_id`, **inclusive na contagem de fotos** — e é aí
 * que mora a armadilha que a `upload_intents.user_id` esconde: ali `user_id` é
 * *quem pediu a intenção*, e não *de quem é o aviso*. Os dois coincidem hoje, e
 * uma isca que cobrasse `user_id` ficaria verde no dia em que deixassem de
 * coincidir.
 */
const COLUNA_DO_DONO = 'found_reports"."reporter_user_id';

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * Confere que o predicado existe **e** que o valor ligado à posição dele é o
 * dono.
 *
 * `parameters.includes(DONO)` responde a pergunta errada quando a consulta tem
 * mais de um parâmetro. Ver a seção sobre a BICHUS-237 no topo do arquivo.
 */
function exigirDonoNoWhere(
  compilada: Compilada,
  onde: string,
  predicado: RegExp = PREDICADO_DO_DONO,
): void {
  const casado = predicado.exec(compilada.sql);
  assert.ok(
    casado !== null,
    `${onde} perdeu o predicado do dono (ou trocou o operador). SQL compilado: ${compilada.sql}`,
  );
  // `$1` é o primeiro parâmetro, que é o índice 0 da lista.
  const posicao = Number(casado[1]) - 1;
  assert.equal(
    compilada.parameters[posicao],
    DONO,
    `${onde}: o predicado do dono existe e está ligado a OUTRO valor — ` +
      `\`$${String(posicao + 1)}\` vale ${JSON.stringify(compilada.parameters[posicao])}, ` +
      `e não o dono. Parâmetros: ${JSON.stringify(compilada.parameters)}`,
  );
}

void describe('toda consulta que toca o achado de alguém carrega o dono no WHERE', () => {
  void it('a leitura de um achado, com o dono ligado à posição do predicado', () => {
    exigirDonoNoWhere(construtorDaLeitura(semBanco, ACHADO, DONO).compile(), 'a leitura');
  });

  void it('a leitura filtra o id JUNTO, e não depois', () => {
    const { sql, parameters } = construtorDaLeitura(semBanco, ACHADO, DONO).compile();
    assert.match(sql, /"id"\s*=\s*\$\d+/, `o id saiu do WHERE. SQL: ${sql}`);
    assert.ok(parameters.includes(ACHADO));
  });

  void it('a lista do relator', () => {
    exigirDonoNoWhere(construtorDaLista(semBanco, DONO, 20, null).compile(), 'a lista');
  });

  void it('a lista pede uma linha a mais que o limite, e ordena por criação decrescente', () => {
    const { sql, parameters } = construtorDaLista(semBanco, DONO, 20, null).compile();
    assert.match(sql, /order by "created_at" desc/i, `a ordem sumiu. SQL: ${sql}`);
    assert.ok(
      parameters.includes(21),
      'a lista parou de pedir a linha extra, e `next_cursor` passou a ser adivinhação',
    );
  });

  void it('o enriquecimento', () => {
    exigirDonoNoWhere(
      construtorDoEnriquecimento(semBanco, ACHADO, DONO, { observacao: 'oi' }, AGORA).compile(),
      'o enriquecimento',
    );
  });

  void it('o enriquecimento recusa o achado encerrado NO WHERE, e não num `if` antes', () => {
    // Conferir antes de escrever deixa a janela entre as duas operações aberta,
    // e é ela que a fila offline do app encontra ao reenviar em rajada.
    const { sql } = construtorDoEnriquecimento(
      semBanco,
      ACHADO,
      DONO,
      { observacao: 'oi' },
      AGORA,
    ).compile();
    assert.match(
      sql,
      /"status"\s*(!=|<>)\s*\$\d+/,
      `o predicado de status saiu do WHERE. SQL: ${sql}`,
    );
  });

  void it('a contagem de fotos do aviso', () => {
    exigirDonoNoWhere(
      construtorDaContagemDeFotos(semBanco, ACHADO, DONO).compile(),
      'a contagem de fotos',
      /"found_reports"\."reporter_user_id"\s*=\s*\$(\d+)/,
    );
  });

  void it('nenhuma delas seleciona `found_point` cru', () => {
    // A coordenada fica onde foi gravada. O que sai é um booleano.
    for (const compilada of [
      construtorDaLeitura(semBanco, ACHADO, DONO).compile(),
      construtorDaLista(semBanco, DONO, 20, null).compile(),
    ]) {
      assert.ok(
        !/select[^]*"found_point"/i.test(compilada.sql),
        `a coluna geográfica entrou na lista de seleção crua. SQL: ${compilada.sql}`,
      );
      assert.match(compilada.sql, /photo_upload_id IS NOT NULL/);
    }
  });
});

void describe('ISCA: a mesma conferência REPROVA uma consulta sem o dono', () => {
  void it('um SELECT sem `reporter_user_id` no WHERE é acusado pelo predicado', () => {
    const semDono = semBanco
      .selectFrom('found_reports')
      .select(['id'])
      .where('id', '=', ACHADO)
      .compile();
    assert.ok(
      !PREDICADO_DO_DONO.test(semDono.sql),
      'a conferência passou numa consulta que não filtra por conta nenhuma: ela parou de ' +
        'enxergar a ausência do dono, e os casos acima passaram a medir o silêncio dela',
    );
  });

  void it('um WHERE com a coluna certa e o operador errado também é acusado', () => {
    // `is not $1` tem o nome da coluna e casa toda linha da tabela.
    const operadorErrado = semBanco
      .selectFrom('found_reports')
      .select(['id'])
      .where('reporter_user_id', 'is not', DONO)
      .compile();
    assert.ok(
      operadorErrado.sql.includes('"reporter_user_id"'),
      'a isca precisa mesmo mencionar a coluna, senão ela não prova nada',
    );
    assert.ok(
      !PREDICADO_DO_DONO.test(operadorErrado.sql),
      `uma conferência que só procura o NOME aprovaria isto: ${operadorErrado.sql}`,
    );
  });

  void it('ISCA DA BICHUS-237: troca de posições passa por `includes` e é acusada aqui', () => {
    // **O caso que o molde antigo aprovava.** A coluna do dono está ligada ao
    // ID DO ACHADO, e o dono aparece na lista de parâmetros por causa do outro
    // predicado. Uma conta leria o achado de outra, e `parameters.includes(DONO)`
    // diria que está tudo certo.
    const trocada = semBanco
      .selectFrom('found_reports')
      .select(['id'])
      .where('reporter_user_id', '=', ACHADO as unknown as UserId)
      .where('id', '=', DONO as unknown as FoundReportId)
      .compile();

    // Primeiro: o molde ANTIGO aprova mesmo. Sem isto, a isca não prova que há
    // um furo — ela só mostraria que o molde novo reprova alguma coisa.
    assert.ok(
      PREDICADO_DO_DONO.test(trocada.sql),
      'a isca precisa mesmo ter o predicado com a coluna e o operador certos',
    );
    assert.ok(
      trocada.parameters.includes(DONO),
      'a isca precisa mesmo ter o dono na lista de parâmetros, senão ela não é o furo',
    );

    // Agora: o molde NOVO reprova, porque ele lê a posição.
    assert.throws(
      () => exigirDonoNoWhere(trocada, 'a isca'),
      /ligado a OUTRO valor/,
      'a conferência posicional parou de enxergar a troca, e voltou a valer o que ' +
        '`parameters.includes` valia — que é aprovar coluna certa com valor errado',
    );
  });
});

void describe('ISCA: a coluna certa e a correlação entre tabelas', () => {
  void it('a contagem de fotos autoriza por `found_reports`, e NÃO por `upload_intents.user_id`', () => {
    // `upload_intents.user_id` é quem PEDIU a intenção; a autorização é de quem
    // é dono do AVISO. Hoje os dois coincidem porque só o relator consegue
    // pedir — mas essa garantia mora em outra consulta, e autorização que
    // depende de outra chamada ter acontecido é autorização num `if`.
    const { sql } = construtorDaContagemDeFotos(semBanco, ACHADO, DONO).compile();
    assert.ok(
      sql.includes(`"${COLUNA_DO_DONO}"`),
      `a contagem trocou de coluna de autorização. SQL: ${sql}`,
    );
    assert.ok(
      !/"upload_intents"\."user_id"\s*=\s*\$/.test(sql),
      'a contagem voltou a autorizar por quem pediu a intenção, e não por quem é dono ' +
        `do aviso. SQL: ${sql}`,
    );
  });

  void it('a contagem correlaciona as duas tabelas, e sem isso ela pergunta OUTRA coisa', () => {
    // Sem `upload_intents.found_report_id = found_reports.id`, o mesmo SQL com o
    // mesmo dono ligado passa a perguntar "esta conta tem algum aviso?" em vez de
    // "quantas fotos tem ESTE aviso". Nenhum predicado some do texto, e a
    // conferência do dono continua verde: só a checagem da correlação acusa.
    const { sql } = construtorDaContagemDeFotos(semBanco, ACHADO, DONO).compile();
    assert.match(
      sql,
      /"found_reports"\."id"\s*=\s*"upload_intents"\."found_report_id"/,
      `a correlação entre as duas tabelas sumiu. SQL: ${sql}`,
    );
  });

  void it('a mesma conferência ACUSA a consulta sem correlação', () => {
    // A isca: produto cartesiano com o dono certo ligado. Ela tem o predicado do
    // dono, tem o valor na posição certa, e responde sobre o conjunto errado.
    const semCorrelacao = semBanco
      .selectFrom('upload_intents')
      .innerJoin('found_reports', (join) => join.on('found_reports.id', '=', ACHADO))
      .select(({ fn }) => fn.countAll<number>().as('total'))
      .where('found_reports.reporter_user_id', '=', DONO)
      .compile();

    // Primeiro: a conferência do DONO aprova esta consulta. Sem isto, a isca não
    // prova que há um furo.
    exigirDonoNoWhere(
      semCorrelacao,
      'a isca sem correlação',
      /"found_reports"\."reporter_user_id"\s*=\s*\$(\d+)/,
    );

    // Agora: a conferência da correlação reprova.
    assert.ok(
      !/"found_reports"\."id"\s*=\s*"upload_intents"\."found_report_id"/.test(semCorrelacao.sql),
      'a conferência da correlação parou de enxergar o produto cartesiano, e os dois ' +
        `casos acima passaram a medir o silêncio dela. SQL: ${semCorrelacao.sql}`,
    );
  });
});
