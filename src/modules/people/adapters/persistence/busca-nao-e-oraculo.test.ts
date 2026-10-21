/**
 * As ISCAS de SQL da **busca de pessoas**: os seis predicados estão na cláusula
 * `WHERE`, e **nada de foto nem de identificador está no `SELECT`**.
 *
 * ## Por que os predicados importam MAIS aqui que no perfil
 *
 * No perfil, quem chama já tem um apelido na mão e a resposta é uma pessoa. Aqui
 * a resposta é uma **lista**, e uma lista entrega informação **por diferença**:
 * quem some da busca de hoje e estava na de ontem bloqueou você. É por isso que
 * estes predicados não são simetria estética — eles são a razão pela qual a
 * busca não é um oráculo.
 *
 * A suíte não tem banco: o `DummyDriver` compila e devolve o texto.
 *
 * ## O que estes casos NÃO provam, e está dito em voz alta
 *
 * Que o Postgres se comporta como o texto diz, e que o índice trigrama é de fato
 * usado. O segundo foi **medido à mão** em 20/10/2026, contra Postgres 16.4 com
 * 5000 linhas em `handles`: `texto_para_busca(handle)` e
 * `texto_para_busca(handle::text)` dão o mesmo `Index Cond` e os dois usam
 * `handles_busca_por_apelido`. Nenhum teste desta suíte mede plano de execução,
 * e o registro daquela medição está no cabeçalho da migração `20261020000012`.
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
import { construtorDaBuscaDePessoas } from './kysely-busca-de-pessoas.js';

const QUEM_BUSCA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const TERMO = 'mar';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const compilada = () => construtorDaBuscaDePessoas(semBanco, TERMO, QUEM_BUSCA, 1, 20);
const sqlDaBusca = (): string => compilada().sql;

/** O trecho entre `SELECT` e o primeiro ` FROM ` — o que de fato sai. */
/**
 * A LISTA DE SELECAO da busca -- o que vira campo de corpo.
 *
 * **O CORTE E EM ` from "handles"` E NAO NO PRIMEIRO ` from `, e a diferenca e
 * um DEFEITO que este portao tinha.** Medido em 21/10/2026: o primeiro ` from `
 * do SQL esta DENTRO da subconsulta de `pets_count`, entao o corte antigo
 * devolvia so os dois primeiros campos e a palavra `select` da subconsulta. Tudo
 * o que fosse selecionado depois dela -- `connections_count`, `total`, e agora a
 * foto -- ficava **invisivel para as assercoes negativas deste arquivo**: um
 * `public_key` acrescentado no fim passaria verde.
 *
 * E o mesmo defeito que o portao irmao de `autorizacao-na-clausula-where.test.ts`
 * ja havia pagado e documentado (*"a primeira versao deste caso contava quatro e
 * reprovava a consulta correta"*). Aqui ele sobreviveu porque as assercoes eram
 * todas negativas: um portao que varre menos do que diz passa por nao achar
 * nada.
 *
 * `from "handles"` e o `FROM` de topo, e ele e unico no SQL -- a busca parte de
 * `handles` e junta `users`.
 */
function selecaoDa(sql: string): string {
  const corte = sql.toLowerCase().indexOf(' from "handles"');
  assert.ok(
    corte > 0,
    'nao achei o `FROM` de topo (` from "handles"`) no SQL da busca. Sem ele este ' +
      'ajudante nao sabe onde a lista de selecao termina, e um portao que corta no ' +
      'lugar errado varre menos do que diz.',
  );
  return sql.slice(0, corte);
}

void describe('a busca de pessoas NAO e um oraculo: os predicados estao no WHERE', () => {
  void it('ISCA -- conta DESABILITADA nao aparece na busca', () => {
    assert.match(
      sqlDaBusca(),
      /conta_habilitada\("?u"?\."?id"?\)/,
      'a decisao de 17/10/2026 e que conta desabilitada "nao e mais encontrada em ' +
        'nenhuma pagina ou funcionalidade" -- e busca e LITERALMENTE ser encontrada. ' +
        'Este e o caso central daquela frase, nao uma aplicacao por analogia.',
    );
  });

  void it('ISCA -- quem DESABILITOU a propria conta nao busca ninguem', () => {
    assert.match(
      sqlDaBusca(),
      /conta_habilitada\(\$\d+::uuid\)/,
      'o lado de QUEM BUSCA saiu do WHERE. Parece redundante e nao e: quem desabilitou ' +
        'a propria conta continua com token valido ate ele vencer.',
    );
  });

  void it('ISCA -- quem te BLOQUEOU nao aparece, e e simetrico', () => {
    assert.match(
      sqlDaBusca(),
      /not\s+bloqueio_entre\(/i,
      'sem este predicado a busca entrega, de uma vez, exatamente o que o bloqueio ' +
        'existe para negar -- e entrega por DIFERENCA: quem some da lista de hoje e ' +
        'estava na de ontem bloqueou voce.',
    );
  });

  void it('ISCA -- perfil que VOCE DENUNCIOU nao volta a aparecer', () => {
    assert.match(
      sqlDaBusca(),
      /not\s+perfil_ocultado_para_quem_denunciou\(/i,
      'a promessa da tela e literal ("Voce nao vai mais ver este conteudo"), e a busca ' +
        'e o lugar mais facil de desfaze-la.',
    );
  });

  void it('ISCA -- apelido de PET e apelido RESERVADO nao entram na busca', () => {
    assert.match(
      sqlDaBusca(),
      /"?kind"?\s*=\s*\$\d+/,
      'o espaco de nomes e compartilhado (`20261018000021`). Sem `kind = pessoa`, a ' +
        'busca devolveria o pet de alguem como se fosse gente -- e viraria um oraculo de ' +
        '"este apelido existe e e de um pet".',
    );
  });

  void it('ISCA -- quem busca NAO aparece na propria busca', () => {
    assert.match(
      sqlDaBusca(),
      /"?u"?\."?id"?\s*<>\s*\$\d+::uuid/,
      'nao e cosmetico: o unico botao de um resultado e "adicionar", e a conta nao se ' +
        'conecta consigo mesma (`user_connections_nao_e_consigo`). Aparecer com um botao ' +
        'que so pode falhar e pior que nao aparecer.',
    );
  });

  void it('ISCA: a varredura REPROVA quando um predicado e removido', () => {
    // Sem esta isca, os seis casos acima passariam por o SQL ter os predicados
    // hoje -- e nao por a varredura reconhecer a falta de um.
    for (const re of [
      /not\s+bloqueio_entre\(/i,
      /not\s+perfil_ocultado_para_quem_denunciou\(/i,
      /conta_habilitada\(\$\d+::uuid\)/,
    ]) {
      const mutilado = sqlDaBusca().replace(re, 'true');
      assert.doesNotMatch(mutilado, re, 'a isca passou: a expressao nao ve a ausencia');
    }
  });
});

void describe('a busca casa nome E apelido, pela normalizacao do banco', () => {
  void it('casa `display_name` e `handle`, os dois por `texto_para_busca`', () => {
    const sql = sqlDaBusca();
    assert.match(
      sql,
      /texto_para_busca\("?u"?\."?display_name"?\)/,
      'o nome tem de casar: o cliente pediu "busca pelo usuario", e nome e o que a ' +
        'pessoa reconhece',
    );
    assert.match(sql, /texto_para_busca\("?h"?\."?handle"?::text\)/, 'o apelido tem de casar');
  });

  void it('ISCA -- o termo passa por `padrao_de_busca`, que neutraliza `%` e `_`', () => {
    assert.match(
      sqlDaBusca(),
      /padrao_de_busca\(\$\d+\)/,
      'sem `padrao_de_busca`, `q=%` e uma consulta legitima do ponto de vista do ' +
        'schema e devolve a TABELA DE CONTAS INTEIRA numa varredura completa -- o ' +
        'caminho de abuso mais barato que existe, e sem nenhum caractere suspeito na URL.',
    );
  });

  void it('a normalizacao NAO acontece em TypeScript: o termo chega cru ao parametro', () => {
    const { parameters } = compilada();
    assert.ok(
      parameters.includes(TERMO),
      'o termo tem de chegar COMO VEIO ao parametro. Normalizar em TypeScript criaria a ' +
        'segunda definicao da normalizacao, e o indice e construido sobre a expressao do ' +
        'BANCO -- as duas divergiriam sem erro, so ficando lentas (`20260928000006`).',
    );
  });
});

void describe('o SELECT da busca nao tem foto, nem identificador, nem endereco', () => {
  // ESTA ISCA FOI **INVERTIDA** EM 21/10/2026, E NAO APAGADA.
  //
  // O QUE ELA DIZIA: *"NENHUMA coluna de foto no SELECT (emenda 5 item 2 do
  // ADR-0010)"*, e proibia tanto as cinco colunas quanto a propria juncao com
  // as tabelas de imagem -- *"sem a juncao nao existe coluna de foto a um
  // caractere de distancia de quem mexer aqui"*.
  //
  // **O cliente emendou a propria decisao**: *"o resultado tras foto sim, para
  // identificar usuarios com nomes parecidos."* Com so o nome, duas
  // `Maria Silva` sao indistinguiveis.
  //
  // **O argumento do "um caractere de distancia" nao desapareceu -- ele mudou
  // de alvo.** Agora que a juncao existe, o que esta a um caractere de
  // distancia e a derivada ERRADA: `public_key` e a `card` de 512 px, e trocar
  // `thumb_key` por ela e uma palavra. Entao a isca passou a travar QUAL
  // coluna, e a lista de proibidas perdeu exatamente uma entrada.
  void it('ISCA INVERTIDA -- a foto e `thumb_key`, e SO ela', () => {
    const selecao = selecaoDa(sqlDaBusca());
    assert.ok(
      selecao.includes('thumb_key'),
      'a busca deixou de selecionar a foto. A emenda do cliente de 21/10/2026 ' +
        'pede o rosto no resultado para desempatar nomes parecidos.',
    );
    // **AS OUTRAS DERIVADAS NAO APARECEM EM LUGAR NENHUM da selecao**, nem como
    // coluna nem dentro de subconsulta: nenhuma delas tem uso legitimo aqui.
    for (const proibida of ['public_key', 'grid_url', 'open_url']) {
      assert.ok(
        !selecao.includes(proibida),
        `\`${proibida}\` esta no SELECT da busca. A derivada do resultado e a ` +
          '`thumb`, a MENOR que existe: a `card` custa cerca de 51 KB por rosto, e ' +
          'numa pagina de vinte isso e rede e memoria de uma lista que a pessoa rola. ' +
          '`grid_url` e `open_url` sao da VITRINE, que continua sendo so de conexao ' +
          'aceita.',
      );
    }

    // **IDENTIFICADOR DE IMAGEM: a conferencia e por APELIDO DE SAIDA, e nao
    // por substring, e a diferenca foi medida.** `users.photo_image_id` e a
    // chave da juncao e aparece DENTRO do `WHERE` da subconsulta -- ele e
    // legitimo e necessario. O que o item 6 do ADR-0010 proibe e ele virar
    // CAMPO, e campo e o que tem `as "<nome>"`. Uma busca por substring
    // reprovava a juncao correta, o que e a forma de um portao que alguem
    // desliga.
    for (const proibido of ['image_id', 'photo_image_id', 'id']) {
      assert.doesNotMatch(
        selecao,
        new RegExp(`as "${proibido}"`, 'i'),
        `\`${proibido}\` sai como CAMPO do resultado. Identificador interno nao sai ` +
          'em resposta (ADR-0010 item 6): o que enderaca a imagem fica no servidor, e ' +
          'o que sai e a URL da derivada.',
      );
    }
    // A vitrine continua fora: a emenda abriu a foto de PERFIL, e nao as fotos
    // que a pessoa publicou.
    const sql = sqlDaBusca().toLowerCase();
    assert.ok(
      !sql.includes('user_showcase_images'),
      'a busca faz juncao com a vitrine. A emenda de 21/10/2026 abriu a foto de ' +
        'perfil (`thumb` de `catalog_images`), e nao a vitrine -- aquela continua ' +
        'presente SO quando `connection_state` e `connected`.',
    );
  });

  void it('ISCA -- a foto sai com os TRES predicados que a tornam servivel', () => {
    // Os tres vieram da projecao da conversa mediada, e nenhum e dispensavel:
    // sem `purpose` a capa de um encontro poderia sair como rosto de gente; sem
    // `status = ready` a foto em `processing` ainda carrega o EXIF do celular, e
    // servi-la entregaria a coordenada de onde ela foi tirada (ADR-0010 item 4);
    // e sem `thumb_key IS NOT NULL` a URL sairia apontando para o nada.
    const sql = sqlDaBusca().toLowerCase();
    for (const re of [
      /foto\.purpose = 'user_photo'/,
      /foto\.status = 'ready'/,
      /foto\.thumb_key is not null/,
    ]) {
      assert.match(sql, re, 'um predicado da foto saiu da subconsulta');
    }
  });

  void it('ISCA -- `users.id` e `public_ref` NAO saem no SELECT', () => {
    const selecao = selecaoDa(sqlDaBusca());
    assert.ok(
      !selecao.includes('public_ref'),
      '`public_ref` existe em `PersonProfile` porque AQUELA tela hospeda denunciar e ' +
        'bloquear. A busca nao hospeda nenhuma das tres, e referencia publica sem uso e ' +
        'superficie de graca.',
    );
    assert.ok(
      !/"?u"?\."?id"?\s+as/.test(selecao),
      '`users.id` nao e necessario aqui: a busca nao pergunta a conexao a modulo ' +
        'nenhum, porque o resultado nao traz `connection_state`. O que nao e ' +
        'selecionado nao tem como vazar (ADR-0010 item 6).',
    );
  });

  void it('ISCA -- NENHUMA coluna de pet alem da contagem', () => {
    const sql = sqlDaBusca();
    for (const proibida of ['p.name', 'p.slug', 'p.species_code', '"name"']) {
      assert.ok(
        !selecaoDa(sql).includes(proibida),
        `\`${proibida}\` esta no SELECT: o item 7 do ADR-0010 abriu a CONTAGEM e so ela.`,
      );
    }
    assert.match(
      sql,
      /select count\(\*\) from pets/i,
      'a contagem de pets e subconsulta correlacionada e nao `LEFT JOIN` com `GROUP BY` ' +
        '-- a diferenca e de vazamento e nao de desempenho: com juncao, `p.name` fica a ' +
        'um caractere de distancia.',
    );
  });

  void it('a pagina e o total saem da MESMA consulta', () => {
    assert.match(
      sqlDaBusca(),
      /count\(\*\) over \(\)/i,
      'duas consultas com os mesmos seis predicados sao duas chances de os predicados ' +
        'divergirem, e a pagina e o total discordariam sem nada acusar.',
    );
  });
});
