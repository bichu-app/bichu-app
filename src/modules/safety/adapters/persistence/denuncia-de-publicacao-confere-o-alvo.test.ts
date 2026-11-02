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

const CONFERENCIAS = {
  /**
   * A AUDIENCIA, e ela e a MESMA da linha do tempo -- por decisao do cliente de
   * 02/11/2026, as duas pontas VERIFICADAS no lugar da conexao aceita.
   *
   * Este arquivo mede o alvo da DENUNCIA, e com a audiencia aberta ele deixou de
   * ser detalhe: a denuncia e a defesa de quem recebe spam de estranho, e uma
   * defesa que responde 404 no que o Mural mostra nao e defesa.
   */
  exigeAudienciaVerificada: (sql: string) => {
    assert.match(
      sql,
      /SELECT 1 FROM users u WHERE u\.id = p\.author_user_id AND \(u\.email_verified_at IS NOT NULL OR u\.phone_verified_at IS NOT NULL\)/,
      'a verificacao do AUTOR saiu do recorte do alvo da denuncia',
    );
    assert.match(
      sql,
      /SELECT 1 FROM users u WHERE u\.id = \$\d+::uuid AND \(u\.email_verified_at IS NOT NULL OR u\.phone_verified_at IS NOT NULL\)/,
      'a verificacao de QUEM DENUNCIA saiu do recorte do alvo: a audiencia e das DUAS pontas',
    );
    assert.match(
      sql,
      /conta_habilitada\(p\.author_user_id\)/,
      'conta DESABILITADA do autor voltou a ser alvo alcancavel',
    );
    assert.match(
      sql,
      /conta_habilitada\(\$\d+::uuid\)/,
      'a conta desabilitada de quem denuncia voltou a alcancar o alvo',
    );
  },
  negaConexaoNaAudiencia: (sql: string) => {
    assert.ok(
      !/user_connections/i.test(sql),
      'o alvo da denuncia voltou a depender de `user_connections`, e DIVERGIU da linha do tempo: o Mural mostraria a publicacao do estranho e a denuncia dela responderia 404',
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
  void it('ISCA (e) -- exige AS DUAS PONTAS VERIFICADAS, com as contas habilitadas', () => {
    const { sql } = alvo();
    CONFERENCIAS.exigeAudienciaVerificada(sql);
    CONFERENCIAS.negaConexaoNaAudiencia(sql);
  });

  void it('ISCA (e) -- a MUTACAO reprova: a verificacao do AUTOR removida', () => {
    assert.throws(
      () =>
        CONFERENCIAS.exigeAudienciaVerificada(
          alvo().sql.replace(
            'SELECT 1 FROM users u WHERE u.id = p.author_user_id AND (u.email_verified_at IS NOT NULL OR u.phone_verified_at IS NOT NULL)',
            'SELECT 1',
          ),
        ),
      'a conferencia da audiencia nao mede a verificacao do autor',
    );
  });

  void it('ISCA (e) -- a MUTACAO reprova: `conta_habilitada` do autor removida', () => {
    assert.throws(
      () =>
        CONFERENCIAS.exigeAudienciaVerificada(
          alvo().sql.replace('conta_habilitada(p.author_user_id)', 'true'),
        ),
      'a conferencia nao enxerga a conta desabilitada: a perda silenciosa de tirar o `EXISTS` das conexoes',
    );
  });

  void it('ISCA (e) -- O DEFEITO REPLANTADO: o filtro de conexao de volta no alvo reprova PELO NOME', () => {
    assert.throws(
      () =>
        CONFERENCIAS.negaConexaoNaAudiencia(
          alvo().sql.replace(
            'conta_habilitada(p.author_user_id)',
            "EXISTS (SELECT 1 FROM user_connections uc WHERE uc.state = 'accepted')",
          ),
        ),
      'a conferencia nao enxerga o filtro de conexao replantado: o alvo da denuncia poderia divergir da linha do tempo sem ninguem notar',
    );
  });

  void it('ISCA (e) -- a perna do PROPRIO AUTOR existe, e e ela que torna `eu_mesmo` alcancavel', () => {
    assert.match(
      alvo().sql,
      /p\.author_user_id = \$\d+::uuid\s*\n?\s*OR\b/,
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
