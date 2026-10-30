/**
 * AS ISCAS DE SQL DO MURAL: **o recorte de visibilidade está no `WHERE`, e o que
 * não pode sair não está no `SELECT`.**
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
  construtorDaLinhaDoTempo,
  construtorDaPublicacaoVisivel,
  construtorDasMinhasPublicacoes,
  construtorDoApagar,
  construtorDoApagarComentario,
  construtorDosComentarios,
} from './kysely-publicacoes.js';

const QUEM_OLHA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = 1_792_000_000_000 as Instant;
const REF = 'AaBbCcDdEeFfGgHhIiJjKk';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const RECORTE = { limite: 20, curso: undefined } as const;

/** As TRÊS consultas desta camada, para varrer em lote. */
const ID_INTERNO = '018f3a2b-0000-7000-8000-0000000000cc';

/** As SEIS consultas desta camada, para varrer em lote. */
const TODAS = {
  minhas: () => construtorDasMinhasPublicacoes(semBanco, QUEM_OLHA, RECORTE),
  linha: () => construtorDaLinhaDoTempo(semBanco, QUEM_OLHA, RECORTE),
  apagar: () => construtorDoApagar(semBanco, QUEM_OLHA, REF, AGORA),
  alvo: () => construtorDaPublicacaoVisivel(semBanco, REF, QUEM_OLHA),
  comentarios: () => construtorDosComentarios(semBanco, ID_INTERNO, QUEM_OLHA, RECORTE),
  apagarComentario: () =>
    construtorDoApagarComentario(semBanco, QUEM_OLHA, ID_INTERNO, REF, AGORA),
} as const;

const sqlDo = (nome: keyof typeof TODAS): string => TODAS[nome]().sql;

/** As conferências de predicado, cada uma uma função sobre o TEXTO do SQL. */
const CONFERENCIAS = {
  exigeAceite: (sql: string) => {
    assert.match(sql, /uc\.state = 'accepted'/, 'o predicado de ACEITE saiu do WHERE');
  },
  exigeOsDoisSentidosDoPar: (sql: string) => {
    assert.match(
      sql,
      /uc\.requester_user_id = p\.author_user_id AND uc\.addressee_user_id = \$\d+::uuid/,
      'um sentido do par saiu do predicado',
    );
    assert.match(
      sql,
      /uc\.requester_user_id = \$\d+::uuid AND uc\.addressee_user_id = p\.author_user_id/,
      'o OUTRO sentido do par saiu: a conexao e simetrica, e quem pediu nao decide quem ve',
    );
  },
  exigeContaHabilitadaNasDuasPontas: (sql: string) => {
    assert.match(
      sql,
      /conta_habilitada\(uc\.requester_user_id\)[\s\S]*conta_habilitada\(uc\.addressee_user_id\)/,
      'as duas pontas da aresta precisam estar habilitadas',
    );
  },
  negaBloqueio: (sql: string) => {
    assert.match(
      sql,
      /NOT bloqueio_entre\(p\.author_user_id, \$\d+::uuid\)/,
      'bloquear desfaz a conexao, mas sao duas escritas, e este predicado cobre a corrida entre elas',
    );
  },
  negaOQueQuemOlhaDenunciou: (sql: string) => {
    assert.match(
      sql,
      /NOT publicacao_ocultada_para_quem_denunciou\(p\.public_ref, \$\d+::uuid\)/,
      'a ocultacao e por ARTEFATO: quem denunciou uma publicacao nao volta a ve-la',
    );
  },
  negaApagada: (sql: string) => {
    assert.match(
      sql,
      /(?:"p"\.)?"deleted_at" is null/i,
      'publicacao apagada continua saindo',
    );
  },
} as const;

/** Reprova se `conferencia` NÃO lançar sobre `textoMutado`. */
function aMutacaoTemDeReprovar(
  conferencia: (sql: string) => void,
  textoMutado: string,
  queixa: string,
): void {
  assert.throws(() => conferencia(textoMutado), queixa);
}

/** A LISTA DE SELECAO, cortada no `FROM` de topo -- e REPROVANDO se nao o achar. */
function selecaoAteOTopo(sql: string): string {
  const corte = sql.toLowerCase().indexOf(' from "user_publications"');
  assert.ok(
    corte > 0,
    'nao achei o `FROM` de topo (` from "user_publications"`) neste SQL. Sem ele ' +
      'o corte nao sabe onde a lista de selecao termina, e um portao que corta no ' +
      `lugar errado varre menos -- ou mais -- do que diz. SQL: ${sql}`,
  );
  return sql.slice(0, corte);
}

void describe('o corte da lista de selecao', () => {
  void it('REPROVA quando o `FROM` de topo nao esta no SQL', () => {
    assert.throws(
      () => selecaoAteOTopo('select "p"."id" as "id" from "outra" as "o"'),
      /FROM` de topo/,
    );
  });

  void it('nao para no `FROM` da subconsulta: conta a lista INTEIRA', () => {
    const selecao = selecaoAteOTopo(
      'select "p"."id" as "id", ' +
        '(select count(*) from "user_connections") as "n", ' +
        '"p"."ref" as "ref" ' +
        'from "user_publications" as "p"',
    );
    assert.equal(
      (selecao.match(/ as "/g) ?? []).length,
      3,
      'o corte parou na subconsulta: o que vem DEPOIS dela ficou invisivel, e e ' +
        'assim que uma coluna acrescentada no fim passa verde.',
    );
  });
});

void describe('o recorte da LINHA DO TEMPO mora na clausula WHERE', () => {
  void it('ISCA (b) -- exige CONEXAO ACEITA, nos DOIS sentidos do par', () => {
    const sql = sqlDo('linha');
    assert.match(sql, /exists \(/i, 'o predicado de conexao saiu do WHERE');
    assert.match(sql, /from user_connections uc/i);
    CONFERENCIAS.exigeAceite(sql);
    CONFERENCIAS.exigeOsDoisSentidosDoPar(sql);
    CONFERENCIAS.exigeContaHabilitadaNasDuasPontas(sql);
  });

  void it('ISCA (b) -- a MUTACAO reprova: `pending` no lugar de `accepted`', () => {
    aMutacaoTemDeReprovar(
      CONFERENCIAS.exigeAceite,
      sqlDo('linha').replace("uc.state = 'accepted'", "uc.state = 'pending'"),
      'a conferencia de ACEITE nao enxerga `pending` no lugar dele: ela nao mede nada',
    );
  });

  void it('ISCA (b) -- a MUTACAO reprova: UM sentido do par removido', () => {
    const mutado = sqlDo('linha').replace(
      /OR \(uc\.requester_user_id = \$\d+::uuid AND uc\.addressee_user_id = p\.author_user_id\)/,
      '',
    );
    aMutacaoTemDeReprovar(
      CONFERENCIAS.exigeOsDoisSentidosDoPar,
      mutado,
      'a conferencia nao enxerga a falta de um sentido do par: quem pediu passaria a decidir quem ve',
    );
  });

  void it('ISCA (b) -- a MUTACAO reprova: `conta_habilitada` de UMA ponta removida', () => {
    aMutacaoTemDeReprovar(
      CONFERENCIAS.exigeContaHabilitadaNasDuasPontas,
      sqlDo('linha').replace('conta_habilitada(uc.addressee_user_id)', 'true'),
      'a conferencia nao enxerga a ponta desabilitada',
    );
  });

  void it('ISCA (b) -- nega bloqueio, e a MUTACAO sem `NOT` reprova', () => {
    const sql = sqlDo('linha');
    CONFERENCIAS.negaBloqueio(sql);
    aMutacaoTemDeReprovar(
      CONFERENCIAS.negaBloqueio,
      sql.replace('NOT bloqueio_entre', 'bloqueio_entre'),
      'a conferencia nao enxerga o `NOT` ausente -- ela passaria num mundo em que SO o bloqueado ve',
    );
  });

  void it('ISCA (b) -- nega publicacao DENUNCIADA por quem olha, e a MUTACAO reprova', () => {
    const sql = sqlDo('linha');
    CONFERENCIAS.negaOQueQuemOlhaDenunciou(sql);
    aMutacaoTemDeReprovar(
      CONFERENCIAS.negaOQueQuemOlhaDenunciou,
      sql.replace(/NOT publicacao_ocultada_para_quem_denunciou\([^)]*\)/, 'true'),
      'a conferencia nao enxerga a ocultacao removida',
    );
  });

  void it('ISCA (c) -- publicacao de quem NAO tem relacao nenhuma nao tem ramo que a alcance', () => {
    const sql = sqlDo('linha');
    assert.ok(!/\bUNION\b/i.test(sql), 'UNION e um segundo ramo de leitura');
    assert.ok(!/\bCASE\s+WHEN\b/i.test(sql), 'CASE WHEN e o `if` que o ADR-0021 proibe');
    for (const inventada of ['visibility', 'is_public', 'audience', 'privacy']) {
      assert.ok(!sql.includes(inventada), `\`${inventada}\` entrou na consulta da linha do tempo`);
    }
  });

  void it('ISCA (f) -- publicacao APAGADA nao sai, nas tres consultas', () => {
    for (const nome of Object.keys(TODAS) as (keyof typeof TODAS)[]) {
      CONFERENCIAS.negaApagada(sqlDo(nome));
    }
  });

  void it('ISCA (f) -- a MUTACAO reprova: `deleted_at IS NULL` removido', () => {
    aMutacaoTemDeReprovar(
      CONFERENCIAS.negaApagada,
      sqlDo('linha').replace(/"?p"?\."?deleted_at"? is null/i, 'true'),
      'a conferencia nao enxerga a exclusao logica removida',
    );
  });

  void it('ISCA (f) -- quem olha entra como PARAMETRO, nunca interpolado, nas tres consultas', () => {
    for (const nome of Object.keys(TODAS) as (keyof typeof TODAS)[]) {
      const { sql, parameters } = TODAS[nome]();
      assert.ok(
        !sql.includes(QUEM_OLHA),
        `${nome}: a conta de quem olha foi INTERPOLADA no texto do SQL em vez de ir como parametro`,
      );
      assert.ok(parameters.includes(QUEM_OLHA), `${nome}: quem olha nao chegou como parametro`);
    }
  });
});

void describe('o que o Mural NAO seleciona, e cada ausencia e uma regra', () => {
  void it('EMENDA 5 -- a linha do tempo LE a foto do autor, e so a `thumb` 176', () => {
    const { sql, parameters } = TODAS.linha();
    assert.match(
      sql,
      /"?fa"?\."?thumb_key"? as "?autor_thumb_key"?/,
      'a foto do autor saiu da consulta: a Emenda 5 a nomeia nesta superficie',
    );
    assert.match(sql, /"?fa"?\."?id"? = "?a"?\."?photo_image_id"?/i);
    assert.ok(
      !/"?fa"?\."?public_key"?/.test(sql),
      'a consulta passou a ler a `card` de 512 da foto do autor: 4,27x mais dado do que o icone pinta',
    );
    assert.ok(parameters.includes('user_photo'), 'o proposito da foto de PESSOA saiu do JOIN (T9)');
    assert.match(sql, /fa\.thumb_key IS NOT NULL/);
  });

  void it('EMENDA 5 -- a MUTACAO reprova: a `card` de 512 no lugar da `thumb`', () => {
    const conferirDerivada = (texto: string): void => {
      assert.match(texto, /"?fa"?\."?thumb_key"? as "?autor_thumb_key"?/);
      assert.ok(!/"?fa"?\."?public_key"?/.test(texto));
    };
    conferirDerivada(sqlDo('linha'));
    aMutacaoTemDeReprovar(
      conferirDerivada,
      sqlDo('linha').replace('"fa"."thumb_key" as "autor_thumb_key"', '"fa"."public_key" as "autor_thumb_key"'),
      'a conferencia nao enxerga a `card` de 512 no lugar da `thumb` de 176',
    );
  });

  void it('EMENDA 5 -- o JOIN da foto NAO tem predicado de conexao, e a ausencia e a regra', () => {
    const sql = sqlDo('linha');
    const inicio = sql.indexOf('left join "catalog_images" as "fa"');
    assert.ok(
      inicio >= 0,
      'o JOIN da foto do autor nao foi achado: o alias `fa` mudou e este caso ficou cego',
    );
    const depois = sql.indexOf(' left join ', inicio + 1);
    const fim = depois > 0 ? depois : sql.indexOf(' where ');
    const joinDaFoto = sql.slice(inicio, fim > inicio ? fim : sql.length);
    assert.ok(
      joinDaFoto.includes('photo_image_id'),
      'o recorte do JOIN da foto nao pegou o JOIN da foto: este caso ficaria cego',
    );
    assert.ok(
      !joinDaFoto.includes('"c"."id"'),
      'o recorte engoliu o JOIN da imagem da PUBLICACAO: o caso mediria os dois juntos',
    );
    assert.ok(
      !joinDaFoto.includes('user_connections'),
      'o JOIN da foto repete o predicado de conexao: ele ja esta no WHERE, e duas copias ' +
        'sao dois lugares onde uma correcao pode faltar',
    );
  });

  void it('EMENDA 5 -- `minhas` continua SEM ler foto de pessoa: item 8 da emenda', () => {
    const sql = sqlDo('minhas');
    assert.ok(
      !sql.includes('photo_image_id'),
      '`GET /me/publications` passou a ler a foto da pessoa: o item 8 da Emenda 5 a mantem fora',
    );
    assert.ok(!sql.includes('thumb_key'), '`minhas` leu a `thumb` da foto de pessoa');
  });

  void it('a linha do tempo NAO alcanca a VITRINE: nem a tabela, nem a derivada da grade', () => {
    const sql = sqlDo('linha');
    for (const agulha of ['user_showcase_images', 'banner_key', 'grid_url']) {
      assert.ok(
        !sql.includes(agulha),
        `\`${agulha}\` entrou na linha do tempo: a vitrine tem consulta propria, e o portao vitrine-nao-sai-para-terceiro a cobra`,
      );
    }
    assert.ok(
      !TODAS.linha().parameters.includes('user_showcase'),
      'a linha do tempo passou a ler imagem com o proposito da VITRINE',
    );
  });

  void it('a linha do tempo NAO alcanca PET em forma nenhuma: item 7 do ADR-0010', () => {
    const sql = sqlDo('linha');
    for (const agulha of ['pets', 'pet_photos', 'species_code', 'breed_code']) {
      assert.ok(
        !sql.includes(agulha),
        `\`${agulha}\` entrou na linha do tempo: ligar publicacao a pet agruparia os pets de um tutor`,
      );
    }
  });

  /** O SQL com as DUAS colunas do selo de validado apagadas. */
  const semAsColunasDoSelo = (sql: string): string =>
    sql.replaceAll('email_verified_at', 'selo_de_validado').replaceAll('phone_verified_at', 'selo_de_validado');

  void it('a linha do tempo NAO le endereco, telefone, e-mail nem nascimento', () => {
    const sql = semAsColunasDoSelo(sqlDo('linha'));
    for (const coluna of [
      'phone_e164',
      'email',
      'birth_date',
      'postal_code',
      'neighbourhood',
      'location',
      'public_ref',
    ]) {
      assert.ok(
        !sql.includes(`"a"."${coluna}"`) && !sql.includes(`a.${coluna}`),
        `\`users.${coluna}\` entrou na linha do tempo`,
      );
    }
  });

  void it('ISCA -- a MUTACAO reprova: `a.email` cru na lista de selecao', () => {
    const comOEndereco = sqlDo('linha').replace(
      '"a"."display_name" as "display_name"',
      '"a"."email" as "display_name"',
    );
    assert.notEqual(
      comOEndereco,
      sqlDo('linha'),
      'a mutacao nao foi aplicada: o alias de `display_name` mudou e este caso ficou cego',
    );
    assert.ok(
      semAsColunasDoSelo(comOEndereco).includes('"a"."email"'),
      'a subtracao das colunas do selo passou a engolir `a.email` cru: a varredura de ' +
        'endereco ficou cega, e o e-mail de outra pessoa sairia na linha do tempo',
    );
  });

  void it('EMENDA 21/10 -- o SELO DE VALIDADO e DERIVADO no SQL, e sai so como booleano', () => {
    for (const nome of ['linha', 'comentarios'] as const) {
      const sql = sqlDo(nome);
      assert.match(
        sql,
        /\(a\.email_verified_at IS NOT NULL OR a\.phone_verified_at IS NOT NULL\) as "canal_verificado"/i,
        `${nome}: o selo de validado nao e a regua unica, ou deixou de ser derivado no SQL`,
      );
      assert.ok(
        !/"?a"?\."?email_verified_at"? as /i.test(sql),
        `${nome}: a DATA de confirmacao entrou na lista de selecao`,
      );
      assert.ok(
        !/"?a"?\."?phone_verified_at"? as /i.test(sql),
        `${nome}: a DATA de confirmacao de telefone entrou na lista de selecao`,
      );
    }
  });

  void it('EMENDA 21/10 -- `minhas` continua SEM o selo: quem le e o proprio autor', () => {
    const sql = sqlDo('minhas');
    assert.ok(
      !sql.includes('email_verified_at'),
      '`GET /me/publications` passou a derivar o selo de validado: o dono o recebe em `Me.email_verified`',
    );
    assert.ok(!sql.includes('canal_verificado'), '`minhas` passou a projetar o selo');
  });

  void it('`minha` e coluna CALCULADA no banco, e nao comparacao na tela', () => {
    assert.match(
      sqlDo('linha'),
      /p\.author_user_id = \$\d+::uuid as "minha"/,
      '`mine` saiu da consulta: o cartao perderia como decidir entre `Apagar` e `Denunciar`',
    );
  });

  void it('so foto `ready` COM derivada entra na linha do tempo', () => {
    const { sql, parameters } = TODAS.linha();
    assert.match(sql, /"?c"?\."?status"? = \$\d+/);
    assert.ok(parameters.includes('ready'));
    assert.match(sql, /c\.public_key IS NOT NULL/);
  });

  void it('as tres consultas conferem o PROPOSITO: capa de encontro nao vira foto de publicacao', () => {
    for (const nome of ['minhas', 'linha'] as const) {
      const { sql, parameters } = TODAS[nome]();
      assert.match(sql, /"?c"?\."?purpose"? = \$\d+/, `${nome}: o proposito saiu do JOIN`);
      assert.ok(
        parameters.includes('user_publication'),
        `${nome}: o valor do proposito nao e \`user_publication\``,
      );
    }
  });
});

void describe('AS MINHAS PUBLICACOES e O APAGAR resolvem pelo AUTOR', () => {
  void it('`minhas` filtra por autor, e NAO depende de conexao nenhuma', () => {
    const sql = sqlDo('minhas');
    assert.match(sql, /"?p"?\."?author_user_id"? = \$\d+/);
    assert.ok(
      !sql.includes('user_connections'),
      'a leitura do proprio dono passou a depender de conexao',
    );
  });

  void it('ISCA (f) -- `apagar` tem o AUTOR na clausula, e por isso 404 e nunca 403', () => {
    const { sql, parameters } = TODAS.apagar();
    assert.match(sql, /update "?user_publications"?/i);
    assert.match(sql, /"?public_ref"? = \$\d+/);
    assert.match(sql, /"?author_user_id"? = \$\d+/);
    assert.match(sql, /"?deleted_at"? is null/i);
    assert.ok(parameters.includes(QUEM_OLHA), 'o autor nao chegou como parametro');
    assert.ok(parameters.includes(REF), 'o endereco nao chegou como parametro');
  });

  void it('ISCA (f) -- a MUTACAO reprova: o autor removido do `apagar`', () => {
    const conferirAutor = (sql: string): void => {
      assert.match(sql, /"?author_user_id"? = \$\d+/);
    };
    conferirAutor(sqlDo('apagar'));
    aMutacaoTemDeReprovar(
      conferirAutor,
      sqlDo('apagar').replace(/"author_user_id" = \$\d+/, 'true'),
      'a conferencia nao enxerga o autor removido: bastaria o endereco para apagar a publicacao de outra pessoa',
    );
  });

  void it('`apagar` e UPDATE e nunca DELETE: a denuncia aponta para a linha', () => {
    const sql = sqlDo('apagar');
    assert.ok(!/^delete/i.test(sql.trim()), 'apagar passou a ser DELETE fisico');
    assert.match(sql, /set "?deleted_at"? = \$\d+/i);
  });
});

void describe('CONTRAPESOS -- sem eles as iscas de omissao passariam no vazio', () => {
  void it('CONTRAPESO -- a linha do tempo SELECIONA o que a resposta precisa', () => {
    const sql = sqlDo('linha');
    assert.match(sql, /"?p"?\."?public_ref"? as "?ref"?/);
    assert.match(sql, /"?p"?\."?body"? as "?body"?/);
    assert.match(sql, /"?p"?\."?created_at"? as "?created_at"?/);
    assert.match(sql, /"?c"?\."?public_key"? as "?public_key"?/);
    assert.match(sql, /"?h"?\."?handle"? as "?handle"?/);
    assert.match(sql, /"?a"?\."?display_name"? as "?display_name"?/);
    assert.match(sql, /from "?user_publications"? as "?p"?/i);
  });

  void it('CONTRAPESO -- o apelido vem de `handles` com `kind = pessoa`', () => {
    const { sql, parameters } = TODAS.linha();
    assert.match(sql, /"?h"?\."?kind"? = \$\d+/);
    assert.ok(parameters.includes('pessoa'));
  });

  void it('CONTRAPESO -- a lista de selecao da linha do tempo tem TREZE colunas, e a lista e FECHADA', () => {
    const { sql } = TODAS.linha();
    const listaDeSelecao = selecaoAteOTopo(sql);
    assert.equal(
      (listaDeSelecao.match(/ as "/g) ?? []).length,
      13,
      'a lista de selecao da linha do tempo saiu de TREZE colunas: uma a mais e um campo a mais na resposta',
    );
  });

  void it('CONTRAPESO -- as duas leituras pedem `limite + 1` e ordenam por (data, ref)', () => {
    for (const nome of ['minhas', 'linha'] as const) {
      const sql = sqlDo(nome);
      assert.match(sql, /order by "?p"?\."?created_at"? desc, "?p"?\."?public_ref"? desc/i, nome);
      assert.match(sql, /limit \$?\d+/i, nome);
      assert.ok(TODAS[nome]().parameters.includes(21), `${nome}: o limite pedido nao e limite + 1`);
    }
  });
});

void describe('CURTIR E COMENTAR -- o recorte e UM, e a contagem sai das LINHAS', () => {
  void it('ISCA -- `construtorDaPublicacaoVisivel` tem o recorte INTEIRO, e as cinco escritas o usam', () => {
    const sql = sqlDo('alvo');
    CONFERENCIAS.exigeAceite(sql);
    CONFERENCIAS.exigeOsDoisSentidosDoPar(sql);
    CONFERENCIAS.exigeContaHabilitadaNasDuasPontas(sql);
    CONFERENCIAS.negaBloqueio(sql);
    CONFERENCIAS.negaOQueQuemOlhaDenunciou(sql);
    CONFERENCIAS.negaApagada(sql);
  });

  void it('ISCA -- a MUTACAO reprova: `pending` no recorte do alvo', () => {
    aMutacaoTemDeReprovar(
      CONFERENCIAS.exigeAceite,
      sqlDo('alvo').replace("uc.state = 'accepted'", "uc.state = 'pending'"),
      'a conferencia do alvo nao mede o aceite: curtir e comentar passariam a alcancar pendente',
    );
  });

  void it('ISCA -- o alvo devolve o `id` INTERNO e NAO o projeta em mais nada', () => {
    const { sql } = TODAS.alvo();
    assert.match(sql, /select "?p"?\."?id"? as "?id"?/i);
    const listaDeSelecao = selecaoAteOTopo(sql);
    assert.equal(
      (listaDeSelecao.match(/ as "/g) ?? []).length,
      1,
      'a resolucao do alvo passou a selecionar mais de uma coluna: ela existe para achar o `id`',
    );
  });

  void it('ISCA -- as contagens sao SUBCONSULTA, e nunca `JOIN` + `GROUP BY`', () => {
    const sql = sqlDo('linha');
    assert.match(sql, /\(select count\(\*\) from publication_likes pl\s+where pl\.publication_id = p\.id\)/i);
    assert.match(
      sql,
      /\(select count\(\*\) from publication_comments pc\s+where pc\.publication_id = p\.id and pc\.deleted_at is null\)/i,
      'a contagem de comentarios deixou de filtrar os apagados, ou virou juncao',
    );
    assert.ok(
      !/group by/i.test(sql),
      '`GROUP BY` na linha do tempo significa que as contagens viraram agregacao de juncao -- ' +
        'e ai elas se multiplicam uma pela outra',
    );
    assert.ok(
      !/join\s+"?publication_likes"?/i.test(sql),
      'a linha do tempo passou a JUNTAR `publication_likes`',
    );
    assert.ok(
      !/join\s+"?publication_comments"?/i.test(sql),
      'a linha do tempo passou a JUNTAR `publication_comments`',
    );
  });

  void it('ISCA -- a MUTACAO reprova: a contagem de comentarios sem `deleted_at IS NULL`', () => {
    const conferirApagados = (texto: string): void => {
      assert.match(
        texto,
        /from publication_comments pc\s+where pc\.publication_id = p\.id and pc\.deleted_at is null/i,
      );
    };
    conferirApagados(sqlDo('linha'));
    aMutacaoTemDeReprovar(
      conferirApagados,
      sqlDo('linha').replace('AND pc.deleted_at IS NULL', ''),
      'a conferencia nao enxerga a contagem incluindo comentario apagado',
    );
  });

  void it('ISCA -- `liked_by_me` e `EXISTS` sobre a CHAVE PRIMARIA, com quem chama', () => {
    const { sql, parameters } = TODAS.linha();
    assert.match(
      sql,
      /exists \(select 1 from publication_likes pl\s+where pl\.publication_id = p\.id\s+and pl\.user_id = \$\d+::uuid\)/i,
      'o `liked_by_me` saiu da consulta, ou deixou de filtrar por quem chama',
    );
    assert.ok(parameters.includes(QUEM_OLHA));
  });

  void it('ISCA -- NAO HA coluna denormalizada de contagem em consulta nenhuma', () => {
    for (const nome of Object.keys(TODAS) as (keyof typeof TODAS)[]) {
      const sql = sqlDo(nome);
      for (const coluna of ['p.like_count', 'p.comment_count', 'likes_count', 'comments_count']) {
        assert.ok(
          !sql.includes(coluna),
          `${nome}: \`${coluna}\` e contagem denormalizada, e ela divergiria das linhas`,
        );
      }
    }
  });

  void it('ISCA -- os comentarios vem do mais ANTIGO, e o cursor usa `>` e nao `<`', () => {
    const sql = sqlDo('comentarios');
    assert.match(sql, /order by "?k"?\."?created_at"? asc, "?k"?\."?public_ref"? asc/i);
    const comCursor = construtorDosComentarios(semBanco, ID_INTERNO, QUEM_OLHA, {
      limite: 20,
      curso: { antesDe: AGORA, ref: REF },
    }).sql;
    assert.match(
      comCursor,
      /\(k\.created_at, k\.public_ref\) > \(\$\d+::timestamptz, \$\d+\)/,
      'o cursor dos comentarios usa `<` como a linha do tempo: a pagina seguinte devolveria a anterior',
    );
  });

  void it('ISCA -- a leitura de comentario nega BLOQUEIO do autor DO COMENTARIO', () => {
    const conferir = (texto: string): void => {
      assert.match(texto, /NOT bloqueio_entre\(k\.author_user_id, \$\d+::uuid\)/);
    };
    conferir(sqlDo('comentarios'));
    aMutacaoTemDeReprovar(
      conferir,
      sqlDo('comentarios').replace('NOT bloqueio_entre', 'bloqueio_entre'),
      'a conferencia nao enxerga o `NOT` ausente: quem bloqueou veria SO os comentarios do bloqueado',
    );
  });

  void it('EMENDA 5 item 2 -- a foto do autor DO COMENTARIO exige CONEXAO ACEITA no JOIN', () => {
    const conferir = (texto: string): void => {
      assert.match(texto, /uc\.state = 'accepted'/, 'o predicado de ACEITE saiu do JOIN da foto');
      assert.match(
        texto,
        /uc\.requester_user_id = k\.author_user_id AND uc\.addressee_user_id = \$\d+::uuid/,
        'um sentido do par saiu do predicado da foto do autor do comentario',
      );
      assert.match(
        texto,
        /uc\.requester_user_id = \$\d+::uuid AND uc\.addressee_user_id = k\.author_user_id/,
        'o OUTRO sentido do par saiu: a conexao e simetrica, e quem pediu nao decide quem ve',
      );
      assert.match(
        texto,
        /conta_habilitada\(uc\.requester_user_id\)[\s\S]*conta_habilitada\(uc\.addressee_user_id\)/,
        'as duas pontas da aresta precisam estar habilitadas',
      );
      assert.match(
        texto,
        /k\.author_user_id = \$\d+::uuid\s*\n?\s*OR EXISTS/,
        'o ramo do PROPRIO autor saiu: quem comenta veria o proprio cartao sem rosto',
      );
    };
    conferir(sqlDo('comentarios'));
    aMutacaoTemDeReprovar(
      conferir,
      sqlDo('comentarios').replace("uc.state = 'accepted'", "uc.state = 'pending'"),
      'a conferencia nao enxerga `pending` no lugar de `accepted`',
    );
    aMutacaoTemDeReprovar(
      conferir,
      sqlDo('comentarios').replace(
        /OR \(uc\.requester_user_id = \$\d+::uuid AND uc\.addressee_user_id = k\.author_user_id\)/,
        '',
      ),
      'a conferencia nao enxerga UM sentido do par removido',
    );
    aMutacaoTemDeReprovar(
      conferir,
      sqlDo('comentarios').replace('AND conta_habilitada(uc.addressee_user_id)', ''),
      'a conferencia nao enxerga `conta_habilitada` de UMA ponta removida',
    );
  });

  void it('EMENDA 5 item 2 -- o predicado mora no JOIN DA FOTO, e nao no WHERE da lista', () => {
    const sql = sqlDo('comentarios');
    const inicio = sql.indexOf('left join "catalog_images" as "fa"');
    assert.ok(
      inicio >= 0,
      'o JOIN da foto do autor do comentario nao foi achado: o alias `fa` mudou e este caso ficou cego',
    );
    const fim = sql.indexOf(' where ');
    assert.ok(fim > inicio, 'o SQL nao tem `where` depois do JOIN da foto: o corte ficaria cego');
    const joinDaFoto = sql.slice(inicio, fim);
    assert.ok(
      joinDaFoto.includes('photo_image_id'),
      'o recorte nao pegou o JOIN da foto: este caso ficaria cego',
    );
    assert.ok(
      joinDaFoto.includes('user_connections'),
      'o predicado de conexao saiu do JOIN da foto: dois conhecidos do mesmo amigo voltam a se ver',
    );
    const clausula = sql.slice(fim);
    assert.ok(
      !clausula.includes('user_connections'),
      'o predicado de conexao entrou no WHERE: o comentario de quem nao e conexao DESAPARECERIA ' +
        'da publicacao do amigo comum, e `comment_count` divergiria da lista',
    );
  });

  void it('CONTRAPESO -- a leitura de comentario NAO esconde o NOME de quem nao e conexao', () => {
    const sql = sqlDo('comentarios');
    assert.match(sql, /"?a"?\."?display_name"? as "?display_name"?/);
    assert.match(sql, /"?h"?\."?handle"? as "?handle"?/);
    const joinDoApelido = sql.slice(
      sql.indexOf('left join "handles" as "h"'),
      sql.indexOf('left join "catalog_images" as "fa"'),
    );
    assert.ok(
      !joinDoApelido.includes('user_connections'),
      'o apelido ganhou predicado de conexao: a Emenda 2 nao o fecha, e o perfil e enderecado por ele',
    );
  });

  void it('ISCA -- apagar comentario tem os DOIS caminhos na clausula, e nenhum acima dela', () => {
    const { sql, parameters } = TODAS.apagarComentario();
    assert.match(sql, /update "?publication_comments"?/i);
    assert.match(sql, /"?public_ref"? = \$\d+/);
    assert.match(sql, /"?publication_id"? = \$\d+/);
    assert.match(sql, /"?deleted_at"? is null/i);
    assert.match(
      sql,
      /publication_comments\.author_user_id = \$\d+::uuid/,
      'o caminho do AUTOR DO COMENTARIO saiu do WHERE: ele deixaria de apagar o proprio',
    );
    assert.match(
      sql,
      /or exists \(\s*select 1 from user_publications p\s+where p\.id = publication_comments\.publication_id\s+and p\.author_user_id = \$\d+::uuid\)/i,
      'o caminho do DONO DA PUBLICACAO saiu do WHERE: a decisao do cliente de 20/10 deixaria de valer',
    );
    assert.ok(parameters.includes(QUEM_OLHA), 'quem chama nao chegou como parametro');
    assert.ok(!/^delete/i.test(sql.trim()), 'apagar comentario passou a ser DELETE fisico');
  });

  void it('ISCA -- a MUTACAO reprova: o caminho do AUTOR removido', () => {
    const conferirAutor = (texto: string): void => {
      assert.match(texto, /publication_comments\.author_user_id = \$\d+::uuid/);
    };
    conferirAutor(sqlDo('apagarComentario'));
    aMutacaoTemDeReprovar(
      conferirAutor,
      sqlDo('apagarComentario').replace(
        /publication_comments\.author_user_id = \$\d+::uuid/,
        'false',
      ),
      'a conferencia nao enxerga o caminho do autor removido: quem escreveu deixaria de apagar',
    );
  });

  void it('ISCA -- a MUTACAO reprova: o caminho do DONO removido', () => {
    const conferirDono = (texto: string): void => {
      assert.match(texto, /or exists \(\s*select 1 from user_publications p/i);
    };
    conferirDono(sqlDo('apagarComentario'));
    aMutacaoTemDeReprovar(
      conferirDono,
      sqlDo('apagarComentario').replace(/or exists \([\s\S]*?::uuid\)/i, ''),
      'a conferencia nao enxerga o caminho do dono removido',
    );
  });

  void it('ISCA -- a MUTACAO reprova: o `OR` virou `OR true` (qualquer um apaga)', () => {
    const conferirSemAbertura = (texto: string): void => {
      assert.ok(
        !/\bor true\b/i.test(texto),
        'ha um `OR true` no predicado de apagar comentario: qualquer um que VE a ' +
          'publicacao passaria a apagar comentario de qualquer um',
      );
      assert.ok(
        !/\bor 1 ?= ?1\b/i.test(texto),
        'ha um `OR 1=1` no predicado de apagar comentario',
      );
    };
    conferirSemAbertura(sqlDo('apagarComentario'));
    aMutacaoTemDeReprovar(
      conferirSemAbertura,
      sqlDo('apagarComentario').replace('and "deleted_at" is null', 'or true and "deleted_at" is null'),
      'a conferencia nao enxerga uma abertura do predicado',
    );
  });

  void it('ISCA -- o `publication_id` CONTINUA na clausula: ref de outra publicacao nao e atingido', () => {
    const conferirPublicacao = (texto: string): void => {
      assert.match(texto, /"?publication_id"? = \$\d+/);
    };
    conferirPublicacao(sqlDo('apagarComentario'));
    aMutacaoTemDeReprovar(
      conferirPublicacao,
      sqlDo('apagarComentario').replace(/"publication_id" = \$\d+/, 'true'),
      'a conferencia nao enxerga a publicacao removida da clausula',
    );
  });

  void it('CONTRAPESO -- a leitura de comentario SELECIONA o que a resposta precisa', () => {
    const sql = sqlDo('comentarios');
    assert.match(sql, /"?k"?\."?public_ref"? as "?ref"?/);
    assert.match(sql, /"?k"?\."?body"? as "?body"?/);
    assert.match(sql, /"?a"?\."?display_name"? as "?display_name"?/);
    assert.match(sql, /"?fa"?\."?thumb_key"? as "?autor_thumb_key"?/);
    assert.match(sql, /k\.author_user_id = \$\d+::uuid as "?minha"?/);
  });

  void it('CONTRAPESO -- a leitura de comentario NAO alcanca imagem de comentario nem fio', () => {
    const sql = sqlDo('comentarios');
    for (const agulha of ['parent_comment_id', 'k.image_id', 'comment_image']) {
      assert.ok(!sql.includes(agulha), `\`${agulha}\` entrou na leitura de comentario`);
    }
  });
});

void describe('O TEXTO ALTERNATIVO SAI COM A IMAGEM -- o gatilho da `20261020000007`', () => {
  const MIGRACOES = 'migrations';

  function migracao(trecho: string): string {
    const arquivo = readdirSync(MIGRACOES).find((nome) => nome.includes(trecho));
    assert.ok(arquivo !== undefined, `a migracao \`${trecho}\` sumiu de \`${MIGRACOES}\`.`);
    return readFileSync(join(MIGRACOES, arquivo), 'utf8');
  }

  const conserto = migracao('o-texto-alternativo-sai-com-a-imagem');
  const original = migracao('o-mural-a-publicacao-do-usuario');

  void it('ISCA -- o gatilho e `BEFORE UPDATE`, e NUNCA `AFTER`', () => {
    assert.match(
      conserto,
      /CREATE TRIGGER user_publications_texto_sai_com_a_imagem\s+BEFORE UPDATE ON user_publications/,
      'o gatilho deixou de ser `BEFORE UPDATE` em `user_publications`',
    );
    assert.ok(
      !/AFTER UPDATE ON user_publications/.test(conserto),
      'o gatilho virou `AFTER`: o `CHECK` reprovaria antes de ele rodar, e o 23514 volta',
    );
    assert.match(conserto, /FOR EACH ROW/, 'gatilho de sentenca nao enxerga `NEW`');
  });

  void it('ISCA -- o `WHEN` cobre os DOIS caminhos, e cada um por TRANSICAO', () => {
    assert.match(
      conserto,
      /\(OLD\.image_id IS NOT NULL AND NEW\.image_id IS NULL\)/,
      'o caminho da IMAGEM APAGADA saiu do `WHEN`',
    );
    assert.match(
      conserto,
      /\(OLD\.deleted_at IS NULL AND NEW\.deleted_at IS NOT NULL\)/,
      'o caminho da EXCLUSAO LOGICA saiu do `WHEN`: a imagem voltaria a ficar presa',
    );
    assert.ok(
      !/WHEN \(\s*NEW\.\w+ IS (NOT )?NULL\s*\)/.test(conserto),
      'o `WHEN` passou a olhar so o estado novo: ele dispararia em escrita que nao muda nada',
    );
  });

  void it('ISCA -- o corpo anula `alt_text` nos dois ramos, e `image_id` no da exclusao', () => {
    assert.match(conserto, /IF NEW\.image_id IS NULL THEN\s+NEW\.alt_text := NULL;/);
    assert.match(
      conserto,
      /IF NEW\.deleted_at IS NOT NULL THEN\s+NEW\.image_id := NULL;\s+NEW\.alt_text := NULL;/,
      'o ramo da exclusao logica deixou de anular os DOIS: so `image_id` deixaria `alt_text` ' +
        'orfao e o `CHECK` reprovaria o proprio apagamento',
    );
    assert.ok(
      !/NEW\.body := /.test(conserto),
      'o gatilho passou a mexer em `body`: o texto da pessoa nao e descricao de foto',
    );
  });

  void it('ISCA -- o `CHECK` original NAO foi afrouxado nem removido', () => {
    assert.match(
      original,
      /CONSTRAINT user_publications_texto_alternativo_pede_imagem\s+CHECK \(image_id IS NOT NULL OR alt_text IS NULL\)/,
      'o `CHECK` de `alt_text` sem imagem saiu da `20261020000002`',
    );
    assert.ok(
      !/DROP CONSTRAINT user_publications_texto_alternativo_pede_imagem/.test(conserto),
      'o conserto DERRUBOU o `CHECK` em vez de reconciliar as duas declaracoes',
    );
  });

  void it('ISCA -- o `SET NULL` NAO virou `CASCADE`', () => {
    assert.match(
      original,
      /REFERENCES catalog_images \(id\) ON DELETE SET NULL/,
      'a chave da imagem deixou de ser `SET NULL`',
    );
    assert.ok(
      !/REFERENCES catalog_images \(id\) ON DELETE CASCADE/.test(original),
      '`image_id` virou `CASCADE`: apagar uma imagem apagaria a publicacao e o texto dela',
    );
  });

  void it('CONTRAPESO -- o `down` desfaz o gatilho E a funcao', () => {
    assert.match(conserto, /DROP TRIGGER user_publications_texto_sai_com_a_imagem ON user_publications;/);
    assert.match(conserto, /DROP FUNCTION publicacao_texto_alternativo_sai_com_a_imagem\(\);/);
  });
});
