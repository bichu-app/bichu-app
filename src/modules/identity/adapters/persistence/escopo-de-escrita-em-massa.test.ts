/**
 * O **escopo** das duas escritas em massa da identidade, provado sobre o SQL
 * compilado.
 *
 * ## Este arquivo NÃO é o molde da BICHUS-92, e a diferença é o assunto dele
 *
 * `autorizacao-na-clausula-where.test.ts` (BICHUS-92, emendado pela BICHUS-237)
 * responde a uma pergunta de **leitura**: a consulta filtra pelo dono? Ele
 * procura `"user_id" = $n` e confere o valor ligado àquela posição. Para um
 * `SELECT` isso basta, porque o dano de uma leitura é a resposta que o próprio
 * caso já inspeciona: some o predicado, a conta B recebe a linha da conta A, e
 * o teste de integração que olha a resposta acusa.
 *
 * `revogarTodasAsFamilias` e `invalidarTokensPendentes` são `UPDATE` **sem
 * `id` no `WHERE`**. Nelas a pergunta não é "de quem é a linha que voltou", é
 * **quantas linhas foram atingidas** — e aí a assimetria vira outra:
 *
 * - **a vítima não é quem chamou.** Quem apertou "sair de todos os aparelhos"
 *   recebe exatamente o efeito que pediu. Quem paga são contas que nenhuma
 *   requisição daquele caso mencionou, e nenhum teste que olhe a resposta da
 *   chamada vai olhar para elas;
 * - **procurar o predicado não mede alcance.** Esta é a lacuna concreta, e ela
 *   está exercitada abaixo em `a presença do predicado NÃO prova o alcance`:
 *
 *   ```sql
 *   where ("user_id" = $2 or "user_id" is not null) and "revoked_at" is null
 *   ```
 *
 *   tem a coluna certa, o operador certo e o **dono ligado à posição certa**.
 *   O molde da BICHUS-92 aprova essa consulta. Ela revoga a base inteira.
 *
 * ## A forma que serve para escrita em massa
 *
 * **Conferir a cláusula `WHERE` inteira, texto exato, e não a presença de um
 * predicado dentro dela.** Um `UPDATE` sem `id` é tão largo quanto o seu
 * `WHERE` mais largo: qualquer coisa acrescentada com `or`, qualquer `true`,
 * qualquer predicado a mais ou a menos muda o alcance. Só a cláusula inteira
 * fecha o conjunto — presença é um limite inferior, e alcance é o superior.
 *
 * O preço é conhecido e é o objetivo: mexer no `WHERE` destas duas instruções
 * reprova aqui. Quem alargar de propósito escreve o alargamento nesta linha e
 * explica no PR, que é o contrário do que aconteceu até agora, quando apagar a
 * cláusula deixava 967 casos unitários e 61 de integração verdes.
 *
 * `conferirEscopo` também prende o **verbo e a tabela**: `delete from` com o
 * mesmo `WHERE` é outro raio de alcance, e não é sobre isso que estas duas
 * funções respondem.
 *
 * ## O que este arquivo não consegue provar, e quem prova
 *
 * SQL compilado é texto: ele não sabe quantas linhas existem. Um `WHERE`
 * correto sobre a coluna errada — escopo por uma coluna que o esquema deixou
 * repetir entre contas — compila igual. **Quem conta linha é
 * `tests/integration/escopo-da-revogacao-em-massa.test.ts`**, com duas contas
 * em Postgres de verdade. Este arquivo é a rede fina e rápida; aquele é o que
 * mede o efeito.
 *
 * ## A isca, e como ela foi provada
 *
 * Cada mecanismo foi desligado em `kysely-identity-repository.ts`, as DUAS
 * suítes rodaram, e o mecanismo foi restaurado. Medido em 22/09/2026.
 *
 * Unitária em **Node v22.23.2**, que é a versão que a esteira pina, dentro da
 * imagem `node:22-bookworm-slim` do projeto; a mesma suíte na máquina do
 * desenvolvimento (Node v26.8.2) dá os mesmos números. Integração em Postgres
 * de verdade, na pilha efêmera, também em Node v22.23.2.
 *
 * Base: 980 casos unitários e 67 de integração, todos verdes. (Antes deste
 * arquivo e do seu irmão de integração: 967 e 61.)
 *
 * | o que foi desligado em `kysely-identity-repository.ts` | unitários | integração |
 * |---|---|---|
 * | `.where('user_id', '=', userId)` removido de `construtorDaRevogacaoEmMassa` | 2 | 2 |
 * | `.where('user_id', '=', userId)` removido de `construtorDaInvalidacaoDeTokensPendentes` | 2 | 2 |
 * | `=` virando `is not` na revogação em massa | 2 | 5 |
 * | o `userId` do predicado virando `String(agora)` | 2 | 5 |
 * | um `or "user_id" is not null` ACRESCENTADO à revogação em massa | 1 | 2 |
 * | `.where('revoked_at', 'is', null)` removido da revogação em massa | 1 | 1 |
 *
 * A quinta linha é a razão de este arquivo existir separado do molde da
 * BICHUS-92. Aquele molde, aplicado àquela instrução, **aprova**: o predicado
 * está lá, o operador é `=`, e a posição `$n` carrega o dono. O caso
 * `a presença do predicado NÃO prova o alcance` exercita as duas conferências
 * lado a lado, para que essa afirmação não dependa de ninguém acreditar nela.
 *
 * As duas linhas com 5 reprovações de integração derrubam também casos de
 * `revogacao-de-sessao.test.ts`, que usa o mesmo caminho. Está anotado porque
 * o número é o que foi medido, e não o que seria arrumado de reportar.
 *
 * **Método, e ele é uma correção de curso registrada.** O autor da BICHUS-237
 * tentou desligar uma cláusula, a substituição não casou com o texto do
 * arquivo, o arquivo ficou idêntico, a suíte ficou verde, e a conclusão quase
 * publicada foi "a isca não pega esse caso". Uma isca que não mudou o arquivo
 * não foi exercitada: ela mediu o silêncio dela mesma. Cada linha acima saiu de
 * um roteiro que **aborta se o trecho não casar exatamente uma vez**, **aborta
 * se o conteúdo em disco ficar idêntico ao original**, e só então roda a suíte
 * — e que relê o arquivo no fim para provar que restaurou. Quem refizer a
 * medição refaz com essas três exigências, ou o número que sair não vale.
 *
 * O roteiro guarda o original em memória e o reescreve no `finally`. Ele **não
 * usa `git stash`**, e isso é deliberado: a pilha de stash mora no diretório
 * git comum e é compartilhada por todos os worktrees do repositório — dois
 * agentes guardando estado ao mesmo tempo trocam de trabalho um com o outro.
 * Para desligar e religar uma cláusula, o arquivo específico basta.
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
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaInvalidacaoDeTokensPendentes,
  construtorDaRevogacaoEmMassa,
} from './kysely-identity-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = 1_800_000_000_000 as Instant;

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

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * O predicado do dono como a BICHUS-92 o procura. Ele existe NESTE arquivo por
 * um motivo só: o caso `a presença do predicado NÃO prova o alcance` precisa
 * mostrar a conferência frouxa aprovando o que a estrita reprova. Nenhum caso
 * de escopo depende dele.
 */
const PREDICADO_DO_DONO = /"user_id"\s*=\s*\$(\d+)/;

/** O valor realmente ligado à posição `$n` que o predicado do dono ocupa. */
function donoLigadoAoPredicado(compilada: Compilada): unknown {
  const achado = PREDICADO_DO_DONO.exec(compilada.sql);
  if (achado === null) return undefined;
  return compilada.parameters[Number(achado[1]) - 1];
}

/**
 * A cláusula `WHERE` inteira, do `where` até o fim do alcance da instrução.
 *
 * `returning` é cortado porque ele decide o que VOLTA, não o que é atingido.
 * A instrução inteira continua conferida em `conferirEscopo`, pelo prefixo.
 */
function clausulaWhere(sqlCompilado: string): string {
  const inicio = sqlCompilado.indexOf(' where ');
  assert.notEqual(
    inicio,
    -1,
    `a instrução ficou SEM cláusula WHERE e atinge a tabela inteira: ${sqlCompilado}`,
  );
  const resto = sqlCompilado.slice(inicio + ' where '.length);
  const returning = resto.indexOf(' returning ');
  return (returning === -1 ? resto : resto.slice(0, returning)).trim();
}

interface EscopoEsperado {
  readonly tabela: string;
  /** A cláusula inteira, texto exato. Não um trecho dela. */
  readonly where: string;
  /** Valor esperado em cada `$n`, na ordem, incluindo os do `SET`. */
  readonly parametros: readonly unknown[];
}

/**
 * Prende o alcance de um `UPDATE` sem `id`: o verbo, a tabela, a cláusula
 * `WHERE` inteira e todo valor ligado.
 *
 * Conferir a cláusula inteira e não a presença de um predicado é a diferença
 * entre medir o limite superior do alcance e medir o inferior. Ver o cabeçalho.
 */
function conferirEscopo(compilada: Compilada, esperado: EscopoEsperado): void {
  assert.ok(
    compilada.sql.startsWith(`update "${esperado.tabela}" set `),
    `a instrução deixou de ser um UPDATE em "${esperado.tabela}". ` +
      `Um DELETE com o mesmo WHERE é outro raio de alcance. SQL: ${compilada.sql}`,
  );
  assert.equal(
    clausulaWhere(compilada.sql),
    esperado.where,
    'a cláusula WHERE desta escrita em massa mudou. Ela é o ÚNICO limite de quantas ' +
      'linhas a instrução atinge: qualquer termo a mais, a menos, ou ligado por `or`, ' +
      'muda quem é afetado. Se o alargamento é intencional, escreva-o aqui e explique ' +
      `no PR. SQL compilado: ${compilada.sql}`,
  );
  assert.deepEqual(
    [...compilada.parameters],
    [...esperado.parametros],
    `algum valor ligado mudou de posição ou de conteúdo. SQL: ${compilada.sql}`,
  );
}

void describe('a revogação em massa de famílias de refresh para na conta', () => {
  void it('o WHERE inteiro é o escopo da conta mais a idempotência', () => {
    const compilada = construtorDaRevogacaoEmMassa(
      semBanco,
      DONO,
      'logout_all',
      AGORA,
    ).compile();

    conferirEscopo(compilada, {
      tabela: 'refresh_tokens',
      where: '"user_id" = $3 and "revoked_at" is null',
      parametros: [new Date(AGORA), 'logout_all', DONO],
    });
  });

  void it('o dono ligado à posição do predicado é o dono, e não outro parâmetro', () => {
    const compilada = construtorDaRevogacaoEmMassa(
      semBanco,
      DONO,
      'password_changed',
      AGORA,
    ).compile();

    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      `a posição $n do predicado do dono carrega outro valor. SQL: ${compilada.sql}`,
    );
  });

  void it('ela devolve as linhas atingidas: a contagem da trilha sai do RETURNING', () => {
    // `revogarTodasAsFamilias` devolve `linhas.length`. Sem `returning`, o
    // `execute()` volta vazio e a trilha do SEC-006 passa a gravar zero família
    // derrubada em toda revogação, sem que nada mais mude.
    const { sql } = construtorDaRevogacaoEmMassa(semBanco, DONO, 'logout_all', AGORA).compile();
    assert.match(sql, /returning "id"$/, `o RETURNING saiu da instrução: ${sql}`);
  });
});

void describe('a invalidação de tokens pendentes para na conta', () => {
  void it('o WHERE inteiro é o escopo da conta mais a idempotência', () => {
    const compilada = construtorDaInvalidacaoDeTokensPendentes(semBanco, DONO, AGORA).compile();

    conferirEscopo(compilada, {
      tabela: 'verification_tokens',
      where: '"user_id" = $2 and "consumed_at" is null',
      parametros: [new Date(AGORA), DONO],
    });
  });

  void it('o dono ligado à posição do predicado é o dono, e não a data', () => {
    const compilada = construtorDaInvalidacaoDeTokensPendentes(semBanco, DONO, AGORA).compile();

    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      `a posição $n do predicado do dono carrega outro valor. SQL: ${compilada.sql}`,
    );
  });

  void it('ela não filtra por `purpose`: a troca de senha queima TODO link pendente', () => {
    // Critério 9 da BICHUS-77. Um `purpose` no WHERE deixaria de fora
    // justamente a classe de link por onde quem tomou a conta volta, e o
    // estreitamento é tão silencioso quanto o alargamento.
    const { sql } = construtorDaInvalidacaoDeTokensPendentes(semBanco, DONO, AGORA).compile();
    assert.ok(
      !sql.includes('"purpose"'),
      `a invalidação ganhou um filtro de propósito e deixa link pendente vivo: ${sql}`,
    );
  });
});

void describe('ISCA: a conferência de escopo REPROVA as escritas largas demais', () => {
  /** Como a revogação em massa é escrita quando está certa. */
  const CERTA = {
    tabela: 'refresh_tokens',
    where: '"user_id" = $3 and "revoked_at" is null',
    parametros: [new Date(AGORA), 'logout_all', DONO],
  } as const;

  function reprova(compilada: Compilada, esperado: EscopoEsperado = CERTA): void {
    assert.throws(
      () => {
        conferirEscopo(compilada, esperado);
      },
      assert.AssertionError,
      `a conferência APROVOU esta instrução: ${compilada.sql}`,
    );
  }

  void it('um UPDATE sem WHERE nenhum é acusado', () => {
    const semEscopo = semBanco
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(AGORA), revoked_reason: 'logout_all' })
      .compile();
    reprova(semEscopo);
  });

  void it('um UPDATE que perdeu só o `user_id` é acusado', () => {
    const semDono = semBanco
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(AGORA), revoked_reason: 'logout_all' })
      .where('revoked_at', 'is', null)
      .returning('id')
      .compile();
    reprova(semDono);
  });

  void it('a coluna certa com o operador errado é acusada', () => {
    // `is not $n` tem o nome da coluna e casa toda linha da tabela.
    const operadorErrado = semBanco
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(AGORA), revoked_reason: 'logout_all' })
      .where('user_id', 'is not', DONO)
      .where('revoked_at', 'is', null)
      .returning('id')
      .compile();
    reprova(operadorErrado);
  });

  void it('um DELETE com o mesmo WHERE é acusado', () => {
    const apagando = semBanco
      .deleteFrom('refresh_tokens')
      .where('user_id', '=', DONO)
      .where('revoked_at', 'is', null)
      .compile();
    reprova(apagando);
  });

  void it('um estreitamento silencioso também é acusado', () => {
    // Uma família de outro aparelho sobreviveria ao "sair de todos", que é o
    // contrário do que o gatilho existe para fazer. Alargar e estreitar são o
    // mesmo defeito visto de dois lados, e os dois precisam parar aqui.
    const estreita = semBanco
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(AGORA), revoked_reason: 'logout_all' })
      .where('user_id', '=', DONO)
      .where('revoked_at', 'is', null)
      .where('stay_signed_in', '=', true)
      .returning('id')
      .compile();
    reprova(estreita);
  });

  void it('a presença do predicado NÃO prova o alcance, e é por isso que este arquivo existe', () => {
    // Esta é a instrução que separa a forma de LEITURA da forma de ESCRITA EM
    // MASSA. `("user_id" = $2 or "user_id" is not null)` tem a coluna certa, o
    // operador certo e o DONO ligado à posição certa do predicado — e revoga a
    // base inteira.
    const alargada = semBanco
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date(AGORA), revoked_reason: 'logout_all' })
      .where((eb) => eb.or([eb('user_id', '=', DONO), eb('user_id', 'is not', null)]))
      .where('revoked_at', 'is', null)
      .returning('id')
      .compile();

    assert.match(
      alargada.sql,
      PREDICADO_DO_DONO,
      'a isca precisa mesmo carregar o predicado, senão ela não prova nada',
    );
    assert.equal(
      donoLigadoAoPredicado(alargada),
      DONO,
      'a isca precisa mesmo ligar o DONO à posição do predicado: é essa a ' +
        'conferência da BICHUS-92 que ela tem de atravessar',
    );

    // Ou seja: o molde da BICHUS-92, aplicado a esta instrução, aprova.
    // A conferência de cláusula inteira reprova.
    reprova(alargada, {
      tabela: 'refresh_tokens',
      where: '"user_id" = $2 and "revoked_at" is null',
      parametros: [new Date(AGORA), DONO],
    });
  });

  void it('a invalidação de tokens alargada com `or true` também é acusada', () => {
    const alargada = semBanco
      .updateTable('verification_tokens')
      .set({ consumed_at: new Date(AGORA) })
      .where((eb) => eb.or([eb('user_id', '=', DONO), eb('consumed_at', 'is', null)]))
      .compile();
    reprova(alargada, {
      tabela: 'verification_tokens',
      where: '"user_id" = $2 and "consumed_at" is null',
      parametros: [new Date(AGORA), DONO],
    });
  });
});
