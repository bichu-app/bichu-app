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
const HASH = Buffer.alloc(32, 0x5a) as TokenHash;

const consumo: ConsumoDeJanela = {
  tokenHash: HASH,
  userId: DONO,
  escopoExigido: 'session_revocation',
  acessoJti: JTI,
  barreiraDaConta: BARREIRA,
  agora: AGORA,
};

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

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

function clausulaDoWhere(sql: string): string {
  const posicao = sql.toLowerCase().indexOf(' where ');
  assert.ok(
    posicao >= 0,
    'a consulta ficou SEM clausula WHERE: ela atinge a tabela inteira, e o ' +
      `recorte nao teria onde contar predicado. SQL: ${sql}`,
  );
  return sql.slice(posicao);
}

void describe('o recorte da clausula WHERE', () => {
  void it('REPROVA um SQL sem `WHERE`, em vez de devolver um caractere solto', () => {
    assert.throws(
      () => clausulaDoWhere('update "x" set "a" = $1'),
      /SEM clausula WHERE/,
      'o recorte aceitou um SQL sem `WHERE`. `slice(-1)` devolve um caractere, e ' +
        'a contagem de `and` e o `doesNotMatch` de `or` passariam a medir isso.',
    );
  });

  void it('com `WHERE`, o recorte comeca nele e conta os `and` DELE', () => {
    const clausula = clausulaDoWhere(
      'update "x" set "a" = $1 where "b" = $2 and "c" = $3',
    );
    assert.ok(!clausula.includes(' set '), 'o `SET` entrou no recorte');
    assert.equal((clausula.match(/\sand\s/gi) ?? []).length, 1);
  });
});

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
    const { sql } = compilar(construtorDoConsumoDaJanela(semBanco, consumo));
    const clausula = clausulaDoWhere(sql);
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
