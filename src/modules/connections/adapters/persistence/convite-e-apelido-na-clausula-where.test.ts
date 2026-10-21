/**
 * As ISCAS de SQL do **convite** e do **alvo por apelido**: os predicados estão
 * na cláusula `WHERE`, e são os **mesmos** nas duas resoluções.
 *
 * ## Por que medir o SQL, e não só o comportamento
 *
 * Porque a afirmação do ADR-0021 é sobre a FORMA da consulta, e porque a
 * indistinguibilidade é uma propriedade de **custo** além de uma de resposta. Um
 * caso de comportamento mede o que uma chamada devolveu; o que precisa valer é
 * que **não existe** ramo neste arquivo que faça um dos casos custar diferente
 * do outro — e isso se lê no SQL compilado.
 *
 * A suíte não tem banco: o `DummyDriver` compila e devolve o texto.
 *
 * ## A IGUALDADE DOS PREDICADOS NÃO É MEDIDA AQUI, E O MOTIVO É A FRONTEIRA
 *
 * `construtorDoAlvoPorApelido` tem de cobrar os **mesmos seis** predicados que
 * `construtorDoPerfilPorApelido`, que é de **outro módulo** (`people`) — e um
 * módulo só enxerga `ports/` de outro (`src/architecture.rules.mjs`). Comparar
 * os dois SQL aqui faria `connections` importar `people/adapters/`, que a regra
 * proíbe com razão.
 *
 * Por isso essa comparação mora em **`src/tools/pedido-por-apelido-cobra-o-mesmo-que-o-perfil.test.ts`**,
 * fora de `src/modules` — é onde os outros portões que atravessam módulo já
 * vivem. Ela importa porque, se os dois conjuntos divergirem, abre-se um dos
 * dois buracos, e os dois são ruins:
 *
 * - a busca/perfil mostra alguém a quem o pedido não chega — a pessoa vê um
 *   botão que só pode falhar;
 * - **o pedido chega a quem a busca esconde** — e aí o 404 do perfil passa a ser
 *   contornável por `POST /connections`, que é a porta de trás que a decisão de
 *   18/10 temia, reaberta por descuido em vez de por decisão.
 *
 * ## O que estes casos NÃO provam, e está dito em voz alta
 *
 * Que o Postgres se comporta como o texto diz. `conta_habilitada`,
 * `bloqueio_entre` e `perfil_ocultado_para_quem_denunciou` são funções SQL das
 * migrações `20261017000013`, `20261018000031` e `20261018000032`, e o que elas
 * fazem é medido onde elas moram. Aqui se prova que esta camada as CHAMA, no
 * `WHERE`, nas duas resoluções — que é a metade que um refator quebra.
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
import { construtorDoAlvoPorApelido, construtorDoConvitePorToken } from './kysely-convites.js';

const QUEM_CHAMA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const APELIDO = 'ana-do-bairro';
const TOKEN = 'um-token-de-convite-qualquer';
const AGORA = 1_800_000_000_000 as Instant;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const sqlDoApelido = (): string =>
  construtorDoAlvoPorApelido(semBanco, APELIDO, QUEM_CHAMA).sql;

/**
 * A LISTA DE SELEÇÃO da consulta — o que de fato sai dela.
 *
 * ## O CORTE É NO `FROM` DE TOPO, E NÃO NO PRIMEIRO ` from `
 *
 * A primeira versão cortava em `indexOf(' from ')` cru e não conferia nada. As
 * asserções deste recorte são todas NEGATIVAS (`!selecao.includes(...)`), e é
 * essa combinação que torna o corte cru perigoso: **um portão que varre menos
 * do que diz passa por não achar nada.**
 *
 * Hoje este SQL tem UM ` from ` só — foi medido em 21/10/2026, e por isso o
 * corte cru ainda dava a resposta certa. Ele estava a uma subconsulta de
 * distância de parar de dar: bastaria um `(select count(*) from pets ...) as
 * "pets_count"` na lista de seleção para o corte cair DENTRO dela, e aí tudo o
 * que fosse selecionado depois — `public_key`, `display_name`, foto — ficaria
 * invisível para as asserções, **passando verde**.
 *
 * É o mesmo defeito que `busca-nao-e-oraculo.test.ts` pagou e consertou no
 * mesmo dia, e o que o caso irmão do perfil (`people`) já documentava: *"a
 * primeira versão deste caso contava quatro e reprovava a consulta correta"*.
 *
 * `from "handles"` é o `FROM` de topo e ele é único no SQL: a resolução por
 * apelido parte de `handles` e junta `users`.
 *
 * **E ele REPROVA se não achar o ponto de corte.** Corte que não encontra o
 * marcador vira varredura cega e silenciosa — que é a lição inteira.
 */
function selecaoDa(sql: string): string {
  const corte = sql.toLowerCase().indexOf(' from "handles"');
  assert.ok(
    corte > 0,
    'nao achei o `FROM` de topo (` from "handles"`) neste SQL. Sem ele este ' +
      'ajudante nao sabe onde a lista de selecao termina, e um portao que corta ' +
      `no lugar errado varre menos do que diz. SQL: ${sql}`,
  );
  return sql.slice(0, corte);
}
const sqlDoConvite = (): string =>
  construtorDoConvitePorToken(semBanco, TOKEN, QUEM_CHAMA, AGORA).sql;

// ---------------------------------------------------------------------------
// AS ISCAS DO PRÓPRIO RECORTE — AS DUAS DIREÇÕES
// ---------------------------------------------------------------------------
//
// O recorte é o que decide o ALCANCE das asserções negativas acima. Se ele
// corta no lugar errado, elas continuam verdes sem olhar para nada — e essa é
// a forma de defeito que não dá sinal nenhum.
//
// A direção que REPROVA é obrigatória: sem ela, trocar o `assert.ok` por um
// `return ''` deixaria este arquivo inteiro verde.
void describe('o recorte da lista de selecao', () => {
  void it('REPROVA quando o `FROM` de topo nao esta no SQL', () => {
    // Corte que não acha o marcador vira varredura cega. Ele tem de gritar.
    assert.throws(
      () => selecaoDa('select "u"."id" as "user_id" from "outra_tabela" as "o"'),
      /FROM` de topo/,
      'o recorte ACEITOU um SQL sem o marcador. A partir daí ele devolveria um ' +
        'trecho arbitrário e as asserções negativas passariam sem varrer nada.',
    );
  });

  void it('corta DEPOIS da lista inteira, mesmo com subconsulta antes do topo', () => {
    // A isca do cego, na direção que importa: um ` from ` de SUBCONSULTA antes
    // do `FROM` de topo não pode encurtar o recorte. Com o corte cru antigo,
    // `public_key` cairia fora e um vazamento passaria verde.
    const comSubconsulta =
      'select "u"."id" as "user_id", ' +
      '(select count(*) from "pets" as "p" where "p"."owner" = "u"."id") as "pets_count", ' +
      '"u"."public_key" as "public_key" ' +
      'from "handles" as "h" inner join "users" as "u" on "u"."id" = "h"."user_id"';
    const selecao = selecaoDa(comSubconsulta);
    assert.ok(
      selecao.includes('public_key'),
      'o recorte parou na subconsulta: tudo o que e selecionado DEPOIS dela ' +
        'ficou invisivel para as assercoes negativas, que e exatamente como ' +
        'uma coluna proibida acrescentada no fim passa verde.',
    );
    assert.ok(
      selecao.includes('pets_count'),
      'o recorte perdeu a propria subconsulta',
    );
  });
});

void describe('o alvo por apelido cobra os SEIS predicados na clausula WHERE', () => {
  void it('ISCA -- nega conta desabilitada nos DOIS lados', () => {
    const sql = sqlDoApelido();
    assert.match(sql, /conta_habilitada\("?u"?\."?id"?\)/, 'o lado do ALVO saiu do WHERE');
    assert.match(
      sql,
      /conta_habilitada\(\$\d+::uuid\)/,
      'o lado de QUEM PEDE saiu do WHERE. Ele parece redundante -- quem chama esta ' +
        'autenticado --, e nao e: quem desabilitou a propria conta continua com token ' +
        'valido ate ele vencer, e sem este predicado continuaria pedindo conexao.',
    );
  });

  void it('ISCA -- nega `bloqueio_entre` com quem pede, e e SIMETRICO', () => {
    assert.match(
      sqlDoApelido(),
      /not\s+bloqueio_entre\(/i,
      'sem este predicado, pedir conexao por apelido alcanca quem te bloqueou -- e o ' +
        'bloqueio existe exatamente para impedir esse toque.',
    );
  });

  void it('ISCA -- nega o perfil que quem pede DENUNCIOU', () => {
    assert.match(
      sqlDoApelido(),
      /not\s+perfil_ocultado_para_quem_denunciou\(/i,
      'quem denunciou um perfil nao volta a ve-lo ("Voce nao vai mais ver este ' +
        'conteudo"), e pedir conexao a ele desfaria a promessa.',
    );
  });

  void it('ISCA -- apelido de PET e apelido RESERVADO nao resolvem', () => {
    assert.match(
      sqlDoApelido(),
      /"?kind"?\s*=\s*\$\d+/,
      'o espaco de nomes e compartilhado entre pessoa, pet e reservado ' +
        '(`20261018000021`). Sem `kind = pessoa`, pedir conexao a `@bidu` resolveria ' +
        'para o tutor do pet -- ou viraria um oraculo de "este apelido existe e e de um pet".',
    );
  });

  void it('ISCA -- SO `u.id` sai no SELECT: nada de nome, `public_ref` ou foto', () => {
    const selecao = selecaoDa(sqlDoApelido());
    for (const proibido of ['public_ref', 'display_name', 'thumb_key', 'public_key', 'handle']) {
      assert.ok(
        !selecao.includes(proibido),
        `\`${proibido}\` esta no SELECT desta consulta. Ela existe para resolver UM alvo; ` +
          'material de resposta aqui e material de que um oraculo se faz.',
      );
    }
    assert.match(selecao, /"?u"?\."?id"?/, '`u.id` tem de sair: e o alvo da aresta');
  });
});

void describe('o convite por token cobra os predicados dele na clausula WHERE', () => {
  void it('ISCA -- convite REVOGADO nao resolve', () => {
    assert.match(
      sqlDoConvite(),
      /"?revoked_at"?\s+is\s+null/i,
      'sem este predicado, revogar nao revoga nada -- e revogar e o unico remedio ' +
        'para um link que vazou para o grupo errado.',
    );
  });

  void it('ISCA -- convite VENCIDO nao resolve', () => {
    assert.match(
      sqlDoConvite(),
      /"?expires_at"?\s*>\s*\$\d+::timestamptz/i,
      'sem este predicado o prazo de 30 dias nao existe, e o link colado num grupo ' +
        'vira endereco publico permanente -- exatamente o que o plano 4-B.1 matou.',
    );
  });

  void it('ISCA -- o `::timestamptz` e explicito (o defeito medido em 18/10/2026)', () => {
    assert.match(
      sqlDoConvite(),
      /::timestamptz/,
      'sem o molde, o Postgres nao infere o tipo do parametro e resolve a comparacao ' +
        'como `interval`, reprovando com "operator does not exist". Nenhum teste de SQL ' +
        'compilado acusaria isso -- e por isso o molde e conferido AQUI, no texto.',
    );
  });

  void it('ISCA -- nega conta desabilitada nos DOIS lados e `bloqueio_entre`', () => {
    const sql = sqlDoConvite();
    assert.match(sql, /conta_habilitada\("?u"?\."?id"?\)/);
    assert.match(sql, /conta_habilitada\(\$\d+::uuid\)/);
    assert.match(
      sql,
      /not\s+bloqueio_entre\(/i,
      'um convite emitido ANTES do bloqueio e resgatado DEPOIS e o furo que ' +
        '`leitor-de-bloqueio.ts` chama de "o futuro", e e aqui que ele fecha.',
    );
  });

  void it('ISCA -- o token entra como RESUMO e nunca em claro', () => {
    const { sql, parameters } = construtorDoConvitePorToken(
      semBanco,
      TOKEN,
      QUEM_CHAMA,
      AGORA,
    );
    assert.ok(
      !sql.includes(TOKEN),
      'o token em claro esta no TEXTO do SQL, e texto de SQL vai para log de consulta lenta',
    );
    const emClaro = parameters.some((p) => typeof p === 'string' && p.includes(TOKEN));
    assert.ok(
      !emClaro,
      'o token em claro esta nos PARAMETROS. O banco guarda os 32 bytes do SHA-256 ' +
        '(`connection_invites.token_hash`), e a comparacao e sobre o resumo.',
    );
    // `Buffer.isBuffer` ja estreita o tipo, entao um `as Buffer` aqui seria a
    // documentacao falsa que a regra `no-unnecessary-type-assertion` recusa.
    const resumo = parameters.find((p) => Buffer.isBuffer(p));
    assert.equal(
      resumo?.length,
      32,
      'o parametro do token tem de ser o Buffer de 32 BYTES do resumo. 44 seria o texto ' +
        'base64 dele, que e o defeito que a `20261020000008` existiu para consertar.',
    );
  });

  void it('convite de dono SEM APELIDO nao resolve: e `INNER JOIN handles`, nao `LEFT`', () => {
    const sql = sqlDoConvite().toLowerCase();
    assert.ok(
      sql.includes('inner join "handles"') || /join\s+"handles"/.test(sql),
      'handles tem de entrar na consulta: o convite resolve para um APELIDO, que e o ' +
        'endereco da pagina de destino.',
    );
    assert.ok(
      !sql.includes('left join "handles"'),
      'com `LEFT JOIN` o apelido viria nulo e a borda teria de decidir o que fazer com ' +
        'isso -- um ramo a mais onde a resolucao promete nao ter nenhum. Quem nao tem ' +
        'apelido nao tem pagina (`PersonProfile.handle` nao e anulavel).',
    );
  });
});
