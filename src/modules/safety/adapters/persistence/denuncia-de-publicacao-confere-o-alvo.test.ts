/**
 * ISCA (e): **a denúncia de publicação usa a que JÁ EXISTE, e desde 20/10/2026
 * ela confere o alvo.**
 *
 * ## O buraco que estes casos fecham, e ele estava declarado
 *
 * `publication_reports` nasceu em 18/10/2026 **sem hospedeiro**: a tabela de
 * publicações não existia, a escrita gravava a denúncia com o endereço recebido
 * e não conferia nada. O custo estava dito em voz alta no próprio código —
 * *"hoje esta rota aceita um endereço de publicação que não existe, e grava a
 * denúncia dele"* — e a chave estrangeira que faltava estava escrita e comentada
 * no fim da migração `20261018000032`.
 *
 * **Nada disso foi substituído.** A operação `reportPublication` é a mesma, a
 * etiqueta `safety` continua com SEIS operações, a tabela é a mesma, a lista de
 * cinco motivos é a mesma e a função
 * `publicacao_ocultada_para_quem_denunciou` é a mesma. O que entrou foi a
 * conferência de alvo e a chave estrangeira.
 *
 * ## Por que o recorte da denúncia é o MESMO da leitura
 *
 * Sem o predicado de conexão aceita, qualquer conta poderia perguntar *"este
 * endereço existe?"* pelo desfecho da denúncia: `202` quando existe, `404`
 * quando não. É um oráculo, e o ADR-0021 recusa justamente isso.
 *
 * E ser **o mesmo** não é simetria decorativa: mais frouxo faria a denúncia ser
 * a leitura que a linha do tempo recusa; mais apertado deixaria publicação
 * visível e não denunciável — e o ponto de acesso da denúncia é o próprio
 * cartão, que só aparece na linha do tempo.
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
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';

import type { Database } from '../../../../shared/db/schema.js';
import type { UserId } from '../../../../shared/types/brands.js';
import { construtorDoAlvoDaPublicacao } from './kysely-safety-repository.js';

const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const REF = 'AaBbCcDdEeFfGgHhIiJjKk';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const alvo = () => construtorDoAlvoDaPublicacao(semBanco, REF, CHAMADOR);

/** A conferência, como função, para a isca de mutação chamar a MESMA. */
const CONFERENCIAS = {
  exigeConexaoAceita: (sql: string) => {
    assert.match(sql, /from user_connections uc/i, 'o predicado de conexao saiu do WHERE');
    assert.match(sql, /uc\.state = 'accepted'/, 'pendente nao e aceite');
    assert.match(
      sql,
      /uc\.requester_user_id = p\.author_user_id AND uc\.addressee_user_id = \$\d+::uuid/,
      'um sentido do par saiu',
    );
    assert.match(
      sql,
      /uc\.requester_user_id = \$\d+::uuid AND uc\.addressee_user_id = p\.author_user_id/,
      'o OUTRO sentido do par saiu',
    );
  },
  negaBloqueio: (sql: string) => {
    assert.match(sql, /NOT bloqueio_entre\(p\.author_user_id, \$\d+::uuid\)/);
  },
  negaApagada: (sql: string) => {
    assert.match(sql, /"?p"?\."?deleted_at"? is null/i);
  },
} as const;

void describe('ISCA (e): a denuncia de publicacao confere o alvo, com o recorte da leitura', () => {
  void it('ISCA (e) -- exige CONEXAO ACEITA nos dois sentidos, com as contas habilitadas', () => {
    const { sql } = alvo();
    CONFERENCIAS.exigeConexaoAceita(sql);
    assert.match(
      sql,
      /conta_habilitada\(uc\.requester_user_id\)[\s\S]*conta_habilitada\(uc\.addressee_user_id\)/,
    );
  });

  void it('ISCA (e) -- a MUTACAO reprova: `pending` no lugar de `accepted`', () => {
    assert.throws(
      () => CONFERENCIAS.exigeConexaoAceita(alvo().sql.replace("uc.state = 'accepted'", "uc.state = 'pending'")),
      'a conferencia de aceite nao mede nada',
    );
  });

  void it('ISCA (e) -- a MUTACAO reprova: o `EXISTS` inteiro removido', () => {
    assert.throws(
      () => CONFERENCIAS.exigeConexaoAceita(alvo().sql.replace(/EXISTS \([\s\S]*?\)\)/, 'true')),
      'a conferencia nao enxerga o recorte inteiro removido: a denuncia voltaria a ser oraculo de existencia',
    );
  });

  void it('ISCA (e) -- a perna do PROPRIO AUTOR existe, e e ela que torna `eu_mesmo` alcancavel', () => {
    // **Sem esta perna o desfecho `eu_mesmo` e CODIGO MORTO**, e a rota responde
    // `404` a quem denuncia o proprio texto -- ninguem tem aresta de conexao
    // consigo, entao a propria publicacao caia no mesmo `ausente` de
    // inexistente.
    //
    // E `404` ali e o desenho errado: `CAMPO_E_CODIGO.publication` existe em
    // `safety-routes.ts` desde 18/10 com a mensagem *"Esta publicacao e sua.
    // Para tira-la do ar, apague-a."* -- o produto JA decidiu que este caso e
    // `400 own_publication`, com a saida que o resolve.
    //
    // **Medido a mao contra Postgres**: antes da perna, `404`; com ela, `400`
    // com `code: own_publication`.
    assert.match(
      alvo().sql,
      /p\.author_user_id = \$\d+::uuid\s*\n?\s*or exists/i,
      'a perna do proprio autor saiu da consulta do alvo: `eu_mesmo` voltou a ser codigo morto',
    );
  });

  void it('ISCA (e) -- nega bloqueio, e a MUTACAO sem `NOT` reprova', () => {
    const { sql } = alvo();
    CONFERENCIAS.negaBloqueio(sql);
    assert.throws(() => CONFERENCIAS.negaBloqueio(sql.replace('NOT bloqueio_entre', 'bloqueio_entre')));
  });

  void it('ISCA (e) -- publicacao APAGADA nao tem alvo, e a MUTACAO reprova', () => {
    const { sql } = alvo();
    CONFERENCIAS.negaApagada(sql);
    assert.throws(() => CONFERENCIAS.negaApagada(sql.replace(/"p"\."deleted_at" is null/i, 'true')));
  });

  void it('ISCA (e) -- nao ha `UNION` nem `CASE`: 404 e nunca 403', () => {
    const { sql } = alvo();
    assert.ok(!/\bUNION\b/i.test(sql));
    assert.ok(!/\bCASE\s+WHEN\b/i.test(sql));
  });

  void it('ISCA (e) -- quem chama entra como PARAMETRO, nunca interpolado', () => {
    const { sql, parameters } = alvo();
    assert.ok(!sql.includes(CHAMADOR), 'a conta de quem chama foi INTERPOLADA no texto do SQL');
    assert.ok(parameters.includes(CHAMADOR));
    assert.ok(parameters.includes(REF));
  });

  void it('CONTRAPESO -- o alvo SELECIONA id, autor e o corpo que a denuncia congela', () => {
    // Sem ele, as iscas de omissao passariam num mundo em que a consulta nao
    // devolve nada -- e sem `corpo` a denuncia perde o texto CONGELADO, que e o
    // que o administrador julga.
    const { sql } = alvo();
    assert.match(sql, /"?p"?\."?id"? as "?id"?/);
    assert.match(sql, /"?p"?\."?author_user_id"? as "?autor"?/);
    assert.match(sql, /"?p"?\."?body"? as "?corpo"?/);
    assert.match(sql, /from "?user_publications"? as "?p"?/i);
  });
});

void describe('ISCA (e): a denuncia que existia NAO foi substituida por outra', () => {
  const spec = parseYaml(readFileSync('api/openapi.yaml', 'utf8')) as {
    paths: Record<string, Record<string, { operationId?: string; tags?: readonly string[] }>>;
    components: { schemas: Record<string, { enum?: readonly string[] }> };
  };
  const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

  void it('ISCA (e) -- `reportPublication` continua a UNICA operacao de denuncia de publicacao', () => {
    const denunciasDePublicacao: string[] = [];
    for (const [caminho, item] of Object.entries(spec.paths)) {
      for (const metodo of METODOS) {
        const operacao = item[metodo];
        if (operacao === undefined) continue;
        if (/publication/i.test(operacao.operationId ?? '') && /report/i.test(operacao.operationId ?? '')) {
          denunciasDePublicacao.push(`${metodo} ${caminho}`);
        }
      }
    }
    assert.deepEqual(
      denunciasDePublicacao,
      ['post /publications/{publicationRef}/reports'],
      'alguem criou uma SEGUNDA denuncia de publicacao: a instrucao desta fatia era LIGAR a ' +
        'que ja existe, e duas tabelas de denuncia do mesmo alvo sao duas filas no painel',
    );
  });

  void it('ISCA (e) -- a etiqueta `safety` continua com SEIS operacoes', () => {
    // O Mural tem etiqueta propria (`publications`). Uma operacao do Mural que
    // tivesse caido em `safety` apareceria aqui.
    let seis = 0;
    for (const item of Object.values(spec.paths)) {
      for (const metodo of METODOS) {
        if (item[metodo]?.tags?.includes('safety') === true) seis += 1;
      }
    }
    assert.equal(seis, 6, 'a etiqueta `safety` mudou de tamanho');
  });

  void it('ISCA (e) -- `ModerationOrigin` continua com as CINCO origens, `publication` entre elas', () => {
    // A perna `publication` da visao `fila_de_moderacao` e o valor do enum JA
    // existiam em `development` (migracao `20261018000032`, secao 7): esta
    // fatia nao os criou, e este caso reprova quem os remover achando que eram
    // desta frente.
    assert.deepEqual(
      [...(spec.components.schemas.ModerationOrigin?.enum ?? [])],
      ['review', 'conversation', 'profile', 'photo', 'publication'],
    );
  });
});
