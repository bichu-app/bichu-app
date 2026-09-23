/**
 * A autorização do aparelho está na cláusula `WHERE`, e o SQL compilado prova.
 *
 * ## Por que conferir o SQL e não o comportamento
 *
 * O teste de comportamento — "a conta B não remove o aparelho da conta A" —
 * existe, roda contra Postgres de verdade e está em
 * `tests/integration/aparelho-e-token-de-push.test.ts`. Ele é necessário e não
 * é suficiente pelo mesmo motivo do arquivo irmão da BICHUS-92: ele passa igual
 * se a consulta trouxer a linha de A e um `if` na aplicação a descartar depois.
 * As duas implementações são indistinguíveis pelo lado de fora **até** o dia em
 * que alguém mexe no `if`, e aí não existe teste que acuse, porque o `if` era o
 * teste.
 *
 * ## O terceiro grupo: o mesmo predicado em três lugares
 *
 * Os critérios 1 e 4 do ADR-0006 estão escritos três vezes, e não por descuido:
 * uma no domínio (`podeReceberPush`), uma no `WHERE` da consulta de alcance, e
 * uma no predicado parcial do índice `user_devices_alcancaveis`. As três
 * precisam dizer a mesma coisa — se o índice divergir, o Postgres para de
 * usá-lo e a consulta do pânico vira varredura sem ninguém perceber; se a
 * consulta divergir do domínio, o número da tela deixa de significar o que o
 * domínio afirma.
 *
 * A conferência é textual e o alcance dela está dito: ela pega a divergência de
 * PREDICADO, não a de semântica. Uma consulta que trocasse `granted` por
 * `denied` nas três ao mesmo tempo passaria por aqui — quem pega isso é
 * `aparelho.test.ts`, que mede o valor.
 *
 * ## As iscas, e como foram provadas
 *
 * Desligadas em `kysely-registro-de-aparelhos.ts` e na migração, rodadas e
 * vistas reprovar em 22/09/2026, e depois restauradas:
 *
 * | o que foi desligado | reprovaram, aqui |
 * |---|---|
 * | `.where('user_id', '=', dono)` removido de `construtorDaRemocaoPeloDono` | 1 caso |
 * | `.where('user_id', '=', dono)` removido de `construtorDaListagem` | 1 caso |
 * | `=` virando `is not` em `construtorDaRemocaoPeloDono` | 1 caso |
 * | `.where('push_permission', '=', 'granted')` removido dos alcançáveis | 1 caso |
 * | os dois predicados removidos de `construtorDoEnderecoDeEnvio` | 1 caso |
 * | `WHERE push_permission = 'granted' AND push_token IS NOT NULL` tirado do índice | 1 caso |
 * | `CREATE UNIQUE INDEX user_devices_um_token_uma_conta` virando índice comum | 1 caso |
 *
 * A terceira linha é a que justifica a regex cobrar o OPERADOR junto do nome:
 * `is not $1` casa toda linha da tabela, e uma conferência que só procurasse
 * `user_id` no texto aprovaria.
 *
 * As duas primeiras reprovam **também** contra Postgres de verdade, e vale
 * registrar o par: `tests/integration/aparelho-e-token-de-push.test.ts` acusou
 * 1 caso com o predicado do dono removido. Este arquivo pega o mesmo defeito
 * sem banco, em milissegundos; aquele pega o que este não vê.
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

/**
 * Kysely sem banco: ele compila a consulta e não a executa.
 *
 * É o caminho REAL — o mesmo construtor e o mesmo compilador de dialeto que a
 * aplicação usa. Um SQL escrito à mão aqui seria o atalho que parece
 * equivalente e esconde exatamente o que se foi conferir.
 */
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

/** O predicado da permissão. A regex cobra o operador junto do nome. */
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
    // `RETURNING` é o que distingue 204 de 404 sem um `SELECT` antes. Sem ele,
    // a rota responderia 204 para o identificador de outra conta — que é o
    // oráculo ao contrário: esconder o 404 também é mentir.
    const { sql } = compilar(construtorDaRemocaoPeloDono(semBanco, DONO, APARELHO));
    assert.match(sql, /returning/i, `a remoção perdeu o RETURNING. SQL: ${sql}`);
  });

  void it('a listagem tem `"user_id" = $n`, e o valor ligado é o dono', () => {
    const { sql, parameters } = compilar(construtorDaListagem(semBanco, DONO));
    assert.match(sql, PREDICADO_DO_DONO, `a listagem perdeu o predicado do dono. SQL: ${sql}`);
    assert.ok(parameters.includes(DONO));
  });

  void it('SEC-019: a remoção de TODOS do dono é endereçada pelo dono, e por nada mais', () => {
    // Sem o predicado, isto é `DELETE FROM user_devices` — "sair de todos os
    // aparelhos" de uma conta apagaria o endereço de entrega de todo mundo, e o
    // produto inteiro pararia de avisar sobre pet perdido.
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
    // O `WHERE` é a autorização inteira (ADR-0021), e não há recurso vindo de
    // fora. Um `"id" = $n` aqui significaria que alguém passou a aceitar do
    // cliente qual aparelho poupar — que é a porta para quem está com o
    // telefone roubado informar o dele.
    const { sql } = compilar(construtorDaRemocaoDeTodosDoDono(semBanco, DONO));
    const comando = sql.split(/\breturning\b/i)[0] ?? sql;
    assert.doesNotMatch(
      comando,
      /"id"\s*=\s*\$\d+/,
      `a remoção em massa ganhou um alvo por identificador. Comando: ${comando}`,
    );
  });

  void it('ISCA: uma consulta SEM o predicado do dono reprova a mesma conferência', () => {
    // Sem isto, os casos acima mediriam a capacidade de casar uma regex contra
    // um texto que sempre a contém, e continuariam verdes no dia em que a
    // conferência parasse de enxergar.
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
    // O argumento está no cabeçalho da porta: o que o FCM devolve ao recusar é
    // o token, não a conta. Exigir o dono aqui obrigaria a LER a linha para
    // descobrir de quem ela é — a forma "leia e confira depois" que a ADR-0021
    // existe para eliminar.
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
    // "sem derrubar o envio para os outros aparelhos do mesmo usuário" é isto:
    // o alvo é o token, que o índice único garante endereçar uma linha só.
    //
    // A conferência é sobre o COMANDO, não sobre o SQL inteiro: `user_id`
    // aparece legitimamente no `RETURNING`, que é como o serviço descobre de
    // quem era o aparelho para escrever na trilha. O que não pode aparecer é
    // uma coluna de conta no que decide QUAIS linhas saem.
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
    // Não achar alvo é reprovação, nunca aprovação: sem a migração, os casos
    // abaixo ficariam verdes por não ter o que comparar.
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
    // Sem `distinct`, três aparelhos alcançáveis da mesma pessoa virariam três
    // linhas — e quem contasse linhas contaria aparelhos chamando-os de
    // tutores. O tipo de retorno (`Set`) esconde o defeito da tela e não do
    // relatório.
    assert.match(compilar(construtorDosAlcancaveis(semBanco, [DONO])).sql, /select\s+distinct/i);
  });

  void it('o endereço de envio repete os dois predicados, e não só a existência da linha', () => {
    // É o que faz a releitura no instante do envio valer alguma coisa. Sem
    // eles, um aparelho que perdeu a permissão entre a montagem da lista e o
    // envio continuaria recebendo.
    const { sql } = compilar(construtorDoEnderecoDeEnvio(semBanco, APARELHO));
    assert.match(sql, PREDICADO_DA_PERMISSAO, `SQL: ${sql}`);
    assert.match(sql, PREDICADO_DO_TOKEN, `SQL: ${sql}`);
  });

  void it('o índice parcial da migração declara o MESMO predicado', () => {
    // Se o índice divergir da consulta, o Postgres para de usá-lo e a busca do
    // segundo seguinte ao "meu pet sumiu" vira varredura da tabela — sem erro,
    // sem aviso, e só perceptível sob carga.
    assert.match(
      migracaoDoAparelho(),
      /CREATE INDEX user_devices_alcancaveis[^;]*WHERE\s+push_permission\s*=\s*'granted'\s+AND\s+push_token\s+IS\s+NOT\s+NULL/i,
      'o índice parcial dos alcançáveis não declara mais o mesmo predicado da consulta. ' +
        'Índice que não casa com o WHERE não é usado, e a degradação é silenciosa.',
    );
  });

  void it('os dois índices únicos de cardinalidade continuam na migração', () => {
    const texto = migracaoDoAparelho();
    // O primeiro é o que faz o critério 3 valer quando o app não conseguiu
    // chamar `DELETE` (logout sem rede, ADR-0002 §5). O segundo é o que impede
    // a tabela de crescer sem limite com linhas sem token.
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
