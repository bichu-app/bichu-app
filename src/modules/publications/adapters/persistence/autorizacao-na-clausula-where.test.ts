/**
 * AS ISCAS DE SQL DO MURAL: **o recorte de visibilidade está no `WHERE`, e o
 * que não pode sair não está no `SELECT`.**
 *
 * ## Por que medir o SQL, e não só o comportamento
 *
 * Porque a afirmação do ADR-0021 é sobre a FORMA da consulta: *"a autorização é
 * a própria cláusula `WHERE`"*. Um caso que chamasse o repositório com um banco
 * de verdade mediria o resultado de **uma** chamada; o que precisa valer é que
 * **não existe** consulta neste arquivo que alcance o que ela não deve — e isso
 * se mede compilando e lendo o SQL.
 *
 * É a forma que `people/.../autorizacao-na-clausula-where.test.ts`,
 * `connections/.../autorizacao-na-clausula-where.test.ts` e
 * `safety/.../bloqueio-e-ocultacao-na-clausula-where.test.ts` já usam nesta
 * casa. A suíte não tem banco: o `DummyDriver` compila e devolve o texto.
 *
 * ## CADA ISCA DESLIGA O PREDICADO E CONFERE QUE ELA REPROVA
 *
 * **Isto é o que falta nos onze portões cegos achados nesta rodada**, e um deles
 * era literalmente "uma isca de SQL verde com o recorte neutralizado". Uma
 * expressão regular que case `/accepted/` no SQL inteiro fica verde num mundo em
 * que a palavra está num comentário, num `ORDER BY` ou num segundo ramo. Então
 * cada caso abaixo tem um irmão que **muta o predicado** — tira a perna do par,
 * troca `accepted` por `pending`, remove `NOT` do bloqueio — e exige que a
 * própria conferência do caso de cima **falhe** sobre o texto mutado. Se a
 * mutação passar, a conferência não media nada.
 *
 * ## O que estes casos NÃO provam, e está dito em voz alta
 *
 * Que o Postgres se comporta como o texto diz. `conta_habilitada`,
 * `bloqueio_entre` e `publicacao_ocultada_para_quem_denunciou` são funções SQL
 * das migrações `20261017000013`, `20261018000031` e `20261018000032`, e o que
 * elas fazem é medido onde elas moram. Aqui se prova que esta camada as CHAMA,
 * no `WHERE`, em toda consulta — que é a metade que um refator quebra. O corpo
 * real das respostas foi medido à mão contra Postgres, e está no relatório
 * desta fatia.
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
  construtorDaLinhaDoTempo,
  construtorDasMinhasPublicacoes,
  construtorDoApagar,
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
const TODAS = {
  minhas: () => construtorDasMinhasPublicacoes(semBanco, QUEM_OLHA, RECORTE),
  linha: () => construtorDaLinhaDoTempo(semBanco, QUEM_OLHA, RECORTE),
  apagar: () => construtorDoApagar(semBanco, QUEM_OLHA, REF, AGORA),
} as const;

const sqlDo = (nome: keyof typeof TODAS): string => TODAS[nome]().sql;

/**
 * As conferências de predicado, cada uma uma função sobre o TEXTO do SQL.
 *
 * Elas existem como funções, e não como `assert` dentro do caso, para que a
 * isca de mutação chame **exatamente a mesma conferência** sobre um texto
 * mutilado. Uma cópia da expressão dentro da isca não provaria nada sobre a
 * conferência que está no caso de cima — provaria sobre a cópia.
 */
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
    // `("p".)?` porque o `UPDATE` nao tem alias: as duas leituras dizem
    // `"p"."deleted_at"` e o `apagar` diz `"deleted_at"`. Uma expressao por
    // consulta seriam DUAS conferencias, e a isca de mutacao so poderia chamar
    // uma delas.
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
    // Sem esta isca, o caso de cima ficaria verde se a conferencia estivesse
    // casando qualquer coisa -- e foi assim que um portao desta casa casou nome
    // de schema por SUBSTRING e ficou cego.
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
    // `403` nao existe porque nao existe caminho que o produza, e `UNION`/`CASE`
    // seriam o lugar onde "se for conexao ve, senao ve menos" nasceria. O
    // `EXISTS` e a UNICA porta, e o unico `OR` de primeiro nivel e sobre QUEM
    // CHAMA (`p.author_user_id = $n`), nunca sobre um atributo da publicacao.
    const sql = sqlDo('linha');
    assert.ok(!/\bUNION\b/i.test(sql), 'UNION e um segundo ramo de leitura');
    assert.ok(!/\bCASE\s+WHEN\b/i.test(sql), 'CASE WHEN e o `if` que o ADR-0021 proibe');
    // Nenhuma coluna de visibilidade existe na tabela, e portanto nenhuma pode
    // estar aqui. O caso reprova se alguem a criar e passar a lê-la.
    for (const inventada of ['visibility', 'is_public', 'audience', 'privacy']) {
      assert.ok(!sql.includes(inventada), `\`${inventada}\` entrou na consulta da linha do tempo`);
    }
  });

  void it('ISCA (f) -- publicacao APAGADA nao sai, nas tres consultas', () => {
    // O 404 de publicacao apagada e o MESMO de inexistente, e e por isto: ela
    // nao sai de leitura nenhuma, e o `UPDATE` nao a atinge de novo.
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
  void it('a linha do tempo NAO le a foto de PESSOA: a Emenda 3 do ADR-0010 e por omissao de coluna', () => {
    // `photo_image_id` e a foto unica da pessoa. A Emenda 3 a abriu em
    // `Conversation.participants[]` "e em mais nenhuma resposta deste
    // contrato". A coluna ausente e o que torna isso verificavel.
    const sql = sqlDo('linha');
    assert.ok(
      !sql.includes('photo_image_id'),
      '`users.photo_image_id` entrou na linha do tempo: a Emenda 3 do ADR-0010 fecha essa superficie, e abri-la e decisao do cliente',
    );
  });

  void it('a linha do tempo NAO alcanca a VITRINE: nenhuma das duas derivadas dela', () => {
    const sql = sqlDo('linha');
    for (const agulha of ['user_showcase_images', 'thumb_key', 'banner_key']) {
      assert.ok(
        !sql.includes(agulha),
        `\`${agulha}\` entrou na linha do tempo: a vitrine tem consulta propria, e o portao vitrine-nao-sai-para-terceiro a cobra`,
      );
    }
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

  void it('a linha do tempo NAO le endereco, telefone, e-mail nem nascimento', () => {
    const sql = sqlDo('linha');
    for (const coluna of [
      'phone_e164',
      'email',
      'birth_date',
      'postal_code',
      'neighbourhood',
      'location',
      'public_ref',
    ]) {
      // `public_ref` entra na lista de propositio: o que sai do AUTOR e o
      // apelido, e `users.public_ref` seria um segundo endereco estavel de
      // pessoa numa resposta que nao precisa dele. O `p.public_ref` da
      // PUBLICACAO e outra coluna, de outra tabela, e o caso abaixo confere
      // que ela sai -- por isso aqui a busca e pelo prefixo da tabela `a`.
      assert.ok(
        !sql.includes(`"a"."${coluna}"`) && !sql.includes(`a.${coluna}`),
        `\`users.${coluna}\` entrou na linha do tempo`,
      );
    }
  });

  void it('`minha` e coluna CALCULADA no banco, e nao comparacao na tela', () => {
    // A tela nao tem o apelido de quem chama em toda rolagem, e compara-lo ali
    // seria a autorizacao migrando para o cliente.
    assert.match(
      sqlDo('linha'),
      /p\.author_user_id = \$\d+::uuid as "minha"/,
      '`mine` saiu da consulta: o cartao perderia como decidir entre `Apagar` e `Denunciar`',
    );
  });

  void it('so foto `ready` COM derivada entra na linha do tempo', () => {
    // Foto em `processing` carrega o EXIF do celular (ADR-0010 item 4), e
    // servi-la entregaria a coordenada de onde ela foi tirada. O predicado esta
    // no `JOIN`, entao a coluna chega NULA -- e e por isso que
    // `PublicationPhoto` nao tem campo de estado.
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
    // E esta leitura que distingue, na tela, "nao tenho conexao" de "ninguem
    // publicou". Se ela exigisse conexao, quem nao tem nenhuma nao veria o que
    // acabou de publicar -- que e o pedido do cliente.
    const sql = sqlDo('minhas');
    assert.match(sql, /"?p"?\."?author_user_id"? = \$\d+/);
    assert.ok(
      !sql.includes('user_connections'),
      'a leitura do proprio dono passou a depender de conexao',
    );
  });

  void it('ISCA (f) -- `apagar` tem o AUTOR na clausula, e por isso 404 e nunca 403', () => {
    // Sem o autor na clausula bastaria o ENDERECO -- e o endereco e exatamente
    // o que `reportPublication` entrega a quem denuncia.
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
    // Sem ele, todos os casos de omissao acima passariam num mundo em que a
    // consulta nao devolve nada -- que e a forma mais facil de um teste de
    // omissao ficar verde sem ter medido nada.
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
    // O espaco de nomes e COMPARTILHADO (`20261018000021`): `handles` hospeda
    // `pessoa`, `pet` e `reservado`. Sem o predicado, o apelido de um PET
    // poderia sair como apelido do autor.
    const { sql, parameters } = TODAS.linha();
    assert.match(sql, /"?h"?\."?kind"? = \$\d+/);
    assert.ok(parameters.includes('pessoa'));
  });

  void it('CONTRAPESO -- a lista de selecao da linha do tempo tem OITO colunas, e a lista e FECHADA', () => {
    // As oito: `ref`, `body`, `created_at`, `alt_text`, `public_key`, `handle`,
    // `display_name` e a calculada `minha`. Coluna nova aqui significa campo
    // novo na resposta, e este caso e onde alguem ve antes de ela chegar ao
    // aplicativo.
    //
    // O corte e em ` from "user_publications"` e nao no primeiro ` from `:
    // existe um `FROM user_connections` DENTRO do `EXISTS` do `WHERE`, e cortar
    // ali daria uma contagem que nao e a da lista de selecao -- foi assim que a
    // primeira versao do caso irmao, no perfil, contou quatro e reprovou a
    // consulta correta.
    const { sql } = TODAS.linha();
    const listaDeSelecao = sql.slice(0, sql.toLowerCase().indexOf(' from "user_publications"'));
    assert.equal(
      (listaDeSelecao.match(/ as "/g) ?? []).length,
      8,
      'a lista de selecao da linha do tempo saiu de OITO colunas: uma a mais e um campo a mais na resposta',
    );
  });

  void it('CONTRAPESO -- as duas leituras pedem `limite + 1` e ordenam por (data, ref)', () => {
    // `limite + 1` e como a pagina sabe que ha proxima sem uma segunda consulta
    // de contagem. A ordem por DUAS colunas e o que faz o cursor nao repetir
    // nem pular linha no empate de milissegundo.
    for (const nome of ['minhas', 'linha'] as const) {
      const sql = sqlDo(nome);
      assert.match(sql, /order by "?p"?\."?created_at"? desc, "?p"?\."?public_ref"? desc/i, nome);
      assert.match(sql, /limit \$?\d+/i, nome);
      assert.ok(TODAS[nome]().parameters.includes(21), `${nome}: o limite pedido nao e limite + 1`);
    }
  });
});
