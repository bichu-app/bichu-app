/**
 * As ISCAS de SQL do perfil de outra pessoa: **o predicado está na cláusula
 * `WHERE`, e o que não pode sair não está no `SELECT`**.
 *
 * ## Por que medir o SQL, e não só o comportamento
 *
 * Porque a afirmação do ADR-0021 é sobre a FORMA da consulta: *"a autorização é
 * a própria cláusula `WHERE`"*. Um caso que chamasse o repositório com um banco
 * de verdade mediria o resultado de **uma** chamada; o que precisa valer é que
 * **não existe** consulta neste arquivo que alcance o que ela não deve — e isso
 * se mede compilando e lendo o SQL. É a forma que
 * `connections/adapters/persistence/autorizacao-na-clausula-where.test.ts` e
 * `safety/adapters/persistence/bloqueio-e-ocultacao-na-clausula-where.test.ts`
 * já usam nesta casa.
 *
 * A suíte não tem banco: o `DummyDriver` compila e devolve o texto.
 *
 * ## O que estes casos NÃO provam, e está dito em voz alta
 *
 * Que o Postgres se comporta como o texto diz. `conta_habilitada`,
 * `bloqueio_entre`, `perfil_ocultado_para_quem_denunciou` e
 * `foto_ocultada_para_quem_denunciou` são funções SQL das migrações
 * `20261017000013`, `20261018000031` e `20261018000032`, e o que elas fazem é
 * medido onde elas moram. Aqui se prova que esta camada as CHAMA, no `WHERE`, em
 * toda consulta — que é a metade que um refator quebra.
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

/** As DUAS consultas desta camada, para varrer em lote. */
const TODAS = {
  perfil: () => construtorDoPerfilPorApelido(semBanco, APELIDO, QUEM_OLHA),
  vitrine: () => construtorDaVitrineDeConexao(semBanco, MARINA, QUEM_OLHA),
} as const;

const sqlDo = (nome: keyof typeof TODAS): string => TODAS[nome]().sql;

void describe('a autorizacao do perfil de outra pessoa mora na clausula WHERE', () => {
  // ------------------------------------------------------------------
  // ISCA (d): 404 E NUNCA 403 -- OS SEIS PREDICADOS
  // ------------------------------------------------------------------

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
    // O espaço de nomes é COMPARTILHADO (`20261018000021`): `handles` hospeda
    // `pessoa`, `pet` e `reservado`. Sem este predicado, `/people/bidu`
    // devolveria o perfil de quem estiver em `handles.user_id` — ou viraria um
    // oráculo de "este apelido existe e é de um pet".
    assert.match(sqlDo('perfil'), /"?h"?\."?kind"? = \$\d+/);
    const { parameters } = TODAS.perfil();
    assert.ok(
      parameters.includes('pessoa'),
      'o valor do predicado tem de ser `pessoa`, e nao um parametro que alguem passe de fora',
    );
  });

  void it('ISCA (d) -- NENHUMA das duas consultas tem ramo, `CASE` ou `UNION` que escolha visibilidade', () => {
    // 403 não existe porque não existe caminho que o produza. Um `CASE` no
    // `WHERE` seria o lugar onde "se for conexão vê tudo, senão 403" nasceria.
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

  // ------------------------------------------------------------------
  // ISCA (c): PET É CONTAGEM, E A CONSULTA NÃO ALCANÇA MAIS NADA DELE
  // ------------------------------------------------------------------

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
    // Com `LEFT JOIN pets` + `GROUP BY`, as colunas do animal ficam a um
    // caractere de distância de quem mexer aqui depois. Com a subconsulta, só o
    // número existe no escopo.
    const sql = sqlDo('perfil');
    assert.ok(!/join\s+"?pets"?/i.test(sql), 'a consulta do perfil passou a JUNTAR `pets`');
    assert.ok(!/group by/i.test(sql), '`GROUP BY` aqui significa que a contagem virou agregacao da junção');
  });

  /**
   * O SQL com as DUAS colunas do selo de validado apagadas.
   *
   * **A excecao e estreita, e esta aqui porque tem de ser lida junto com a
   * varredura logo abaixo.** A emenda do ADR-0010 de 21/10/2026 fez o perfil
   * derivar o selo de
   * `u.email_verified_at IS NOT NULL OR u.phone_verified_at IS NOT NULL`, e
   * `email_verified_at` CONTEM `email` -- a varredura e por substring, e sem
   * esta subtracao ela reprovaria a consulta correta.
   *
   * **O que sai da varredura sao os dois NOMES COMPLETOS, nunca o prefixo**:
   * `email` cru continua reprovando, e e o caso de MUTACAO abaixo que prova que
   * a varredura nao ficou cega. Apagar `email` da lista em vez de subtrair estas
   * duas colunas era o conserto facil, e teria aberto a porta para o endereco
   * entrar sem ninguem ver.
   */
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
    // **Sem este caso, a subtracao de `semAsColunasDoSelo` seria um buraco.**
    // Ela existe para que `u.email_verified_at` passe; se ela tambem deixasse
    // passar o endereco, o caso de cima ficaria verde com o e-mail de outra
    // pessoa saindo no perfil -- e e essa a familia de defeito que o item 1 do
    // ADR-0010 fecha.
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
    // A emenda do ADR-0010 de 21/10/2026, decisao do cliente. **A condicao e a
    // MESMA regua dos quatro `409 contact-channel-unverified`**
    // (`kysely-canal-verificado-do-chamador.ts` e `estadoParaCriarEncontro`):
    // duas definicoes de "validado" seriam duas reguas, e a mesma conta sairia
    // validada numa tela e nao na outra. Este caso reprova quem trocar o `OR`
    // por `AND` -- com `AND` ninguem teria selo, porque nada em `src/` grava
    // `phone_verified_at`.
    const sql = sqlDo('perfil');
    assert.match(
      sql,
      /\(u\.email_verified_at IS NOT NULL OR u\.phone_verified_at IS NOT NULL\) as "canal_verificado"/i,
      'o selo de validado nao e a regua unica, ou deixou de ser derivado no SQL',
    );
    // **O que sai e o booleano, e nunca a data.** "O e-mail dela foi confirmado
    // em marco" nao e assunto de terceiro.
    assert.ok(
      !/"?u"?\."?email_verified_at"? as /i.test(sql),
      'a DATA de confirmacao de e-mail entrou na lista de selecao do perfil',
    );
    assert.ok(
      !/"?u"?\."?phone_verified_at"? as /i.test(sql),
      'a DATA de confirmacao de telefone entrou na lista de selecao do perfil',
    );
    // A VITRINE continua sem o selo: ela e consulta de FOTO, e o selo e da
    // conta. Uma copia da condicao ali seria a segunda regua.
    assert.ok(
      !sqlDo('vitrine').includes('email_verified_at'),
      'a consulta da vitrine passou a derivar o selo: ele sai do perfil, uma vez',
    );
  });

  // ------------------------------------------------------------------
  // ISCA (a): A VITRINE NÃO SAI PARA QUEM NÃO É CONEXÃO
  // ------------------------------------------------------------------

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
    // `position` continua no `ORDER BY`: a ordem é a da resposta.
    assert.match(sql, /order by "?v"?\."?position"? asc/i);
  });

  void it('ISCA (a) -- a vitrine confere o PROPOSITO: capa de encontro nao vira foto de perfil', () => {
    assert.match(sqlDo('vitrine'), /"?c"?\."?purpose"? = \$\d+/);
    assert.ok(TODAS.vitrine().parameters.includes('user_showcase'));
  });

  // ------------------------------------------------------------------
  // CONTRAPESOS
  // ------------------------------------------------------------------

  void it('CONTRAPESO -- a consulta da vitrine SELECIONA as duas derivadas e o texto alternativo', () => {
    // Sem ele, todas as iscas de omissao acima passariam num mundo em que a
    // consulta da vitrine nao devolve nada -- que e a forma mais facil de um
    // teste de omissao ficar verde sem ter medido nada.
    const sql = sqlDo('vitrine');
    assert.match(sql, /"?c"?\."?thumb_key"? as "?grade_key"?/);
    assert.match(sql, /"?c"?\."?public_key"? as "?aberta_key"?/);
    assert.match(sql, /"?v"?\."?alt_text"? as "?alt_text"?/);
    assert.match(sql, /from "?user_showcase_images"? as "?v"?/i);
  });

  void it('CONTRAPESO -- a consulta do perfil SELECIONA o que o cliente liberou, e nada mais', () => {
    const { sql } = TODAS.perfil();
    // As quatro colunas, a contagem e o selo de validado (emenda de 21/10/2026,
    // CALCULADO). A lista é FECHADA: coluna nova aqui significa campo novo na
    // resposta, e este caso é onde alguém vê.
    assert.match(sql, /"?u"?\."?id"? as "?user_id"?/);
    assert.match(sql, /"?h"?\."?handle"? as "?handle"?/);
    assert.match(sql, /"?u"?\."?public_ref"? as "?public_ref"?/);
    assert.match(sql, /"?u"?\."?display_name"? as "?display_name"?/);
    assert.match(sql, /as "?pets_count"?/);
    assert.match(sql, /as "?canal_verificado"?/);
    // O corte e em ` from "handles"` e nao no primeiro ` from `: o primeiro
    // esta DENTRO da subconsulta de contagem (`FROM pets p`), e cortar ali
    // deixava `pets_count` de fora -- a primeira versao deste caso contava
    // quatro e reprovava a consulta correta.
    const listaDeSelecao = sql.slice(0, sql.indexOf(' from "handles"'));
    assert.equal(
      (listaDeSelecao.match(/ as "/g) ?? []).length,
      6,
      'a lista de selecao do perfil saiu de SEIS colunas: uma a mais e um campo a mais na resposta',
    );
  });
});
