/**
 * A autorização das tags está na cláusula `WHERE`, e o SQL compilado prova isso.
 *
 * ## Por que conferir o SQL, e não a resposta da rota
 *
 * `imagem-do-qr.test.ts` afirma que `GET /v1/pets/{petId}/tags/{tagId}/qr.png`
 * responde 404 para tag de outra pessoa, e ele passa. Ele passa porque **o
 * dublê recusa**, e não porque a consulta filtra: o repositório de verdade não
 * participa daquele arquivo. O caso irmão, `a autorização chega à consulta com
 * o dono do token`, afirma a **chamada** e não o **efeito** — ele fica verde com
 * o furo de pé, porque um `buscarParaReimpressao` que ignorasse o terceiro
 * argumento continuaria sendo chamado com ele.
 *
 * O ADR-0021 não diz "não devolva a linha do outro". Ele diz **onde** a decisão
 * mora, e isso não é observável de fora: a consulta que traz a linha do outro e
 * a descarta num `if` responde igual — até o dia em que alguém mexe no `if`, e
 * aí não existe teste que acuse, porque o `if` era o teste.
 *
 * Este arquivo é o instrumento da BICHUS-92
 * (`identity/adapters/persistence/autorizacao-na-clausula-where.test.ts`)
 * aplicado ao adaptador de tags. Ele compila as consultas com `DummyDriver`,
 * sem banco e sem executá-las, e lê o predicado.
 *
 * Ele lê o **SQL compilado**, nunca o texto-fonte do adaptador. A distinção
 * importa: uma conferência que procurasse a coluna no arquivo casaria com a
 * menção dentro deste comentário e dentro do comentário do próprio adaptador, e
 * ficaria verde com a cláusula removida.
 *
 * ## A isca, e como ela foi provada
 *
 * Cada mecanismo foi desligado em `kysely-tag-repository.ts`, a suíte rodou, e
 * o mecanismo foi restaurado. Em 22/09/2026, Node v26.8.2:
 *
 * Base: 976 casos, 976 passaram.
 *
 * | o que foi desligado em `kysely-tag-repository.ts` | reprovaram |
 * |---|---|
 * | `.where('pets.owner_user_id', '=', dono)` de `construtorDaBuscaParaReimpressao` | 2 casos |
 * | `.where('pets.owner_user_id', '=', dono)` de `construtorDoContextoDoDono` | 1 caso |
 * | `.where('owner_user_id', '=', dono)` de `construtorDaConferenciaDoPet` | 1 caso |
 * | `.where('pets.owner_user_id', '=', dono)` de `construtorDaListaDeTags` | 1 caso |
 * | `=` virando `is not` na busca para reimpressão | 1 caso |
 * | o `dono` do predicado virando `petId` na busca para reimpressão | 2 casos |
 * | `.where('pets.deleted_at', 'is', null)` da busca para reimpressão | 1 caso |
 * | um `.where('pet_tags.status', '=', 'active')` ADICIONADO à busca para reimpressão | 2 casos |
 *
 * A quinta e a sexta linhas são o motivo de o predicado cobrar o operador e o
 * **valor ligado** à posição `$n`, e não a presença do nome da coluna no texto:
 * `is not $1` casa toda linha da tabela, e `owner_user_id = :petId` é uma
 * igualdade acidental esperando dois uuids coincidirem.
 *
 * A última linha é a direção contrária, e ela também precisa reprovar: a
 * ausência de `status` no `WHERE` é deliberada (ADR-0004), e um filtro a mais
 * transformaria o 410 da tag revogada em 404 sem quebrar nada visível.
 *
 * Uma nona tentativa não conta como prova e está registrada por isso: a
 * primeira remoção de `pets.deleted_at` não casou com o texto do arquivo e
 * escreveu de volta o mesmo conteúdo. A suíte ficou verde, e um relatório
 * apressado teria chamado isso de "a isca não pega esse caso". O script passou
 * a exigir que o arquivo mudasse antes de rodar.
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
import type { PetId, TagId, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaBuscaParaReimpressao,
  construtorDaConferenciaDoPet,
  construtorDaListaDeTags,
  construtorDoContextoDoDono,
} from './kysely-tag-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const TAG = '018f3a2b-0000-7000-8000-0000000000dd' as TagId;
const CODE_HASH = new Uint8Array(32).fill(0x5e);

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
 * Conferir `parameters.includes(DONO)` seria mais frouxo do que parece: numa
 * consulta que também liga `petId` e `tagId`, ela aprovaria
 * `where('pets.owner_user_id', '=', petId)` — coluna certa, operador certo,
 * valor errado, e o dono ainda entre os parâmetros por causa de outro predicado
 * qualquer. Aqui a posição `$n` do próprio predicado é lida de volta.
 */
function donoLigadoAoPredicado(compilada: Compilada): unknown {
  const achado = PREDICADO_DO_DONO.exec(compilada.sql);
  assert.ok(
    achado !== null,
    `a consulta perdeu o predicado do dono. SQL compilado: ${compilada.sql}`,
  );
  return compilada.parameters[Number(achado[1]) - 1];
}

void describe('toda consulta de tag que responde a um tutor carrega o dono no WHERE', () => {
  void it('a busca para reimpressão do QR tem o predicado do dono, com o dono ligado', () => {
    const compilada = construtorDaBuscaParaReimpressao(semBanco, PET, TAG, DONO).compile();

    assert.match(
      compilada.sql,
      PREDICADO_DO_DONO,
      'a rota marcada reveals_credential perdeu a única coisa que a autoriza. ' +
        `SQL compilado: ${compilada.sql}`,
    );
    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      'o predicado do dono existe e está ligado a outro valor: a consulta autoriza contra ' +
        'algo que não é a conta do token',
    );
  });

  void it('a busca para reimpressão amarra pet e tag no MESMO WHERE, sem `if` depois', () => {
    const { sql, parameters } = construtorDaBuscaParaReimpressao(
      semBanco,
      PET,
      TAG,
      DONO,
    ).compile();

    assert.match(sql, /"id"\s*=\s*\$\d+/, `a tag saiu do WHERE. SQL: ${sql}`);
    assert.match(sql, /"pet_id"\s*=\s*\$\d+/, `o pet saiu do WHERE. SQL: ${sql}`);
    assert.match(
      sql,
      /"deleted_at"\s+is\s+null/,
      `pet excluído voltou a reimprimir a plaquinha. SQL: ${sql}`,
    );
    assert.deepEqual(
      [...parameters],
      [TAG, PET, DONO],
      'os três predicados são irmãos no mesmo WHERE, na ordem em que o adaptador os escreve',
    );
  });

  void it('a busca para reimpressão NÃO filtra por `status`, e a ausência é deliberada', () => {
    const { sql } = construtorDaBuscaParaReimpressao(semBanco, PET, TAG, DONO).compile();

    // A tag revogada do próprio tutor precisa ser distinguível da inexistente
    // para a resposta ser 410 e não 404 (ADR-0004). Um `status = 'active'` aqui
    // juntaria os dois casos num só, e o 410 sumiria sem nada acusar.
    assert.ok(
      !/"status"\s*=\s*\$\d+/.test(sql),
      `a reimpressão ganhou um filtro de status e o 410 da tag revogada virou 404. SQL: ${sql}`,
    );
  });

  void it('o contexto do dono tem o resumo do código e o dono no mesmo WHERE', () => {
    const compilada = construtorDoContextoDoDono(semBanco, CODE_HASH, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
    assert.match(
      compilada.sql,
      /"code_hash"\s*=\s*\$\d+/,
      `o resumo do código saiu do WHERE. SQL: ${compilada.sql}`,
    );
  });

  void it('a conferência do pet — de listar e de emitir — tem o dono ligado', () => {
    const compilada = construtorDaConferenciaDoPet(semBanco, PET, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      'é a consulta que impede emitir e listar plaquinha de pet alheio a partir de um id ' +
        'adivinhado, e ela é a mesma nos dois caminhos',
    );
  });

  void it('a lista de tags do pet tem o dono ligado', () => {
    const compilada = construtorDaListaDeTags(semBanco, PET, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
  });
});

void describe('ISCA: a mesma conferência REPROVA uma consulta sem o dono', () => {
  void it('um SELECT sem `owner_user_id` no WHERE é acusado pelo predicado', () => {
    const semDono = semBanco
      .selectFrom('pet_tags')
      .innerJoin('pets', 'pets.id', 'pet_tags.pet_id')
      .select(['pet_tags.status as status', 'pet_tags.code_ciphertext as code_ciphertext'])
      .where('pet_tags.id', '=', TAG)
      .where('pet_tags.pet_id', '=', PET)
      .compile();

    assert.ok(
      !PREDICADO_DO_DONO.test(semDono.sql),
      'a conferência passou numa consulta que serve o cifrado de qualquer tag: ela parou ' +
        'de enxergar a ausência do dono, e os casos acima passaram a medir o silêncio dela',
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
      .where('id', '=', DONO)
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
});
