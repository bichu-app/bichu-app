/**
 * A autorizacao da transferencia esta na clausula `WHERE`, e o SQL compilado
 * prova isso.
 *
 * ## Por que conferir o SQL compilado, e nao o texto-fonte nem a resposta
 *
 * O cabecalho de `kysely-transfer-repository.ts` afirma que "a consulta que
 * devolveria a transferencia de outro tutor nao existe neste arquivo". Sem este
 * arquivo, essa frase valeria por confianca.
 *
 * As duas formas erradas de conferir, e as duas foram vistas ficando verdes com
 * a autorizacao removida em outro lugar deste repositorio no mesmo dia:
 *
 * 1. **procurar o texto no arquivo-fonte.** Casa com a mencao da coluna dentro
 *    deste proprio comentario e dentro do comentario do adaptador. Fica verde
 *    com a clausula apagada.
 * 2. **procurar o nome da coluna no SQL inteiro.** Acha a ocorrencia de outro
 *    lugar da mesma consulta -- num `SET`, numa juncao, num `RETURNING` -- e
 *    aprova um `WHERE` que nao tem predicado nenhum.
 *
 * A conferencia aqui le o predicado com o OPERADOR junto, e depois le de volta
 * o **valor ligado a posicao `$n` que aquele predicado ocupa**. As tres iscas do
 * fim do arquivo provam que a conferencia reprova: coluna ausente, operador
 * errado (`is not $1` casa toda linha da tabela) e valor errado (a coluna certa
 * comparada com o id do pet, com o dono ainda entre os parametros).
 *
 * ## O metodo da prova, e a exigencia que ele carrega
 *
 * Cada mecanismo foi desligado em `kysely-transfer-repository.ts`, a suite
 * rodou, e o mecanismo foi restaurado. **Cada desligamento foi confirmado por
 * diferenca de conteudo do arquivo ANTES de a suite rodar** (hash e `git diff`
 * nao vazio): uma substituicao que nao casa com o texto reescreve o mesmo
 * conteudo, a suite fica verde, e o que se mede e o silencio da propria
 * tentativa. A tabela esta na entrega da BICHUS-66.
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
  construtorDaBuscaDoTutor,
  construtorDaRevogacaoDasTags,
  construtorDaTrocaDeDono,
  construtorDoAceite,
  construtorDoCancelamento,
  construtorDoPetDoTutor,
} from './kysely-transfer-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const DESTINO = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const TRANSFER = '018f3a2b-0000-7000-8000-0000000000dd';
const QUANDO = 1_800_000_000_000 as Instant;

/** Kysely sem banco: compila a consulta e nao a executa. O caminho REAL. */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const PREDICADO_DO_TUTOR = /"from_user_id"\s*=\s*\$(\d+)/;
const PREDICADO_DO_DONO_DO_PET = /"owner_user_id"\s*=\s*\$(\d+)/;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * O valor REALMENTE ligado a posicao que o predicado ocupa.
 *
 * `parameters.includes(DONO)` seria frouxo aqui e quase nada no `UPDATE` do
 * aceite, que liga cinco valores no `SET` antes de chegar ao `WHERE`: uma
 * consulta com `where('from_user_id', '=', petId)` teria coluna certa, operador
 * certo, valor errado, e o dono ainda entre os parametros por causa de outro
 * predicado.
 */
function ligadoAo(predicado: RegExp, compilada: Compilada): unknown {
  const achado = predicado.exec(clausulaWhere(compilada));
  assert.ok(achado !== null, `o predicado sumiu do WHERE. SQL compilado: ${compilada.sql}`);
  // A posicao `$n` e GLOBAL na instrucao, mesmo com o texto recortado: e por
  // isso que o recorte nao estraga a leitura de volta do valor.
  return compilada.parameters[Number(achado[1]) - 1];
}

/**
 * SO A CLAUSULA `WHERE`, e este recorte e a correcao mais importante do arquivo.
 *
 * Sem ele, `construtorDaTrocaDeDono` passava com a autorizacao removida: o
 * `UPDATE` grava `set "owner_user_id" = $1`, entao a expressao
 * `"owner_user_id" = $n` casa no SET e a conferencia le o DESTINO como se fosse
 * o predicado de posse. Escrito primeiro sem o recorte, este arquivo reprovou a
 * si mesmo -- e e exatamente o modo de falhar do item 2 do cabecalho: procurar
 * no SQL inteiro e achar a ocorrencia de outro lugar.
 */
function clausulaWhere(compilada: Compilada): string {
  const posicao = compilada.sql.indexOf(' where ');
  assert.ok(
    posicao > 0,
    `a consulta ficou SEM clausula WHERE, o que e a forma mais completa de perder a ` +
      `autorizacao. SQL: ${compilada.sql}`,
  );
  return compilada.sql.slice(posicao);
}

void describe('toda consulta de transferencia que responde a um tutor carrega o dono no WHERE', () => {
  void it('a busca da transferencia tem o tutor no WHERE, com o tutor ligado', () => {
    const compilada = construtorDaBuscaDoTutor(semBanco, TRANSFER, DONO).compile();

    assert.match(
      clausulaWhere(compilada),
      PREDICADO_DO_TUTOR,
      'a busca perdeu a unica coisa que a autoriza: qualquer conta autenticada passa a ler ' +
        `a transferencia de qualquer tutor. SQL: ${compilada.sql}`,
    );
    assert.equal(
      ligadoAo(PREDICADO_DO_TUTOR, compilada),
      DONO,
      'o predicado existe e esta ligado a outro valor: a consulta autoriza contra algo que ' +
        'nao e a conta do token',
    );
    assert.match(
      compilada.sql,
      /"pet_transfers"\."id"\s*=\s*\$\d+/,
      `a transferencia saiu do WHERE. SQL: ${compilada.sql}`,
    );
  });

  void it('a conferencia do pet, antes de abrir, tem o dono ligado e exclui apagado', () => {
    const compilada = construtorDoPetDoTutor(semBanco, PET, DONO).compile();

    assert.match(
      clausulaWhere(compilada),
      PREDICADO_DO_DONO_DO_PET,
      `iniciar transferencia de pet alheio passaria a funcionar. SQL: ${compilada.sql}`,
    );
    assert.equal(ligadoAo(PREDICADO_DO_DONO_DO_PET, compilada), DONO);
    assert.match(
      compilada.sql,
      /"pets"\."deleted_at"\s+is\s+null/,
      `pet excluido voltou a ser transferivel. SQL: ${compilada.sql}`,
    );
  });

  void it('a troca de dono so acerta o pet que AINDA e de quem iniciou', () => {
    const compilada = construtorDaTrocaDeDono(semBanco, PET, DONO, DESTINO, QUANDO).compile();

    assert.match(
      clausulaWhere(compilada),
      PREDICADO_DO_DONO_DO_PET,
      `o UPDATE que troca o dono perdeu a condicao de posse. SQL: ${compilada.sql}`,
    );
    // O CASO CRUEL, e o que este arquivo existe para pegar: o `SET` grava
    // `owner_user_id = DESTINO`, entao a coluna aparece duas vezes no SQL e o
    // DESTINO esta entre os parametros. Uma conferencia por nome de coluna, ou
    // por `parameters.includes`, aprovaria um `WHERE` sem predicado nenhum.
    assert.equal(
      ligadoAo(PREDICADO_DO_DONO_DO_PET, compilada),
      DONO,
      'o predicado de posse esta ligado ao valor errado: a consumacao passaria por cima de ' +
        'uma troca de dono que aconteceu fora desta maquina de estado',
    );
    assert.match(compilada.sql, /"deleted_at"\s+is\s+null/, `SQL: ${compilada.sql}`);
  });
});

void describe('as condicoes de ESTADO tambem moram no WHERE', () => {
  void it('o aceite exige `pending_acceptance` E prazo, no proprio UPDATE', () => {
    const compilada = construtorDoAceite(semBanco, {
      transferencia: TRANSFER,
      toUserId: DESTINO,
      cancelTokenHash: new Uint8Array(32),
      acceptedAt: QUANDO,
      effectiveAt: (QUANDO + 86_400_000) as Instant,
    }).compile();

    const posicaoDoWhere = compilada.sql.indexOf('where');
    assert.ok(posicaoDoWhere > 0, `o UPDATE ficou sem WHERE: ${compilada.sql}`);
    const clausula = compilada.sql.slice(posicaoDoWhere);

    // RECORTADO NO `WHERE`, e nao procurado no SQL inteiro: `status` aparece no
    // `SET` (virando 'accepted') e em `RETURNING`. Uma busca no texto todo
    // acharia `"status"` tres vezes e aprovaria um UPDATE sem condicao nenhuma
    // -- que e o segundo modo de falhar descrito no cabecalho.
    assert.match(
      clausula,
      /"status"\s*=\s*\$\d+/,
      `sem esta condicao, dois aceites do mesmo convite agendam duas consumacoes. WHERE: ${clausula}`,
    );
    assert.match(
      clausula,
      /"invite_expires_at"\s*>\s*\$\d+/,
      `sem esta condicao, convite vencido volta a ser aceito. WHERE: ${clausula}`,
    );

    const achado = /"status"\s*=\s*\$(\d+)/.exec(clausula);
    assert.ok(achado !== null);
    assert.equal(
      compilada.parameters[Number(achado[1]) - 1],
      'pending_acceptance',
      'a condicao existe e compara com outro estado',
    );
  });

  void it('o cancelamento so acerta linha VIVA, e e isso que mata o token depois da consumacao', () => {
    const compilada = construtorDoCancelamento(semBanco, {
      transferencia: TRANSFER,
      motivo: 'cancel_token',
      quando: QUANDO,
      consumirTokenDeCancelamento: true,
    }).compile();

    const clausula = compilada.sql.slice(compilada.sql.indexOf('where'));
    assert.match(
      clausula,
      /"status"\s+in\s*\(\$\d+,\s*\$\d+\)/,
      'sem esta condicao, o token de cancelamento volta a funcionar depois de a ' +
        `transferencia ter se consumado. WHERE: ${clausula}`,
    );

    const posicoes = [...clausula.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]) - 1);
    const valores = posicoes.map((i) => compilada.parameters[i]);
    assert.ok(valores.includes('pending_acceptance'), `WHERE: ${clausula}`);
    assert.ok(valores.includes('accepted'), `WHERE: ${clausula}`);
    // E os dois estados TERMINAIS nao podem estar na lista: cancelar o que ja
    // se consumou e exatamente o que a janela existe para impedir.
    assert.equal(valores.includes('effective'), false, `WHERE: ${clausula}`);
    assert.equal(valores.includes('cancelled'), false, `WHERE: ${clausula}`);
  });

  void it('a revogacao cai sobre TODAS as tags ativas do pet, com o motivo do ADR-0004', () => {
    const compilada = construtorDaRevogacaoDasTags(semBanco, PET, QUANDO).compile();

    const clausula = compilada.sql.slice(compilada.sql.indexOf('where'));
    assert.match(clausula, /"pet_id"\s*=\s*\$\d+/, `WHERE: ${clausula}`);
    assert.match(
      clausula,
      /"status"\s*=\s*\$\d+/,
      `sem isto a revogacao reescreveria tags ja revogadas. WHERE: ${clausula}`,
    );
    // O motivo E do contrato e do ADR. Trocar por `owner_request` faria a rota
    // publica da plaquinha contar outra historia sobre por que ela morreu.
    assert.ok(compilada.parameters.includes('pet_transferred'), `SQL: ${compilada.sql}`);
    // O cifrado morre junto: reimprimir uma plaquinha revogada entregaria um
    // arquivo com cara de bom para uma coleira que responde "tag desativada".
    //
    // O Kysely LIGA o nulo como parametro (`"code_ciphertext" = $4`) em vez de
    // escrever `null` no texto. Procurar o literal aqui foi a primeira versao, e
    // ela reprovou -- conferir a clausula que EXISTE, e nao a que se espera
    // encontrar. A leitura certa e pela posicao.
    const achadoDoCifrado = /"code_ciphertext"\s*=\s*\$(\d+)/.exec(
      compilada.sql.slice(0, compilada.sql.indexOf(' where ')),
    );
    assert.ok(achadoDoCifrado !== null, `o SET perdeu o cifrado. SQL: ${compilada.sql}`);
    assert.equal(
      compilada.parameters[Number(achadoDoCifrado[1]) - 1],
      null,
      'o cifrado precisa ir a NULO, e nao a qualquer outro valor',
    );
  });
});

void describe('ISCA: a mesma conferencia REPROVA uma consulta sem autorizacao', () => {
  void it('um SELECT sem `from_user_id` no WHERE e acusado', () => {
    const semTutor = semBanco
      .selectFrom('pet_transfers')
      .select('id')
      .where('id', '=', TRANSFER)
      .compile();

    assert.ok(
      !PREDICADO_DO_TUTOR.test(semTutor.sql),
      'a conferencia passou numa consulta que serve a transferencia de qualquer conta: ela ' +
        'parou de enxergar a ausencia do tutor, e os casos acima passaram a medir o silencio dela',
    );
  });

  void it('coluna certa com operador errado tambem e acusada', () => {
    // `is not $1` casa toda linha da tabela, e tem o nome da coluna no texto.
    const operadorErrado = semBanco
      .selectFrom('pet_transfers')
      .select('id')
      .where('from_user_id', 'is not', DONO)
      .compile();

    assert.ok(
      operadorErrado.sql.includes('"from_user_id"'),
      'a isca precisa mesmo mencionar a coluna, senao ela nao prova nada',
    );
    assert.ok(
      !PREDICADO_DO_TUTOR.test(operadorErrado.sql),
      `uma conferencia que so procurasse o NOME aprovaria isto: ${operadorErrado.sql}`,
    );
  });

  void it('coluna e operador certos com o VALOR errado sao acusados', () => {
    const valorErrado = semBanco
      .selectFrom('pet_transfers')
      .select('id')
      .where('id', '=', DONO)
      .where('from_user_id', '=', TRANSFER)
      .compile();

    assert.ok(
      valorErrado.parameters.includes(DONO),
      'a isca precisa ter o dono entre os parametros, senao ela nao prova o ponto',
    );
    assert.notEqual(
      ligadoAo(PREDICADO_DO_TUTOR, valorErrado),
      DONO,
      'uma conferencia por lista de parametros aprovaria esta consulta, que autoriza contra ' +
        `o id da transferencia: ${valorErrado.sql}`,
    );
  });

  void it('no UPDATE de troca de dono, o valor errado e acusado mesmo com o dono no SET', () => {
    // A versao que a consumacao de verdade torna possivel: `owner_user_id`
    // aparece no `SET`, entao o nome esta no SQL e o valor esta nos parametros,
    // e mesmo assim o `WHERE` nao autoriza nada.
    const updateErrado = semBanco
      .updateTable('pets')
      .set({ owner_user_id: DONO })
      .where('id', '=', PET)
      .compile();

    assert.ok(
      updateErrado.sql.includes('"owner_user_id"'),
      'a isca precisa mencionar a coluna, senao ela nao prova o ponto',
    );
    assert.ok(updateErrado.parameters.includes(DONO));
    assert.ok(
      !PREDICADO_DO_DONO_DO_PET.test(updateErrado.sql.slice(updateErrado.sql.indexOf('where'))),
      'uma conferencia que procurasse a coluna no SQL INTEIRO aprovaria este UPDATE, que ' +
        `troca o dono de qualquer pet: ${updateErrado.sql}`,
    );
  });
});
