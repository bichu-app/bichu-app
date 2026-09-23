/**
 * A autorização está na cláusula `WHERE`, e o SQL compilado prova isso.
 *
 * ## Por que conferir o SQL e não o comportamento
 *
 * O teste de comportamento — "a conta B não vê a localização da conta A" —
 * existe, roda contra Postgres de verdade e está em
 * `tests/integration/localizacao-de-referencia.test.ts`. Ele é necessário e não
 * é suficiente, por um motivo concreto: ele passa igual se a consulta trouxer a
 * linha de A e um `if` na aplicação a descartar depois. As duas implementações
 * são indistinguíveis pelo lado de fora **até** o dia em que alguém mexe no
 * `if`, e aí não existe teste que acuse, porque o `if` era o teste.
 *
 * O ADR-0021 não diz "não devolva a linha do outro". Ele diz **onde** a decisão
 * mora. Este arquivo é o único lugar do repositório que consegue verificar essa
 * parte, porque ela não é observável na resposta: ele compila as consultas sem
 * executá-las e lê o predicado.
 *
 * ## A isca, e como ela foi provada
 *
 * Desligada, rodada e vista reprovar em 22/09/2026, e depois restaurada:
 *
 * | o que foi desligado em `kysely-localizacao-de-referencia.ts` | reprovaram |
 * |---|---|
 * | `.where('user_id', '=', dono)` removido de `construtorDaLeitura` | 3 casos |
 * | `.where('user_id', '=', dono)` removido de `construtorDoApagamento` | 2 casos |
 * | `.where('expires_at', '>', ...)` removido da leitura | 1 caso |
 * | `=` virando `is not` em `construtorDaLeitura` | 1 caso |
 *
 * A última linha importa: um predicado com o nome certo e o operador errado
 * passaria por uma conferência que só procurasse `user_id` no texto.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { comoFamiliaDeSessao } from '../../ports/localizacao-de-referencia-repository.js';
import {
  construtorDaLeitura,
  construtorDoApagamento,
  construtorDoExpurgo,
} from './kysely-localizacao-de-referencia.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = 1_800_000_000_000 as Instant;
/** SEC-021: a sessão de aparelho, que entra no WHERE ao lado do dono. */
const FAMILIA = comoFamiliaDeSessao('018f3a2b-0000-7000-8000-0000000000f1');

/**
 * Kysely sem banco: ele compila a consulta e não a executa.
 *
 * É o caminho REAL — o mesmo construtor, o mesmo compilador de dialeto do
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
 * O predicado do dono, como o compilador do Postgres o escreve: `"user_id" = $n`.
 *
 * A regex cobra o OPERADOR junto do nome. Sem isso, um `is not` com a coluna
 * certa passaria — e `is not $1` casa toda linha da tabela.
 */
const PREDICADO_DO_DONO = /"user_id"\s*=\s*\$\d+/;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

function compilar(construtor: { compile(): Compilada }): Compilada {
  return construtor.compile();
}

void describe('toda consulta que toca a localização de alguém carrega o dono no WHERE', () => {
  void it('a leitura tem `"user_id" = $n`, e o valor ligado é o dono', () => {
    const { sql, parameters } = compilar(construtorDaLeitura(semBanco, DONO, FAMILIA, AGORA));
    assert.match(
      sql,
      PREDICADO_DO_DONO,
      `a leitura perdeu o predicado do dono. SQL compilado: ${sql}`,
    );
    assert.ok(
      parameters.includes(DONO),
      'o predicado existe e o dono não está entre os parâmetros ligados',
    );
  });

  void it('o apagamento tem `"user_id" = $n`, e o valor ligado é o dono', () => {
    const { sql, parameters } = compilar(construtorDoApagamento(semBanco, DONO, FAMILIA));
    assert.match(
      sql,
      PREDICADO_DO_DONO,
      `o apagamento perdeu o predicado do dono. SQL compilado: ${sql}`,
    );
    assert.ok(parameters.includes(DONO));
  });

  void it('SEC-021: o apagamento tem `"session_family_id" = $n` junto do dono', () => {
    const { sql, parameters } = compilar(construtorDoApagamento(semBanco, DONO, FAMILIA));
    // ISCA: tire `.where('session_family_id', ...)` de `construtorDoApagamento`
    // e este caso reprova. É a outra metade da SEC-021, e é a que o teste de
    // unidade do logout não alcança: lá o repositório é dublê, e um dublê
    // chaveado pelo par continua se comportando bem enquanto o SQL de verdade
    // apaga a tabela inteira daquela pessoa.
    assert.match(
      sql,
      /"session_family_id"\s*=\s*\$\d+/,
      `o apagamento perdeu o predicado da sessão de aparelho. Sem ele, sair no celular ` +
        `apaga também a localização do tablet, e "Sair" vira "Sair de todos os ` +
        `aparelhos" com outro nome (ADR-0002, emenda 1). SQL compilado: ${sql}`,
    );
    assert.ok(
      parameters.includes(FAMILIA),
      'o predicado existe e a família não está entre os parâmetros ligados',
    );
  });

  void it('SEC-021: a leitura também é por aparelho, e não pela pessoa', () => {
    const { sql, parameters } = compilar(construtorDaLeitura(semBanco, DONO, FAMILIA, AGORA));
    // ISCA: tire o mesmo `.where` de `construtorDaLeitura` e este caso reprova.
    // Sem ele, o `GET /v1/me/location` de um aparelho devolveria o lugar que o
    // OUTRO aparelho informou — um lugar em que quem pergunta nunca esteve.
    assert.match(
      sql,
      /"session_family_id"\s*=\s*\$\d+/,
      `a leitura perdeu o predicado da sessão de aparelho. SQL compilado: ${sql}`,
    );
    assert.ok(parameters.includes(FAMILIA));
  });

  void it('a leitura filtra a validade junto, e não depois', () => {
    const { sql } = compilar(construtorDaLeitura(semBanco, DONO, FAMILIA, AGORA));
    assert.match(
      sql,
      /"expires_at"\s*>\s*\$\d+/,
      `a validade saiu do WHERE. Filtrar em memória depois de ler faz a linha vencida ` +
        `chegar à aplicação, e o critério 7 depende de ela não chegar. SQL: ${sql}`,
    );
  });

  void it('a leitura não seleciona `reference_point` cru: ela sai por ST_Y/ST_X', () => {
    const { sql } = compilar(construtorDaLeitura(semBanco, DONO, FAMILIA, AGORA));
    assert.match(sql, /ST_Y\(reference_point::geometry\)/);
    assert.match(sql, /ST_X\(reference_point::geometry\)/);
    assert.ok(
      !/select[^]*"reference_point"/i.test(sql),
      `a coluna geográfica entrou na lista de seleção crua. SQL: ${sql}`,
    );
  });
});

void describe('o expurgo de retenção é a ÚNICA consulta sem dono, e por isso ela é nomeada', () => {
  void it('ele filtra por validade vencida e não por conta nenhuma', () => {
    const { sql } = compilar(construtorDoExpurgo(semBanco, AGORA));
    assert.match(sql, /"expires_at"\s*<=\s*\$\d+/);
    assert.ok(
      !PREDICADO_DO_DONO.test(sql),
      'o expurgo ganhou um dono: ele varre a tabela inteira de propósito, e um dono aqui ' +
        'faria a retenção do ADR-0010 valer só para quem chamou uma rota',
    );
  });
});

void describe('ISCA: a mesma conferência REPROVA uma consulta sem o dono', () => {
  void it('um SELECT sem `user_id` no WHERE é acusado pelo predicado', () => {
    const semDono = semBanco
      .selectFrom('user_reference_locations')
      .select(['precision_m'])
      .where('expires_at', '>', new Date(AGORA))
      .compile();
    assert.ok(
      !PREDICADO_DO_DONO.test(semDono.sql),
      'a conferência passou numa consulta que lê a tabela inteira: ela parou de enxergar ' +
        'a ausência do dono, e os casos acima passaram a medir o silêncio dela',
    );
  });

  void it('um WHERE com a coluna certa e o operador errado também é acusado', () => {
    // `is not $1` tem o nome da coluna e casa toda linha da tabela. É por isso
    // que o predicado cobra o `=` junto do nome.
    const operadorErrado = semBanco
      .deleteFrom('user_reference_locations')
      .where('user_id', 'is not', DONO)
      .compile();
    assert.ok(
      operadorErrado.sql.includes('"user_id"'),
      'a isca precisa mesmo mencionar a coluna, senão ela não prova nada',
    );
    assert.ok(
      !PREDICADO_DO_DONO.test(operadorErrado.sql),
      `uma conferência que só procura o NOME aprovaria isto: ${operadorErrado.sql}`,
    );
  });
});
