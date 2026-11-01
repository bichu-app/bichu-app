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
import type { UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaVitrineDeConexao,
  construtorDoPerfilPorApelido,
} from './kysely-perfil-de-pessoa.js';

const QUEM_OLHA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const MARINA = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const APELIDO = 'marina-vet';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const TODAS = {
  perfil: () => construtorDoPerfilPorApelido(semBanco, APELIDO, QUEM_OLHA),
  vitrine: () => construtorDaVitrineDeConexao(semBanco, MARINA, QUEM_OLHA),
} as const;

const sqlDo = (nome: keyof typeof TODAS): string => TODAS[nome]().sql;

function selecaoAteOTopo(sql: string, marcadorDeTopo: string): string {
  const corte = sql.toLowerCase().indexOf(marcadorDeTopo);
  assert.ok(
    corte > 0,
    `nao achei o \`FROM\` de topo (\`${marcadorDeTopo}\`) neste SQL. Sem ele o ` +
      'corte nao sabe onde a lista de selecao termina, e um portao que corta no ' +
      `lugar errado varre menos -- ou mais -- do que diz. SQL: ${sql}`,
  );
  return sql.slice(0, corte);
}

void describe('o corte da lista de selecao', () => {
  void it('REPROVA quando o marcador de topo nao esta no SQL', () => {
    assert.throws(
      () => selecaoAteOTopo('select "u"."id" from "outra" as "o"', ' from "handles"'),
      /FROM` de topo/,
    );
  });

  void it('nao para na subconsulta: conta a lista INTEIRA', () => {
    const selecao = selecaoAteOTopo(
      'select "u"."id" as "id", ' +
        '(select count(*) from "pets") as "pets_count", ' +
        '"u"."display_name" as "display_name" ' +
        'from "handles" as "h"',
      ' from "handles"',
    );
    assert.equal(
      (selecao.match(/ as "/g) ?? []).length,
      3,
      'o corte parou na subconsulta: o que vem DEPOIS dela ficou invisivel, e e ' +
        'assim que uma coluna acrescentada no fim passa verde.',
    );
  });
});

void describe('a autorizacao do perfil de outra pessoa mora na clausula WHERE', () => {

  void it('ISCA (d) -- a leitura do perfil nega conta desabilitada nos DOIS lados', () => {
    const sql = sqlDo('perfil');
    assert.match(sql, /conta_habilitada\("?u"?\."?id"?\)/, 'o lado de quem e olhado saiu do WHERE');
    assert.match(
      sql,
      /conta_habilitada\(\$\d+::uuid\)/,
      'o lado de QUEM OLHA saiu do WHERE: `conta_habilitada` entra nos dois lados de toda leitura desta casa',
    );
  });

  void it('ISCA (d) -- a leitura do perfil nega `bloqueio_entre` com quem olha', () => {
    assert.match(
      sqlDo('perfil'),
      /NOT bloqueio_entre\("?u"?\."?id"?, \$\d+::uuid\)/,
      'sem este predicado, quem foi bloqueado continua lendo o perfil de quem o bloqueou',
    );
  });

  void it('ISCA (d) -- a leitura do perfil nega o perfil que quem olha DENUNCIOU', () => {
    assert.match(
      sqlDo('perfil'),
      /NOT perfil_ocultado_para_quem_denunciou\("?u"?\."?public_ref"?, \$\d+::uuid\)/,
      'a ocultacao imediata e o que faz a denuncia valer sem prazo prometido: a tela promete "Voce nao vai mais ver este conteudo"',
    );
  });

  void it('ISCA (d) -- apelido de PET e apelido RESERVADO nao sao perfil: `kind = pessoa` no WHERE', () => {
    assert.match(sqlDo('perfil'), /"?h"?\."?kind"? = \$\d+/);
    const { parameters } = TODAS.perfil();
    assert.ok(
      parameters.includes('pessoa'),
      'o valor do predicado tem de ser `pessoa`, e nao um parametro que alguem passe de fora',
    );
  });

  void it('ISCA (d) -- NENHUMA das duas consultas tem ramo, `CASE` ou `UNION` que escolha visibilidade', () => {
    for (const nome of Object.keys(TODAS) as (keyof typeof TODAS)[]) {
      const sql = sqlDo(nome);
      assert.ok(!/\bUNION\b/i.test(sql), `${nome}: UNION e um segundo ramo de leitura`);
      assert.ok(!/\bCASE\s+WHEN\b/i.test(sql), `${nome}: CASE WHEN no WHERE e o if que o ADR-0021 proibe`);
    }
  });

  void it('ISCA (d) -- quem olha entra como PARAMETRO em toda consulta, nunca interpolado', () => {
    for (const nome of Object.keys(TODAS) as (keyof typeof TODAS)[]) {
      const { sql, parameters } = TODAS[nome]();
      assert.ok(
        !sql.includes(QUEM_OLHA),
        `${nome}: a conta de quem olha foi INTERPOLADA no texto do SQL em vez de ir como parametro`,
      );
      assert.ok(parameters.includes(QUEM_OLHA), `${nome}: quem olha nao chegou como parametro`);
    }
  });

  void it('ISCA (c) -- a leitura do perfil conta pets e NAO seleciona nome, slug nem foto de pet', () => {
    const sql = sqlDo('perfil');
    assert.match(
      sql,
      /select count\(\*\) from pets p\s+where p\.owner_user_id = u\.id and p\.deleted_at is null/i,
      'a contagem saiu da consulta: e ela, e so ela, que a emenda 2 do ADR-0010 liberou',
    );
    for (const coluna of [
      'p.name',
      'p.slug',
      'p.species_code',
      'p.breed_code',
      'p.birth_date_approx',
      'p.care_notes',
      'p.microchip_number',
      'pet_photos',
      'p.public_profile_enabled',
    ]) {
      assert.ok(
        !sql.includes(coluna),
        `\`${coluna}\` entrou na consulta do perfil: o item 7 do ADR-0010 continua valendo para tudo que nao e a contagem`,
      );
    }
  });

  void it('ISCA (c) -- a contagem e SUBCONSULTA e nao juncao: `pets` nao entra no escopo do SELECT', () => {
    const sql = sqlDo('perfil');
    assert.ok(!/join\s+"?pets"?/i.test(sql), 'a consulta do perfil passou a JUNTAR `pets`');
    assert.ok(!/group by/i.test(sql), '`GROUP BY` aqui significa que a contagem virou agregacao da junção');
  });

  const semAsColunasDoSelo = (sql: string): string =>
    sql.replaceAll('email_verified_at', 'selo_de_validado').replaceAll('phone_verified_at', 'selo_de_validado');

  void it('ISCA (c) -- a leitura do perfil nao seleciona endereco, telefone, e-mail nem nascimento', () => {
    const sql = semAsColunasDoSelo(sqlDo('perfil'));
    for (const coluna of [
      'phone_e164',
      'email',
      'birth_date',
      'postal_code',
      'city',
      'neighbourhood',
      'location',
      'last_location',
      'lat',
      'lon',
    ]) {
      assert.ok(!sql.includes(coluna), `\`${coluna}\` entrou na leitura do perfil de outra pessoa`);
    }
  });

  void it('ISCA (c) -- a MUTACAO reprova: `u.email` cru na lista de selecao', () => {
    const comOEndereco = sqlDo('perfil').replace(
      '"u"."display_name" as "display_name"',
      '"u"."email" as "display_name"',
    );
    assert.notEqual(
      comOEndereco,
      sqlDo('perfil'),
      'a mutacao nao foi aplicada: o alias de `display_name` mudou e este caso ficou cego',
    );
    assert.ok(
      semAsColunasDoSelo(comOEndereco).includes('"u"."email"'),
      'a subtracao das colunas do selo passou a engolir `u.email` cru: a varredura de ' +
        'endereco ficou cega, e o e-mail de outra pessoa sairia no perfil',
    );
  });

  void it('EMENDA 21/10 -- o SELO DE VALIDADO e DERIVADO no SQL, e sai so como booleano', () => {
    const sql = sqlDo('perfil');
    assert.match(
      sql,
      /\(u\.email_verified_at IS NOT NULL OR u\.phone_verified_at IS NOT NULL\) as "canal_verificado"/i,
      'o selo de validado nao e a regua unica, ou deixou de ser derivado no SQL',
    );
    assert.ok(
      !/"?u"?\."?email_verified_at"? as /i.test(sql),
      'a DATA de confirmacao de e-mail entrou na lista de selecao do perfil',
    );
    assert.ok(
      !/"?u"?\."?phone_verified_at"? as /i.test(sql),
      'a DATA de confirmacao de telefone entrou na lista de selecao do perfil',
    );
    assert.ok(
      !sqlDo('vitrine').includes('email_verified_at'),
      'a consulta da vitrine passou a derivar o selo: ele sai do perfil, uma vez',
    );
  });

  void it('ISCA (a) -- a leitura do perfil NAO alcanca a vitrine: nenhuma das duas derivadas', () => {
    const sql = sqlDo('perfil');
    for (const agulha of ['user_showcase_images', 'catalog_images', 'thumb_key', 'public_key', 'banner_key']) {
      assert.ok(
        !sql.includes(agulha),
        `\`${agulha}\` entrou na consulta do PERFIL: a vitrine tem consulta propria justamente para o predicado de conexao nao poder ser esquecido`,
      );
    }
  });

  void it('ISCA (a) -- a consulta da vitrine exige CONEXAO ACEITA no WHERE, nos dois sentidos do par', () => {
    const sql = sqlDo('vitrine');
    assert.match(sql, /exists \(/i, 'o predicado de conexao saiu do WHERE da consulta das fotos');
    assert.match(sql, /from user_connections uc/i);
    assert.match(sql, /uc\.state = 'accepted'/, "pendente nao e aceite: sem aceite nao ha dado de conectado");
    assert.match(
      sql,
      /uc\.requester_user_id = \$\d+::uuid and uc\.addressee_user_id = \$\d+::uuid/i,
      'um sentido do par saiu do predicado',
    );
    assert.match(
      sql,
      /or \(uc\.requester_user_id = \$\d+::uuid and uc\.addressee_user_id = \$\d+::uuid\)/i,
      'o OUTRO sentido do par saiu: a conexao e simetrica, e quem pediu nao decide quem ve',
    );
    assert.match(
      sql,
      /conta_habilitada\(uc\.requester_user_id\)[\s\S]*conta_habilitada\(uc\.addressee_user_id\)/,
      'as duas pontas da aresta precisam estar habilitadas',
    );
  });

  void it('ISCA (a) -- a consulta da vitrine nega bloqueio e nega foto DENUNCIADA por quem olha', () => {
    const sql = sqlDo('vitrine');
    assert.match(
      sql,
      /NOT bloqueio_entre\(\$\d+::uuid, \$\d+::uuid\)/,
      'bloquear desfaz a conexao na mesma transacao, e este predicado cobre a corrida entre as duas escritas',
    );
    assert.match(
      sql,
      /NOT foto_ocultada_para_quem_denunciou\("?c"?\."?public_key"?, \$\d+::uuid\)/,
      'a ocultacao e por ARTEFATO: quem denunciou uma foto nao volta a ve-la, mesmo continuando conexao de quem a publicou',
    );
  });

  void it('ISCA (a) -- so foto `ready` com as DUAS derivadas sai para terceiro', () => {
    const sql = sqlDo('vitrine');
    assert.match(sql, /"?c"?\."?status"? = \$\d+/);
    assert.ok(
      TODAS.vitrine().parameters.includes('ready'),
      'foto em `processing` carrega o EXIF do celular, e servi-la entregaria a coordenada de onde ela foi tirada (ADR-0010 item 4)',
    );
    assert.match(sql, /c\.thumb_key IS NOT NULL/);
    assert.match(sql, /c\.public_key IS NOT NULL/);
  });

  void it('ISCA (a) -- a vitrine de terceiro NAO seleciona estado de moderacao, posicao nem envio', () => {
    const sql = sqlDo('vitrine');
    for (const coluna of ['rejection_reason', 'upload_intent_id', 'c.status as', 'v.position as']) {
      assert.ok(
        !sql.includes(coluna),
        `\`${coluna}\` saiu na vitrine de outra pessoa: motivo de recusa e assunto entre o dono e quem modera, e posicao e de edicao`,
      );
    }
    assert.match(sql, /order by "?v"?\."?position"? asc/i);
  });

  void it('ISCA (a) -- a vitrine confere o PROPOSITO: capa de encontro nao vira foto de perfil', () => {
    assert.match(sqlDo('vitrine'), /"?c"?\."?purpose"? = \$\d+/);
    assert.ok(TODAS.vitrine().parameters.includes('user_showcase'));
  });

  void it('CONTRAPESO -- a consulta da vitrine SELECIONA as duas derivadas e o texto alternativo', () => {
    const sql = sqlDo('vitrine');
    assert.match(sql, /"?c"?\."?thumb_key"? as "?grade_key"?/);
    assert.match(sql, /"?c"?\."?public_key"? as "?aberta_key"?/);
    assert.match(sql, /"?v"?\."?alt_text"? as "?alt_text"?/);
    assert.match(sql, /from "?user_showcase_images"? as "?v"?/i);
  });

  void it('CONTRAPESO -- a consulta do perfil SELECIONA o que o cliente liberou, e nada mais', () => {
    const { sql } = TODAS.perfil();
    assert.match(sql, /"?u"?\."?id"? as "?user_id"?/);
    assert.match(sql, /"?h"?\."?handle"? as "?handle"?/);
    assert.match(sql, /"?u"?\."?public_ref"? as "?public_ref"?/);
    assert.match(sql, /"?u"?\."?display_name"? as "?display_name"?/);
    assert.match(sql, /as "?pets_count"?/);
    assert.match(sql, /as "?canal_verificado"?/);
    const listaDeSelecao = selecaoAteOTopo(sql, ' from "handles"');
    assert.equal(
      (listaDeSelecao.match(/ as "/g) ?? []).length,
      6,
      'a lista de selecao do perfil saiu de SEIS colunas: uma a mais e um campo a mais na resposta',
    );
  });
});
