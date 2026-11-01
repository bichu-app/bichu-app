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

void describe('o recorte da lista de selecao', () => {
  void it('REPROVA quando o `FROM` de topo nao esta no SQL', () => {
    assert.throws(
      () => selecaoDa('select "u"."id" as "user_id" from "outra_tabela" as "o"'),
      /FROM` de topo/,
      'o recorte ACEITOU um SQL sem o marcador. A partir daí ele devolveria um ' +
        'trecho arbitrário e as asserções negativas passariam sem varrer nada.',
    );
  });

  void it('corta DEPOIS da lista inteira, mesmo com subconsulta antes do topo', () => {
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
