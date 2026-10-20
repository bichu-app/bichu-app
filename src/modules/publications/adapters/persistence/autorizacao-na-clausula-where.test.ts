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
  // 20/10/2026: curtir e comentar.
  alvo: () => construtorDaPublicacaoVisivel(semBanco, REF, QUEM_OLHA),
  comentarios: () => construtorDosComentarios(semBanco, ID_INTERNO, QUEM_OLHA, RECORTE),
  apagarComentario: () =>
    construtorDoApagarComentario(semBanco, QUEM_OLHA, ID_INTERNO, REF, AGORA),
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
  void it('EMENDA 5 -- a linha do tempo LE a foto do autor, e so a `thumb` 176', () => {
    // **Emenda 5 do ADR-0010 (20/10/2026)**, decisao do cliente: *"tras a foto,
    // algo bem parecido com o instagram"*. Ela nasceu AUSENTE de proposito -- a
    // Emenda 3 limitava a foto de pessoa a `Conversation.participants[]` "e em
    // mais nenhuma resposta deste contrato" --, a frente parou e perguntou, e a
    // emenda nomeou esta superficie.
    const { sql, parameters } = TODAS.linha();
    assert.match(
      sql,
      /"?fa"?\."?thumb_key"? as "?autor_thumb_key"?/,
      'a foto do autor saiu da consulta: a Emenda 5 a nomeia nesta superficie',
    );
    assert.match(sql, /"?fa"?\."?id"? = "?a"?\."?photo_image_id"?/i);
    // **A `thumb` 176, e NUNCA a `card` de 512.** A conta e da propria emenda: o
    // icone pinta 40 dp (120 px reais a 3x); a de 176 cobre sem ampliar (1,47x)
    // e a de 512 seria 4,27x mais dado do que a celula pinta, vinte vezes por
    // pagina. Esta linha reprova quem trocar a derivada.
    assert.ok(
      !/"?fa"?\."?public_key"?/.test(sql),
      'a consulta passou a ler a `card` de 512 da foto do autor: 4,27x mais dado do que o icone pinta',
    );
    // Os tres estados em que a foto NAO sai, e nenhum e de autorizacao.
    assert.ok(parameters.includes('user_photo'), 'o proposito da foto de PESSOA saiu do JOIN (T9)');
    assert.match(sql, /fa\.thumb_key IS NOT NULL/);
  });

  void it('EMENDA 5 -- a MUTACAO reprova: a `card` de 512 no lugar da `thumb`', () => {
    // Sem esta isca, o caso de cima ficaria verde se a conferencia nao
    // enxergasse a troca de derivada -- e a troca e exatamente o defeito que a
    // conta medida da emenda existe para impedir.
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
    // **A segunda copia do predicado e onde uma correcao pode faltar.**
    //
    // A linha que este `JOIN` decora so existe se o `WHERE` da consulta ja a
    // admitiu, e o `WHERE` so admite autor que e quem chama ou e conexao
    // `accepted` dele -- o predicado da Emenda 3 e satisfeito por CONSTRUCAO
    // aqui, e nao por repeticao. Este caso reprova quem o repetir, porque duas
    // copias divergem na primeira correcao.
    const sql = sqlDo('linha');
    const inicio = sql.indexOf('left join "catalog_images" as "fa"');
    assert.ok(
      inicio >= 0,
      'o JOIN da foto do autor nao foi achado: o alias `fa` mudou e este caso ficou cego',
    );
    // O corte e no PROXIMO ` left join ` -- que e o da imagem da publicacao --
    // ou, na falta dele, no ` where `. Um corte em `indexOf('where')` cru
    // engoliria o JOIN vizinho e o caso passaria a medir os dois juntos.
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
    // Quem le `GET /me/publications` e o AUTOR. Repetir a propria foto ali seria
    // uma terceira superficie dela sem consumidor -- a mesma razao pela qual a
    // Emenda 3 deixou o proprio lado da conversa com os dois nulos.
    const sql = sqlDo('minhas');
    assert.ok(
      !sql.includes('photo_image_id'),
      '`GET /me/publications` passou a ler a foto da pessoa: o item 8 da Emenda 5 a mantem fora',
    );
    assert.ok(!sql.includes('thumb_key'), '`minhas` leu a `thumb` da foto de pessoa');
  });

  void it('a linha do tempo NAO alcanca a VITRINE: nem a tabela, nem a derivada da grade', () => {
    // **`thumb_key` SAIU desta lista em 20/10/2026, e a razao e precisao e nao
    // afrouxamento.** A Emenda 5 passou a ler `fa.thumb_key` -- a `thumb` 176 da
    // foto UNICA da pessoa, que e a derivada que a propria emenda nomeia. A
    // `thumb` da VITRINE e outra coisa: ela tem 320 px e vem de
    // `user_showcase_images`, que continua proibida aqui.
    //
    // Manter `thumb_key` na lista reprovaria a leitura certa, e isso e pior do
    // que inutil: portao que reprova o certo e portao que alguem desliga. O que
    // identifica a vitrine e a TABELA, e e ela que a conferencia nomeia.
    const sql = sqlDo('linha');
    for (const agulha of ['user_showcase_images', 'banner_key', 'grid_url']) {
      assert.ok(
        !sql.includes(agulha),
        `\`${agulha}\` entrou na linha do tempo: a vitrine tem consulta propria, e o portao vitrine-nao-sai-para-terceiro a cobra`,
      );
    }
    // E a `thumb` que ENTRA e a da foto unica (`purpose = 'user_photo'`), nunca
    // a da vitrine (`user_showcase`). O proposito e o que distingue as duas.
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

  void it('CONTRAPESO -- a lista de selecao da linha do tempo tem DOZE colunas, e a lista e FECHADA', () => {
    // As doze, na ordem em que entraram:
    //
    //   OITO no nascimento -- `ref`, `body`, `created_at`, `alt_text`,
    //     `public_key`, `handle`, `display_name` e a calculada `minha`;
    //   a NONA pela Emenda 5 do ADR-0010 (20/10) -- `autor_thumb_key`;
    //   as TRES de curtir e comentar (20/10) -- `like_count`, `comment_count`
    //     e `liked_by_me`, as tres CALCULADAS por subconsulta.
    //
    // Coluna nova aqui significa campo novo na resposta, e este caso e onde
    // alguem ve antes de ela chegar ao aplicativo.
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
      12,
      'a lista de selecao da linha do tempo saiu de DOZE colunas: uma a mais e um campo a mais na resposta',
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

void describe('CURTIR E COMENTAR -- o recorte e UM, e a contagem sai das LINHAS', () => {
  void it('ISCA -- `construtorDaPublicacaoVisivel` tem o recorte INTEIRO, e as cinco escritas o usam', () => {
    // **UMA funcao, cinco chamadores.** Curtir, descurtir, comentar, listar
    // comentario e apagar comentario resolvem o alvo por ela. Cinco copias do
    // predicado seriam cinco lugares onde uma correcao pode faltar -- a mesma
    // aritmetica que fez `bloqueio_entre` existir como funcao SQL em vez de
    // expressao repetida em Kysely.
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
    // Ele devolve `id` de proposito: e com ele que as escritas gravam sem uma
    // segunda consulta. O `id` **nao sai em resposta nenhuma** -- quem o leva
    // para a borda e a contagem, nunca o identificador.
    const { sql } = TODAS.alvo();
    assert.match(sql, /select "?p"?\."?id"? as "?id"?/i);
    const listaDeSelecao = sql.slice(0, sql.toLowerCase().indexOf(' from "user_publications"'));
    assert.equal(
      (listaDeSelecao.match(/ as "/g) ?? []).length,
      1,
      'a resolucao do alvo passou a selecionar mais de uma coluna: ela existe para achar o `id`',
    );
  });

  void it('ISCA -- as contagens sao SUBCONSULTA, e nunca `JOIN` + `GROUP BY`', () => {
    // **Com a juncao o numero sai errado e nao da erro.** Uma publicacao com
    // tres curtidas e dois comentarios viraria SEIS linhas, e as duas contagens
    // sairiam multiplicadas uma pela outra.
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
    // Comentario apagado contaria, e `deleteMyComment` devolveria um numero que
    // nao muda -- o defeito seria invisivel na tela e visivel so na contagem.
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
    // A ausencia e a defesa: contagem guardada divirja das linhas no primeiro
    // caminho que esquecer de atualiza-la, e a divergencia nao aparece em teste
    // nenhum que nao conte as duas coisas.
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
    // A ordem e o inverso da linha do tempo, de proposito: comentario se le na
    // ordem em que a conversa aconteceu. E o cursor TEM de acompanhar -- com o
    // `<` da linha do tempo a pagina seguinte devolveria a anterior, e a lista
    // pararia na primeira virada com `items: []` e um cursor que nunca termina.
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
    // Hoje esta e a UNICA ferramenta que a pessoa tem sobre um comentario
    // alheio: a denuncia de comentario nao existe. Bloquear o autor some com os
    // comentarios dele.
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

  void it('ISCA -- apagar comentario resolve pelo AUTOR DO COMENTARIO, e nao pelo da publicacao', () => {
    // **O dono da publicacao NAO apaga comentario de terceiro.** Isso seria
    // moderacao-por-dono, ninguem a decidiu, e a decisao de 18/10 poe a
    // moderacao no administrador e no backoffice. E pergunta aberta no
    // relatorio desta fatia.
    const { sql, parameters } = TODAS.apagarComentario();
    assert.match(sql, /update "?publication_comments"?/i);
    assert.match(sql, /"?author_user_id"? = \$\d+/);
    assert.match(sql, /"?publication_id"? = \$\d+/);
    assert.match(sql, /"?public_ref"? = \$\d+/);
    assert.match(sql, /"?deleted_at"? is null/i);
    assert.ok(parameters.includes(QUEM_OLHA), 'o autor do comentario nao chegou como parametro');
    assert.ok(!/^delete/i.test(sql.trim()), 'apagar comentario passou a ser DELETE fisico');
  });

  void it('ISCA -- a MUTACAO reprova: o autor removido do apagar-comentario', () => {
    const conferirAutor = (texto: string): void => {
      assert.match(texto, /"?author_user_id"? = \$\d+/);
    };
    conferirAutor(sqlDo('apagarComentario'));
    aMutacaoTemDeReprovar(
      conferirAutor,
      sqlDo('apagarComentario').replace(/"author_user_id" = \$\d+/, 'true'),
      'a conferencia nao enxerga o autor removido: qualquer um apagaria o comentario de qualquer um',
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
    // Nao ha coluna de imagem nem `parent_comment_id` na tabela, entao nao ha o
    // que ler -- e este caso reprova quem as criar sem passar pelo cliente.
    const sql = sqlDo('comentarios');
    for (const agulha of ['parent_comment_id', 'k.image_id', 'comment_image']) {
      assert.ok(!sql.includes(agulha), `\`${agulha}\` entrou na leitura de comentario`);
    }
  });
});
