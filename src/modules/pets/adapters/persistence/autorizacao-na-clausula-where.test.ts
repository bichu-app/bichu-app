/**
 * A autorização do cadastro do pet está na cláusula `WHERE`, e o SQL compilado
 * prova isso.
 *
 * ## Por que conferir o SQL, e não a resposta da rota
 *
 * O cabeçalho de `kysely-pet-repository.ts` afirma que "a consulta que
 * devolveria o pet de outro tutor não existe neste arquivo". Até esta branch
 * essa frase valia por confiança: **cada uma das quatro cláusulas de dono deste
 * adaptador foi removida, uma por vez, e os 967 casos unitários continuaram
 * verdes nas quatro**. O comportamento estava correto; o que faltava era a
 * verificação.
 *
 * O ADR-0021 não diz "não devolva o pet do outro". Ele diz **onde** a decisão
 * mora, e isso não é observável de fora: a consulta que traz o pet do outro e o
 * descarta num `if` responde igual — até o dia em que alguém mexe no `if`, e aí
 * não existe teste que acuse, porque o `if` era o teste.
 *
 * Este arquivo é o instrumento da BICHUS-92 aplicado ao adaptador de pets, com
 * a emenda da BICHUS-237. Ele compila as consultas com `DummyDriver`, sem banco
 * e sem executá-las, e lê o predicado.
 *
 * Ele lê o **SQL compilado**, nunca o texto-fonte do adaptador. A distinção
 * importa: uma conferência que procurasse a coluna no arquivo casaria com a
 * menção dentro deste comentário e dentro do comentário do próprio adaptador, e
 * ficaria verde com a cláusula removida.
 *
 * ## Por que a posição `$n`, e não `parameters.includes(dono)`
 *
 * O molde original da BICHUS-92 conferia `parameters.includes(DONO)`. Aqui isso
 * seria quase inútil, e `construtorDaAtualizacao` mostra por quê: o `UPDATE`
 * liga **dezessete** valores no `SET` antes de chegar ao `WHERE`, e o dono cai
 * na posição `$19`. Uma conferência por lista de parâmetros aprovaria
 * `where('owner_user_id', '=', petId)` — coluna certa, operador certo, valor
 * errado, com o dono ainda na lista por causa do `id = $18`. Este arquivo lê de
 * volta a posição que o **próprio predicado** ocupa.
 *
 * ## O AVISO DE MÉTODO: exija que o arquivo mude antes de rodar a prova
 *
 * O autor da BICHUS-237 tentou desligar uma cláusula, a substituição **não
 * casou com o texto do arquivo** e reescreveu o mesmo conteúdo. A suíte ficou
 * verde e ele quase concluiu "a isca não pega esse caso". Uma prova de isca só
 * conta quando o arquivo de fato mudou entre o antes e o depois — `git diff`
 * não vazio, ou um `sed` cujo resultado difere da origem. Sem essa exigência, o
 * que se mede é o silêncio da própria tentativa.
 *
 * ## A isca, e como ela foi provada
 *
 * Cada mecanismo foi desligado em `kysely-pet-repository.ts`, a suíte rodou, e
 * o mecanismo foi restaurado. Cada desligamento foi confirmado por diferença de
 * conteúdo do arquivo ANTES de a suíte rodar. Em 22/09/2026, Node v26.8.2:
 *
 * Base: 987 casos, 987 passaram.
 *
 * | o que foi desligado em `kysely-pet-repository.ts` | reprovaram |
 * |---|---|
 * | `.where('pets.owner_user_id', '=', dono)` de `construtorDaLeituraDoDono` | 3 casos |
 * | `.where('owner_user_id', '=', dono)` de `construtorDaContagemDoTutor` | 1 caso |
 * | `.where('owner_user_id', '=', dono)` de `construtorDaAtualizacao` | 1 caso |
 * | `.where('owner_user_id', '=', dono)` de `construtorDaExclusao` | 1 caso |
 * | `=` virando `is not` na leitura do dono | 2 casos |
 * | o `dono` do predicado da atualização virando `petId` | 1 caso |
 * | `.where('pets.deleted_at', 'is', null)` da leitura do dono | 1 caso |
 *
 * A quinta e a sexta linhas são o motivo de o predicado cobrar o operador e o
 * **valor ligado** à posição `$n`, e não a presença do nome da coluna no texto:
 * `is not $1` casa toda linha da tabela, e `owner_user_id = :petId` é uma
 * igualdade acidental esperando dois uuids coincidirem.
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
import type { Instant, PetId, UserId } from '../../../../shared/types/brands.js';
import type { DadosDoPet } from '../../ports/pet-repository.js';
import {
  construtorDaAtualizacao,
  construtorDaContagemDoTutor,
  construtorDaExclusao,
  construtorDaLeituraDoDono,
  valoresDaAtualizacao,
} from './kysely-pet-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const QUANDO = 1_800_000_000_000 as Instant;

const DADOS: DadosDoPet = {
  name: 'Bichinho',
  species: 'dog',
  breedCode: null,
  breedFreeText: null,
  refDataVersion: null,
  size: 'M',
  primaryColorCode: null,
  secondaryColorCode: null,
  sex: null,
  neutered: null,
  birthDateApprox: null,
  distinctiveMarks: null,
  careNotes: null,
  careNotesRedactions: [],
  microchipNumber: null,
  sinpatinhasId: null,
};

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
 * O predicado do dono, como o compilador do Postgres o escreve:
 * `"owner_user_id" = $n`, com ou sem o `"pets".` na frente.
 *
 * A regex cobra o OPERADOR junto do nome. Sem isso, um `is not` com a coluna
 * certa passaria — e `is not $1` casa toda linha da tabela.
 */
const PREDICADO_DO_DONO = /"owner_user_id"\s*=\s*\$(\d+)/;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * O valor REALMENTE ligado à posição que o predicado do dono ocupa.
 *
 * Conferir `parameters.includes(DONO)` seria mais frouxo do que parece, e no
 * `UPDATE` de `atualizar` seria quase nada: dezessete valores do `SET` vêm
 * antes, e o dono cai em `$19`. Uma consulta com
 * `where('owner_user_id', '=', petId)` teria coluna certa, operador certo,
 * valor errado, e o dono ainda entre os parâmetros por causa de outro
 * predicado. Aqui a posição `$n` do próprio predicado é lida de volta.
 */
function donoLigadoAoPredicado(compilada: Compilada): unknown {
  const achado = PREDICADO_DO_DONO.exec(compilada.sql);
  assert.ok(
    achado !== null,
    `a consulta perdeu o predicado do dono. SQL compilado: ${compilada.sql}`,
  );
  return compilada.parameters[Number(achado[1]) - 1];
}

void describe('toda consulta de pet que responde a um tutor carrega o dono no WHERE', () => {
  void it('a leitura do dono tem o predicado do dono, com o dono ligado', () => {
    const compilada = construtorDaLeituraDoDono(semBanco, DONO).compile();

    assert.match(
      compilada.sql,
      PREDICADO_DO_DONO,
      `a leitura do dono perdeu a única coisa que a autoriza. SQL compilado: ${compilada.sql}`,
    );
    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      'o predicado do dono existe e está ligado a outro valor: a consulta autoriza contra ' +
        'algo que não é a conta do token',
    );
  });

  void it('a leitura do dono é a base de buscar, listar e da releitura de criar', () => {
    // Um construtor só para os três caminhos, de propósito: três cópias seriam
    // três chances de uma delas divergir sem ninguém acusar. `buscarDoTutor`
    // adiciona `pets.id = :pet` no ponto de chamada, e o dono já está aqui.
    const { sql } = construtorDaLeituraDoDono(semBanco, DONO)
      .where('pets.id', '=', PET)
      .compile();

    assert.match(sql, PREDICADO_DO_DONO, `SQL: ${sql}`);
    assert.match(sql, /"pets"\."id"\s*=\s*\$\d+/, `o pet saiu do WHERE. SQL: ${sql}`);
    assert.match(
      sql,
      /"pets"\."deleted_at"\s+is\s+null/,
      `pet excluído voltou a ser legível. SQL: ${sql}`,
    );
  });

  void it('a leitura do dono liga o dono a $2, e não a $1: a subconsulta de tags vem antes', () => {
    // O detalhe que torna `parameters[0]` uma leitura errada: o `count(*)` de
    // tags ativas liga `'active'` em `$1`, e o dono só aparece em `$2`.
    const compilada = construtorDaLeituraDoDono(semBanco, DONO).compile();

    assert.deepEqual(
      [...compilada.parameters],
      ['active', DONO],
      'a ordem dos parâmetros mudou; a leitura por posição continua certa, mas a tabela de ' +
        'prova do cabeçalho precisa ser refeita',
    );
  });

  void it('a contagem do tutor tem o dono ligado', () => {
    const compilada = construtorDaContagemDoTutor(semBanco, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      'é a contagem que decide o teto de pets por conta. Sem o dono no WHERE ela conta os ' +
        'pets do mundo inteiro, e a primeira conta a criar um pet bateria no teto',
    );
  });

  void it('a atualização tem o dono ligado, atrás de dezessete valores do SET', () => {
    const compilada = construtorDaAtualizacao(
      semBanco,
      PET,
      DONO,
      valoresDaAtualizacao(DADOS, new Date(Number(QUANDO))),
    ).compile();

    assert.match(
      compilada.sql,
      PREDICADO_DO_DONO,
      `o UPDATE da ficha perdeu o dono: qualquer conta edita qualquer pet. SQL: ${compilada.sql}`,
    );
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
    assert.match(compilada.sql, /"id"\s*=\s*\$\d+/, `o pet saiu do WHERE. SQL: ${compilada.sql}`);
    assert.match(
      compilada.sql,
      /"deleted_at"\s+is\s+null/,
      `pet excluído voltou a ser editável. SQL: ${compilada.sql}`,
    );
  });

  void it('a exclusão tem o dono ligado', () => {
    const compilada = construtorDaExclusao(semBanco, PET, DONO, QUANDO).compile();

    assert.match(
      compilada.sql,
      PREDICADO_DO_DONO,
      `o UPDATE de exclusão perdeu o dono: qualquer conta apaga qualquer pet. SQL: ${compilada.sql}`,
    );
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
    assert.match(compilada.sql, /"id"\s*=\s*\$\d+/, `o pet saiu do WHERE. SQL: ${compilada.sql}`);
  });
});

void describe('ISCA: a mesma conferência REPROVA uma consulta sem o dono', () => {
  void it('um SELECT sem `owner_user_id` no WHERE é acusado pelo predicado', () => {
    const semDono = semBanco
      .selectFrom('pets')
      .select('id')
      .where('id', '=', PET)
      .where('deleted_at', 'is', null)
      .compile();

    assert.ok(
      !PREDICADO_DO_DONO.test(semDono.sql),
      'a conferência passou numa consulta que serve o pet de qualquer conta: ela parou de ' +
        'enxergar a ausência do dono, e os casos acima passaram a medir o silêncio dela',
    );
  });

  void it('um WHERE com a coluna certa e o operador errado também é acusado', () => {
    // `is not $1` tem o nome da coluna e casa toda linha da tabela. É por isso
    // que o predicado cobra o `=` junto do nome.
    const operadorErrado = semBanco
      .selectFrom('pets')
      .select('id')
      .where('owner_user_id', 'is not', DONO)
      .compile();

    assert.ok(
      operadorErrado.sql.includes('"owner_user_id"'),
      'a isca precisa mesmo mencionar a coluna, senão ela não prova nada',
    );
    assert.ok(
      !PREDICADO_DO_DONO.test(operadorErrado.sql),
      `uma conferência que só procurasse o NOME aprovaria isto: ${operadorErrado.sql}`,
    );
  });

  void it('a coluna e o operador certos com o VALOR errado são acusados', () => {
    // O caso que `parameters.includes(DONO)` deixaria passar: o dono continua
    // entre os parâmetros, ligado a outro predicado, e a autorização é feita
    // contra o id do pet.
    const valorErrado = semBanco
      .selectFrom('pets')
      .select('id')
      .where('id', '=', DONO as unknown as PetId)
      .where('owner_user_id', '=', PET as unknown as UserId)
      .compile();

    assert.ok(
      valorErrado.parameters.includes(DONO),
      'a isca precisa ter o dono entre os parâmetros, senão ela não prova o ponto',
    );
    assert.notEqual(
      donoLigadoAoPredicado(valorErrado),
      DONO,
      'uma conferência que só procurasse o dono na lista de parâmetros aprovaria esta ' +
        `consulta, que autoriza contra o id do pet: ${valorErrado.sql}`,
    );
  });

  void it('no UPDATE, o valor errado é acusado mesmo com o dono no SET', () => {
    // A versão mais cruel do caso anterior, e a que o `atualizar` de verdade
    // torna possível: o dono aparece cedo na lista de parâmetros por estar num
    // valor gravado, e o predicado autoriza contra outra coisa.
    const updateErrado = semBanco
      .updateTable('pets')
      .set({ name: DONO })
      .where('owner_user_id', '=', PET as unknown as UserId)
      .compile();

    assert.ok(
      updateErrado.parameters.includes(DONO),
      'a isca precisa ter o dono entre os parâmetros, senão ela não prova o ponto',
    );
    assert.notEqual(
      donoLigadoAoPredicado(updateErrado),
      DONO,
      `um UPDATE que grava o dono e autoriza contra o pet seria aprovado: ${updateErrado.sql}`,
    );
  });
});
