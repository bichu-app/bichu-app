/**
 * ISCA (e): **a denúncia de publicação usa a que JÁ EXISTE, e desde 20/10/2026 ela
 * confere o alvo.**
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
    let seis = 0;
    for (const item of Object.values(spec.paths)) {
      for (const metodo of METODOS) {
        if (item[metodo]?.tags?.includes('safety') === true) seis += 1;
      }
    }
    assert.equal(seis, 6, 'a etiqueta `safety` mudou de tamanho');
  });

  void it('ISCA (e) -- `ModerationOrigin` continua com as CINCO origens, `publication` entre elas', () => {
    assert.deepEqual(
      [...(spec.components.schemas.ModerationOrigin?.enum ?? [])],
      ['review', 'conversation', 'profile', 'photo', 'publication'],
    );
  });
});
