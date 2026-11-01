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
  void it('ISCA INVERTIDA -- a foto e `thumb_key`, e SO ela', () => {
    const selecao = selecaoDa(sqlDaBusca());
    assert.ok(
      selecao.includes('thumb_key'),
      'a busca deixou de selecionar a foto. A emenda do cliente de 21/10/2026 ' +
        'pede o rosto no resultado para desempatar nomes parecidos.',
    );
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

    for (const proibido of ['image_id', 'photo_image_id', 'id']) {
      assert.doesNotMatch(
        selecao,
        new RegExp(`as "${proibido}"`, 'i'),
        `\`${proibido}\` sai como CAMPO do resultado. Identificador interno nao sai ` +
          'em resposta (ADR-0010 item 6): o que enderaca a imagem fica no servidor, e ' +
          'o que sai e a URL da derivada.',
      );
    }
    const sql = sqlDaBusca().toLowerCase();
    assert.ok(
      !sql.includes('user_showcase_images'),
      'a busca faz juncao com a vitrine. A emenda de 21/10/2026 abriu a foto de ' +
        'perfil (`thumb` de `catalog_images`), e nao a vitrine -- aquela continua ' +
        'presente SO quando `connection_state` e `connected`.',
    );
  });

  void it('ISCA -- a foto sai com os TRES predicados que a tornam servivel', () => {
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
