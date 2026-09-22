/**
 * A autorização da mídia está na cláusula `WHERE`, e o SQL compilado prova isso.
 *
 * ## Por que conferir o SQL, e não a resposta da rota
 *
 * O cabeçalho de `kysely-media-repository.ts` afirma que "a consulta que
 * devolveria a foto de outro tutor não existe neste arquivo". Até esta branch
 * essa frase valia por confiança: **cada uma das cinco cláusulas de dono deste
 * adaptador foi removida, uma por vez, e os 967 casos unitários continuaram
 * verdes nas cinco**. O comportamento estava correto; o que faltava era a
 * verificação.
 *
 * O ADR-0021 não diz "não devolva a foto do outro". Ele diz **onde** a decisão
 * mora, e isso não é observável de fora: a consulta que traz a foto do outro e
 * a descarta num `if` responde igual — até o dia em que alguém mexe no `if`, e
 * aí não existe teste que acuse, porque o `if` era o teste.
 *
 * Ele lê o **SQL compilado**, nunca o texto-fonte do adaptador. Uma conferência
 * que procurasse a coluna no arquivo casaria com a menção dentro deste
 * comentário e dentro do comentário do próprio adaptador, e ficaria verde com a
 * cláusula removida.
 *
 * ## Duas colunas de dono, e por isso dois predicados
 *
 * Quatro consultas autorizam por `pets.owner_user_id`. `buscarIntencaoAberta`
 * autoriza por `upload_intents.user_id`, porque a tabela guarda **quem pediu o
 * envio**, e não o dono do pet. Uma isca com um predicado só ficaria verde com
 * a cláusula da intenção removida — é o caso em que a verificação não consegue
 * verificar e mesmo assim aprova, que é pior que não existir.
 *
 * ## Por que a posição `$n`, e não `parameters.includes(dono)`
 *
 * O molde original da BICHUS-92 conferia `parameters.includes(DONO)`. As
 * consultas daqui ligam três e cinco valores na mesma chamada
 * (`construtorDaBuscaDeFoto` liga foto, pet e dono; `construtorDaExclusaoDeFoto`
 * liga data, `is_primary`, foto, pet e dono), então a lista de parâmetros
 * aprovaria `where('pets.owner_user_id', '=', petId)` — coluna certa, operador
 * certo, valor errado, com o dono ainda na lista por causa de outro predicado.
 * Este arquivo lê de volta a posição que o **próprio predicado** ocupa.
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
 * Cada mecanismo foi desligado em `kysely-media-repository.ts`, a suíte rodou, e
 * o mecanismo foi restaurado. Cada desligamento foi confirmado por diferença de
 * conteúdo do arquivo ANTES de a suíte rodar. Em 22/09/2026, Node v26.8.2:
 *
 * Base: 987 casos, 987 passaram.
 *
 * | o que foi desligado em `kysely-media-repository.ts` | reprovaram |
 * |---|---|
 * | `.where('owner_user_id', '=', dono)` de `construtorDaConferenciaDoPet` | 1 caso |
 * | `.where('user_id', '=', dono)` de `construtorDaIntencaoAberta` | 1 caso |
 * | `.where('pets.owner_user_id', '=', dono)` de `construtorDaListaDoPet` | 1 caso |
 * | `.where('pets.owner_user_id', '=', dono)` de `construtorDaBuscaDeFoto` | 1 caso |
 * | `.where('pets.owner_user_id', '=', dono)` do `exists` de `construtorDaExclusaoDeFoto` | 1 caso |
 * | o `dono` do predicado da busca de foto virando `petId` | 1 caso |
 * | `whereRef('pets.id', '=', 'pet_photos.pet_id')` do `exists` da exclusão | 1 caso |
 *
 * A sexta linha é o motivo de o predicado cobrar o **valor ligado** à posição
 * `$n`, e não a presença do nome da coluna no texto. A sétima é o motivo de o
 * `exists` ser conferido como um todo: sem a correlação, `exists` é verdadeiro
 * para quem tiver QUALQUER pet, e o `owner_user_id` continua no texto do SQL,
 * ligado ao dono certo — só o `whereRef` acusa esse caso.
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
import {
  construtorDaBuscaDeFoto,
  construtorDaConferenciaDoPet,
  construtorDaExclusaoDeFoto,
  construtorDaIntencaoAberta,
  construtorDaListaDoPet,
} from './kysely-media-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const FOTO = '018f3a2b-0000-7000-8000-0000000000ee';
const INTENCAO = '018f3a2b-0000-7000-8000-0000000000ff';
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

/**
 * O dono do pet, como o compilador do Postgres o escreve:
 * `"owner_user_id" = $n`, com ou sem o `"pets".` na frente.
 *
 * A regex cobra o OPERADOR junto do nome. Sem isso, um `is not` com a coluna
 * certa passaria — e `is not $1` casa toda linha da tabela.
 */
const PREDICADO_DO_DONO = /"owner_user_id"\s*=\s*\$(\d+)/;

/**
 * O dono da intenção de envio, que é outra coluna: `upload_intents.user_id`.
 *
 * A aspa de abertura no padrão é o que impede este predicado de casar com
 * `"owner_user_id"` — ali o caractere antes de `user_id` é `_`, e não `"`. O
 * caso `as duas colunas de dono não se confundem` prova essa separação, porque
 * ela é sutil o bastante para alguém "simplificar" a regex e reabrir o furo.
 */
const PREDICADO_DA_INTENCAO = /"user_id"\s*=\s*\$(\d+)/;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/** O valor REALMENTE ligado à posição que um predicado ocupa. */
function valorLigadoAo(predicado: RegExp, compilada: Compilada): unknown {
  const achado = predicado.exec(compilada.sql);
  assert.ok(
    achado !== null,
    `a consulta perdeu o predicado ${String(predicado)}. SQL compilado: ${compilada.sql}`,
  );
  return compilada.parameters[Number(achado[1]) - 1];
}

const donoLigadoAoPredicado = (c: Compilada): unknown => valorLigadoAo(PREDICADO_DO_DONO, c);

void describe('toda consulta de mídia que responde a um tutor carrega o dono no WHERE', () => {
  void it('a conferência do pet tem o dono ligado', () => {
    const compilada = construtorDaConferenciaDoPet(semBanco, PET, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(
      donoLigadoAoPredicado(compilada),
      DONO,
      'é a consulta que impede enviar foto para o pet de outra pessoa a partir de um id ' +
        'adivinhado',
    );
    assert.match(
      compilada.sql,
      /"deleted_at"\s+is\s+null/,
      `pet excluído voltou a aceitar foto. SQL: ${compilada.sql}`,
    );
  });

  void it('a intenção de envio tem o dono ligado, e ele é `user_id`', () => {
    const compilada = construtorDaIntencaoAberta(semBanco, INTENCAO, DONO, AGORA).compile();

    assert.match(
      compilada.sql,
      PREDICADO_DA_INTENCAO,
      `a intenção perdeu o dono: qualquer conta confirma o envio de qualquer outra. ` +
        `SQL: ${compilada.sql}`,
    );
    assert.equal(valorLigadoAo(PREDICADO_DA_INTENCAO, compilada), DONO);

    // As três condições são irmãs no mesmo WHERE: dono errado, vencida e já
    // confirmada saem todas como `null`, e é o serviço que as transforma na
    // MESMA resposta.
    assert.match(compilada.sql, /"expires_at"\s*>\s*\$\d+/, `SQL: ${compilada.sql}`);
    assert.match(compilada.sql, /"confirmed_at"\s+is\s+null/, `SQL: ${compilada.sql}`);
  });

  void it('a lista de fotos do pet tem o dono ligado', () => {
    const compilada = construtorDaListaDoPet(semBanco, PET, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
    assert.match(
      compilada.sql,
      /"pet_photos"\."pet_id"\s*=\s*\$\d+/,
      `o pet saiu do WHERE. SQL: ${compilada.sql}`,
    );
  });

  void it('a busca de uma foto amarra foto, pet e dono no MESMO WHERE, sem `if` depois', () => {
    const compilada = construtorDaBuscaDeFoto(semBanco, PET, FOTO, DONO).compile();

    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(donoLigadoAoPredicado(compilada), DONO);
    assert.deepEqual(
      [...compilada.parameters],
      [FOTO, PET, DONO],
      'os três predicados são irmãos no mesmo WHERE, na ordem em que o adaptador os escreve',
    );
  });

  void it('a exclusão da foto tem o dono ligado dentro de um `exists` CORRELACIONADO', () => {
    const compilada = construtorDaExclusaoDeFoto(semBanco, PET, FOTO, DONO, AGORA).compile();

    assert.match(
      compilada.sql,
      /exists\s*\(/,
      `o exists do dono sumiu. SQL: ${compilada.sql}`,
    );
    assert.match(compilada.sql, PREDICADO_DO_DONO, `SQL: ${compilada.sql}`);
    assert.equal(donoLigadoAoPredicado(compilada), DONO);

    // A correlação é tão essencial quanto o `owner_user_id`: sem ela o `exists`
    // é verdadeiro para quem tiver QUALQUER pet, e a foto de qualquer um seria
    // apagável. O nome da coluna continuaria no SQL, então só o `whereRef`
    // acusa este caso.
    assert.match(
      compilada.sql,
      /"pets"\."id"\s*=\s*"pet_photos"\."pet_id"/,
      'o `exists` perdeu a correlação: ele passou a responder "esta conta tem algum pet?" ' +
        `em vez de "esta conta é dona DESTE pet?". SQL: ${compilada.sql}`,
    );
  });
});

void describe('ISCA: a mesma conferência REPROVA uma consulta sem o dono', () => {
  void it('um SELECT sem `owner_user_id` no WHERE é acusado pelo predicado', () => {
    const semDono = semBanco
      .selectFrom('pet_photos')
      .innerJoin('pets', 'pets.id', 'pet_photos.pet_id')
      .select('pet_photos.id')
      .where('pet_photos.id', '=', FOTO)
      .where('pet_photos.pet_id', '=', PET)
      .compile();

    assert.ok(
      !PREDICADO_DO_DONO.test(semDono.sql),
      'a conferência passou numa consulta que serve a foto de qualquer pet: ela parou de ' +
        'enxergar a ausência do dono, e os casos acima passaram a medir o silêncio dela',
    );
  });

  void it('as duas colunas de dono não se confundem', () => {
    // Se `PREDICADO_DA_INTENCAO` casasse com `"owner_user_id" = $n`, a cláusula
    // de `buscarIntencaoAberta` poderia sumir sem nada acusar, porque o caso
    // dela encontraria o predicado do pet numa consulta qualquer. A aspa de
    // abertura é o que separa os dois, e isso é sutil o bastante para alguém
    // "simplificar" a regex.
    const soDono = semBanco
      .selectFrom('pets')
      .select('id')
      .where('owner_user_id', '=', DONO)
      .compile();

    assert.match(soDono.sql, PREDICADO_DO_DONO);
    assert.ok(
      !PREDICADO_DA_INTENCAO.test(soDono.sql),
      `o predicado da intenção casou com a coluna do pet: ${soDono.sql}`,
    );

    const soIntencao = semBanco
      .selectFrom('upload_intents')
      .select('id')
      .where('user_id', '=', DONO)
      .compile();

    assert.match(soIntencao.sql, PREDICADO_DA_INTENCAO);
    assert.ok(
      !PREDICADO_DO_DONO.test(soIntencao.sql),
      `o predicado do pet casou com a coluna da intenção: ${soIntencao.sql}`,
    );
  });

  void it('um WHERE com a coluna certa e o operador errado também é acusado', () => {
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
      .selectFrom('pet_photos')
      .innerJoin('pets', 'pets.id', 'pet_photos.pet_id')
      .select('pet_photos.id')
      .where('pet_photos.id', '=', DONO)
      .where('pets.owner_user_id', '=', PET as unknown as UserId)
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

  void it('um `exists` SEM correlação é acusado, e o nome da coluna continua lá', () => {
    // A isca da oitava linha da tabela: o `owner_user_id` está no SQL, ligado
    // ao dono certo, e mesmo assim a consulta apaga a foto de qualquer um,
    // porque o `exists` só pergunta se a conta tem algum pet.
    const semCorrelacao = semBanco
      .updateTable('pet_photos')
      .set({ is_primary: false })
      .where('id', '=', FOTO)
      .where((eb) =>
        eb.exists(eb.selectFrom('pets').select('pets.id').where('pets.owner_user_id', '=', DONO)),
      )
      .compile();

    assert.match(
      semCorrelacao.sql,
      PREDICADO_DO_DONO,
      'a isca precisa ter o predicado do dono presente e correto, senão ela não prova o ponto',
    );
    assert.equal(
      donoLigadoAoPredicado(semCorrelacao),
      DONO,
      'e ligado ao dono certo: é exatamente por isso que só a correlação acusa este caso',
    );
    assert.ok(
      !/"pets"\."id"\s*=\s*"pet_photos"\."pet_id"/.test(semCorrelacao.sql),
      `uma conferência que só cobrasse o predicado do dono aprovaria isto: ${semCorrelacao.sql}`,
    );
  });
});
