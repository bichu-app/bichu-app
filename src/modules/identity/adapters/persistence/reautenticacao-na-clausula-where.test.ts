/**
 * As amarras da janela de reautenticação estão na cláusula `WHERE`, e o SQL
 * compilado prova isso.
 *
 * ## Por que conferir o SQL, se há teste de comportamento
 *
 * `tests/integration/reautenticacao-pelo-http.test.ts` mede o desfecho contra
 * Postgres de verdade, e é necessário. Não é suficiente, por dois motivos
 * concretos:
 *
 * 1. Ele passa igual se a consulta trouxer a linha e um `if` na aplicação a
 *    descartar depois. As duas implementações são indistinguíveis de fora
 *    **até** o dia em que alguém mexe no `if` — e aí não existe teste que
 *    acuse, porque o `if` era o teste. O ADR-0021 não diz "não deixe passar";
 *    ele diz **onde** a decisão mora.
 * 2. O uso único sob corrida não é observável em requisição serial. O que o
 *    garante é `consumed_at IS NULL` estar no MESMO `UPDATE` que marca, sob a
 *    mesma trava de linha.
 *
 * ## O aviso que este arquivo existe para não repetir
 *
 * Uma isca escrita contra o predicado que o autor IMAGINA fica verde com a
 * autorização removida, porque a coluna real é outra. Por isso cada regex
 * abaixo casa o nome da coluna **como o compilador do Postgres a escreve** —
 * e o teste do fim confere que o conjunto de predicados é exatamente o
 * esperado, não que ele contenha os esperados.
 *
 * ## A isca, e como ela foi provada
 *
 * Desligada uma de cada vez em `kysely-identity-repository.ts`, rodada, vista
 * reprovar, e restaurada. A tabela está no relatório da BICHUS-48.
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
import type { Instant, TokenHash, UserId } from '../../../../shared/types/brands.js';
import type { ConsumoDeJanela } from '../../ports/identity-repository.js';
import { construtorDoConsumoDaJanela, construtorDaLeituraDaJanela } from './kysely-identity-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const JTI = '018f3a2b-0000-7000-8000-00000000cc01';
const AGORA = 1_800_000_000_000 as Instant;
const BARREIRA = (AGORA - 3_600_000) as Instant;
const HASH = 'aG5hc2gtZGEtamFuZWxh' as TokenHash;

const consumo: ConsumoDeJanela = {
  tokenHash: HASH,
  userId: DONO,
  escopoExigido: 'session_revocation',
  acessoJti: JTI,
  barreiraDaConta: BARREIRA,
  agora: AGORA,
};

/** Kysely sem banco: compila a consulta e não a executa. É o caminho REAL. */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/**
 * Cada amarra, com o OPERADOR junto do nome.
 *
 * Sem o operador, `"user_id" is not $1` passaria por uma conferência que só
 * procurasse `user_id` — e `is not $1` casa toda linha da tabela.
 */
const PREDICADOS: readonly { readonly amarra: string; readonly regex: RegExp; readonly oQueImpede: string }[] = [
  {
    amarra: 'token_hash',
    regex: /"token_hash"\s*=\s*\$\d+/,
    oQueImpede: 'endereça a linha, e só ela',
  },
  {
    amarra: 'user_id',
    regex: /"user_id"\s*=\s*\$\d+/,
    oQueImpede: 'janela de OUTRA conta apresentada nesta sessão',
  },
  {
    amarra: 'scope',
    regex: /"scope"\s*=\s*\$\d+/,
    oQueImpede: 'janela aberta para revogar a tag usada para excluir a conta',
  },
  {
    amarra: 'access_jti',
    regex: /"access_jti"\s*=\s*\$\d+/,
    oQueImpede: 'janela copiada para outro aparelho',
  },
  {
    amarra: 'consumed_at',
    regex: /"consumed_at"\s+is\s+null/i,
    oQueImpede: 'segunda apresentação do mesmo valor, e a corrida entre duas chamadas',
  },
  {
    amarra: 'expires_at',
    regex: /"expires_at"\s*>\s*\$\d+/,
    oQueImpede: 'janela vencida',
  },
  {
    amarra: 'issued_at',
    regex: /"issued_at"\s*>=\s*\$\d+/,
    oQueImpede: 'janela anterior a uma troca de senha ou a um logout-all (SEC-006)',
  },
];

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

function compilar(construtor: { compile(): Compilada }): Compilada {
  return construtor.compile();
}

void describe('o consumo da janela carrega as sete amarras no WHERE', () => {
  for (const { amarra, regex, oQueImpede } of PREDICADOS) {
    void it(`tem \`${amarra}\` com o operador certo — ${oQueImpede}`, () => {
      const { sql } = compilar(construtorDoConsumoDaJanela(semBanco, consumo));
      assert.match(
        sql,
        regex,
        `o predicado de \`${amarra}\` saiu do consumo da janela, ou mudou de operador. ` +
          `Sem ele, o que passa a ser possível é: ${oQueImpede}.\nSQL compilado: ${sql}`,
      );
    });
  }

  void it('os valores ligados são os da apresentação, e não outros', () => {
    // Um predicado com o nome certo e o parâmetro errado passaria pelos casos
    // acima. `"user_id" = $2` ligado ao id da JANELA, e não ao de quem
    // apresenta, compara a linha com ela mesma e aprova sempre.
    const { parameters } = compilar(construtorDoConsumoDaJanela(semBanco, consumo));
    assert.ok(parameters.includes(DONO), `o id do dono não foi ligado: ${JSON.stringify(parameters)}`);
    assert.ok(parameters.includes(JTI), `o \`jti\` da sessão não foi ligado: ${JSON.stringify(parameters)}`);
    assert.ok(
      parameters.includes('session_revocation'),
      `o escopo exigido não foi ligado: ${JSON.stringify(parameters)}`,
    );
    const datas = parameters.filter((p): p is Date => p instanceof Date).map((d) => d.getTime());
    assert.ok(datas.includes(AGORA), 'o instante de agora não foi ligado');
    assert.ok(datas.includes(BARREIRA), 'a barreira da conta não foi ligada');
  });

  void it('o `UPDATE` marca `consumed_at`: conferir sem consumir não é uso único', () => {
    const { sql } = compilar(construtorDoConsumoDaJanela(semBanco, consumo));
    assert.match(
      sql,
      /^update\s+"reauth_tokens"\s+set\s+"consumed_at"\s*=\s*\$\d+/i,
      `o consumo deixou de ser um UPDATE que marca. Uma leitura seguida de uma marcação em ` +
        `dois passos devolve sucesso às duas chamadas simultâneas.\nSQL: ${sql}`,
    );
    assert.match(sql, /returning\s+"id"/i, 'sem `RETURNING`, quem chama não sabe se marcou alguma coisa');
  });

  void it('o conjunto de predicados é EXATAMENTE sete: nenhum a mais, nenhum a menos', () => {
    // A conferência que fecha a direção que ninguém olha. Os casos acima são
    // todos de presença, e presença não vê o predicado EXTRA — um `or "scope"
    // is not null` grudado no fim manteria os sete e alargaria o alcance para
    // tudo. Contar o `and` do `where` compilado pega isso.
    const { sql } = compilar(construtorDoConsumoDaJanela(semBanco, consumo));
    const clausula = sql.slice(sql.toLowerCase().indexOf(' where '));
    const conjuncoes = clausula.match(/\sand\s/gi)?.length ?? 0;
    assert.equal(
      conjuncoes,
      PREDICADOS.length - 1,
      `a cláusula tem ${String(conjuncoes + 1)} predicados e a lista deste arquivo declara ` +
        `${String(PREDICADOS.length)}. Predicado a mais alarga ou estreita o alcance sem que ` +
        `nenhum caso de presença acuse.\nWHERE: ${clausula}`,
    );
    assert.doesNotMatch(
      clausula,
      /\sor\s/i,
      `a cláusula ganhou um \`or\`. Uma disjunção derruba a conjunção inteira: basta um lado ` +
        `verdadeiro.\nWHERE: ${clausula}`,
    );
  });
});

void describe('a leitura que nomeia a recusa endereça pelo hash, e por nada mais', () => {
  void it('não carrega `user_id`: é assim que ela distingue "de outra conta" de "não existe"', () => {
    const { sql } = compilar(construtorDaLeituraDaJanela(semBanco, HASH));
    assert.match(sql, /"token_hash"\s*=\s*\$\d+/);
    assert.doesNotMatch(
      sql,
      /"user_id"\s*=\s*\$\d+/,
      'a leitura de diagnóstico ganhou o dono no `WHERE` e deixou de conseguir dizer que a ' +
        'janela existe e é de outra conta. O motivo vira `inexistente` na trilha, e quem ' +
        'investigar uma tomada de conta perde o sinal mais claro que existe.',
    );
  });

  void it('não seleciona o hash: o que sai da tabela não devolve a credencial', () => {
    const { sql } = compilar(construtorDaLeituraDaJanela(semBanco, HASH));
    assert.doesNotMatch(
      sql,
      /select[^]*"token_hash"[^]*from/i,
      `a leitura passou a trazer \`token_hash\` para dentro do processo. Ele é o hash de uma ` +
        `credencial viva e não tem uso nenhum no diagnóstico.\nSQL: ${sql}`,
    );
  });
});
