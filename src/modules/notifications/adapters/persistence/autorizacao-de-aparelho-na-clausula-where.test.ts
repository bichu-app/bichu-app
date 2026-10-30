/** A autorização do aparelho está na cláusula `WHERE`, e o SQL compilado prova. */
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
import type { UserId } from '../../../../shared/types/brands.js';
import type { TokenDeAparelho } from '../../ports/push-sender.js';
import {
  construtorDaListagem,
  construtorDaRemocaoDeTodosDoDono,
  construtorDaRemocaoPeloDono,
  construtorDaRemocaoPorToken,
  construtorDoEnderecoDeEnvio,
  construtorDosAlcancaveis,
} from './kysely-registro-de-aparelhos.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const APARELHO = '018f3a2b-0000-7000-8000-0000000000cc';
const TOKEN = 'fcm-token-de-teste' as TokenDeAparelho;

/** Kysely sem banco: ele compila a consulta e não a executa. */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/** O predicado do dono, como o compilador do Postgres o escreve. */
const PREDICADO_DO_DONO = /"user_id"\s*=\s*\$\d+/;

/** O predicado da permissão. */
const PREDICADO_DA_PERMISSAO = /"push_permission"\s*=\s*\$\d+/;

/** O predicado do token. `is not null` é literal no SQL, não parâmetro. */
const PREDICADO_DO_TOKEN = /"push_token"\s+is\s+not\s+null/i;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

function compilar(construtor: { compile(): Compilada }): Compilada {
  return construtor.compile();
}

void describe('toda consulta endereçada pelo identificador carrega o dono no WHERE', () => {
  void it('a remoção tem `"user_id" = $n`, e o valor ligado é o dono', () => {
    const { sql, parameters } = compilar(construtorDaRemocaoPeloDono(semBanco, DONO, APARELHO));
    assert.match(sql, PREDICADO_DO_DONO, `a remoção perdeu o predicado do dono. SQL: ${sql}`);
    assert.ok(
      parameters.includes(DONO),
      'o dono não está entre os parâmetros ligados: o predicado existe e compara outra coisa',
    );
  });

  void it('a remoção também carrega o identificador do aparelho', () => {
    const { sql, parameters } = compilar(construtorDaRemocaoPeloDono(semBanco, DONO, APARELHO));
    assert.match(sql, /"id"\s*=\s*\$\d+/, `a remoção perdeu o alvo. SQL: ${sql}`);
    assert.ok(parameters.includes(APARELHO));
  });

  void it('a remoção devolve a linha apagada, e não apaga às cegas', () => {
    const { sql } = compilar(construtorDaRemocaoPeloDono(semBanco, DONO, APARELHO));
    assert.match(sql, /returning/i, `a remoção perdeu o RETURNING. SQL: ${sql}`);
  });

  void it('a listagem tem `"user_id" = $n`, e o valor ligado é o dono', () => {
    const { sql, parameters } = compilar(construtorDaListagem(semBanco, DONO));
    assert.match(sql, PREDICADO_DO_DONO, `a listagem perdeu o predicado do dono. SQL: ${sql}`);
    assert.ok(parameters.includes(DONO));
  });

  void it('SEC-019: a remoção de TODOS do dono é endereçada pelo dono, e por nada mais', () => {
    const { sql, parameters } = compilar(construtorDaRemocaoDeTodosDoDono(semBanco, DONO));
    assert.match(
      sql,
      PREDICADO_DO_DONO,
      `a remoção em massa perdeu o predicado do dono: ela apaga a tabela. SQL: ${sql}`,
    );
    assert.ok(
      parameters.includes(DONO),
      'o dono não está entre os parâmetros ligados: o predicado existe e compara outra coisa',
    );
  });

  void it('SEC-019: a remoção de todos NÃO carrega identificador de aparelho', () => {
    const { sql } = compilar(construtorDaRemocaoDeTodosDoDono(semBanco, DONO));
    const comando = sql.split(/\breturning\b/i)[0] ?? sql;
    assert.doesNotMatch(
      comando,
      /"id"\s*=\s*\$\d+/,
      `a remoção em massa ganhou um alvo por identificador. Comando: ${comando}`,
    );
  });

  void it('ISCA: uma consulta SEM o predicado do dono reprova a mesma conferência', () => {
    const semDono = semBanco.deleteFrom('user_devices').where('id', '=', APARELHO);
    assert.doesNotMatch(
      compilar(semDono).sql,
      PREDICADO_DO_DONO,
      'a conferência acusou o dono numa consulta que não o tem: ela virou fonte de ' +
        'achado falso, e é assim que um portão perde a confiança de quem o lê',
    );
  });
});

void describe('a remoção pelo token não recebe dono, e isso é decisão escrita', () => {
  void it('o `WHERE` é o token, e só ele', () => {
    const { sql, parameters } = compilar(construtorDaRemocaoPorToken(semBanco, TOKEN));
    assert.match(sql, /"push_token"\s*=\s*\$\d+/, `SQL: ${sql}`);
    assert.doesNotMatch(
      sql,
      PREDICADO_DO_DONO,
      'a remoção por token ganhou um predicado de dono. Ou a porta mudou, ou alguém ' +
        'está lendo a linha antes para descobrir o dono — que é o que ela evita.',
    );
    assert.ok(parameters.includes(TOKEN));
  });

  void it('apaga UMA linha, e não a conta inteira (critério 4)', () => {
    const { sql } = compilar(construtorDaRemocaoPorToken(semBanco, TOKEN));
    const comando = sql.split(/\breturning\b/i)[0] ?? sql;
    assert.doesNotMatch(
      comando,
      /"user_id"/,
      `a remoção por token alcança a conta. Comando antes do RETURNING: ${comando}`,
    );
    assert.match(sql, /returning/i, 'a remoção por token perdeu o RETURNING');
  });
});

void describe('os critérios 1 e 4 do ADR-0006, escritos nos três lugares', () => {
  const MIGRACOES = 'migrations';

  function migracaoDoAparelho(): string {
    const arquivo = readdirSync(MIGRACOES).find((nome) => nome.includes('aparelho-e-token-de-push'));
    assert.ok(
      arquivo !== undefined,
      'a migração do aparelho sumiu de `migrations/`. Esta conferência não tem o que ' +
        'comparar, e verificação que não consegue verificar precisa REPROVAR.',
    );
    return readFileSync(join(MIGRACOES, arquivo), 'utf8');
  }

  void it('a consulta de alcançáveis exige permissão concedida E token', () => {
    const { sql, parameters } = compilar(construtorDosAlcancaveis(semBanco, [DONO]));
    assert.match(sql, PREDICADO_DA_PERMISSAO, `SQL: ${sql}`);
    assert.match(sql, PREDICADO_DO_TOKEN, `SQL: ${sql}`);
    assert.ok(
      parameters.includes('granted'),
      'o predicado da permissão existe e compara outro valor: `granted` não está ligado',
    );
  });

  void it('a consulta de alcançáveis é DISTINCT: conta e não aparelho', () => {
    assert.match(compilar(construtorDosAlcancaveis(semBanco, [DONO])).sql, /select\s+distinct/i);
  });

  void it('o endereço de envio repete os dois predicados, e não só a existência da linha', () => {
    const { sql } = compilar(construtorDoEnderecoDeEnvio(semBanco, APARELHO));
    assert.match(sql, PREDICADO_DA_PERMISSAO, `SQL: ${sql}`);
    assert.match(sql, PREDICADO_DO_TOKEN, `SQL: ${sql}`);
  });

  void it('o índice parcial da migração declara o MESMO predicado', () => {
    assert.match(
      migracaoDoAparelho(),
      /CREATE INDEX user_devices_alcancaveis[^;]*WHERE\s+push_permission\s*=\s*'granted'\s+AND\s+push_token\s+IS\s+NOT\s+NULL/i,
      'o índice parcial dos alcançáveis não declara mais o mesmo predicado da consulta. ' +
        'Índice que não casa com o WHERE não é usado, e a degradação é silenciosa.',
    );
  });

  void it('os dois índices únicos de cardinalidade continuam na migração', () => {
    const texto = migracaoDoAparelho();
    assert.match(
      texto,
      /CREATE UNIQUE INDEX user_devices_um_token_uma_conta[^;]*WHERE\s+push_token\s+IS\s+NOT\s+NULL/i,
      'o índice "um token, uma conta" sumiu: a reivindicação do aparelho por outra ' +
        'conta deixa de ser a única saída possível, e duas linhas vivas com o mesmo ' +
        'token mandariam o alerta da conta antiga para quem está com o aparelho agora.',
    );
    assert.match(
      texto,
      /CREATE UNIQUE INDEX user_devices_uma_linha_sem_token_por_plataforma[^;]*WHERE\s+push_token\s+IS\s+NULL/i,
      'o índice que limita as linhas sem token sumiu: cada abertura do app de quem ' +
        'negou a permissão passa a inserir uma linha nova, para sempre.',
    );
  });
});
