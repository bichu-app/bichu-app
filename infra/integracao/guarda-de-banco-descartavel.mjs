#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint
// deste repositorio nao declara os globais de Node para `**/*.mjs` fora de
// `src/`, entao `console` e `process` reprovariam em `no-undef`.
/**
 * O banco em que a suite de integracao vai escrever tem que se declarar
 * descartavel. Se nao se declarar, o processo morre aqui.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * `tests/integration/` escreve: cria conta, revoga sessao, insere em
 * `audit.events`, e a suite de limite de chamada chama `reset()`, que APAGA
 * `rate_limit_counters` inteira. Nada disso pode acontecer num banco de
 * verdade.
 *
 * O ambiente de integracao e gerado com valores falsos, mas `DATABASE_URL` e
 * uma variavel de ambiente como qualquer outra: basta alguem exporta-la no
 * shell, ou apontar o `.env.integracao` para outro lugar, e a suite passa a
 * escrever onde ninguem quis. Um `.env` de teste protege contra engano, nao
 * contra um `DATABASE_URL=...` digitado por cima.
 *
 * Entao a pergunta nao e feita ao ambiente, e sim AO BANCO: o comentario do
 * proprio banco de dados precisa dizer que ele e descartavel. Quem provisiona o
 * banco de teste declara isso uma vez (`rodar.mjs` faz, e o job da esteira
 * tambem); um banco de producao nunca vai ter esse comentario, e a suite morre
 * antes da primeira escrita, dizendo qual banco ela recusou.
 *
 * `COMMENT ON DATABASE` foi escolhido de proposito em vez de uma tabela ou uma
 * linha: ele e do BANCO e nao do esquema, entao ele sobrevive a `migrate down`,
 * a `TRUNCATE` e a qualquer coisa que a suite faca com o conteudo. E ele nao e
 * dado da aplicacao: nenhuma migracao o escreve, nenhum `pg_dump` de producao o
 * traz junto.
 * ===========================================================================
 */
import { Client } from 'pg';

export const MARCA = 'bichu:integracao:descartavel';

export const SQL_PARA_MARCAR = (banco) =>
  `COMMENT ON DATABASE "${banco}" IS '${MARCA}'`;

function semSenha(url) {
  return url.replace(/:[^:@/]*@/, ':***@');
}

export async function exigirBancoDescartavel(url = process.env.DATABASE_URL) {
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL nao esta definida. A suite de integracao nao tem banco para conferir, ' +
        'e passar verde sem banco e o defeito que ela existe para nao ter. ' +
        'Rode `npm run test:integration`, que sobe a pilha efemera e aponta esta variavel.',
    );
  }

  const cliente = new Client({ connectionString: url });
  try {
    await cliente.connect();
  } catch (erro) {
    throw new Error(
      `a guarda de banco descartavel nao conseguiu conectar em ${semSenha(url)}: ` +
        `${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }

  try {
    const { rows } = await cliente.query(
      `select current_database() as banco,
              inet_server_addr()::text as servidor,
              shobj_description(d.oid, 'pg_database') as marca
         from pg_database d
        where d.datname = current_database()`,
    );
    const linha = rows[0];
    if (linha === undefined) {
      throw new Error(`o catalogo nao devolveu linha para ${semSenha(url)}. Nada a afirmar, entao reprova.`);
    }
    if (linha.marca !== MARCA) {
      throw new Error(
        'RECUSADO: este banco nao se declara descartavel.\n' +
          `  banco:     ${String(linha.banco)}\n` +
          `  servidor:  ${String(linha.servidor ?? 'socket local')}\n` +
          `  destino:   ${semSenha(url)}\n` +
          `  marca:     ${linha.marca === null ? '(nenhuma)' : String(linha.marca)}\n` +
          `  esperada:  ${MARCA}\n\n` +
          'A suite de integracao ESCREVE: cria conta, revoga sessao, insere em audit.events e ' +
          'apaga rate_limit_counters inteira. Ela so roda em banco que alguem declarou ' +
          'descartavel com:\n' +
          `    ${SQL_PARA_MARCAR('<banco>')}\n\n` +
          'Se voce esta vendo isto rodando `npm run test:integration`, a pilha efemera nao ' +
          'subiu ou DATABASE_URL foi sobrescrita no ambiente.',
      );
    }
    return linha;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1]?.endsWith('guarda-de-banco-descartavel.mjs')) {
  const linha = await exigirBancoDescartavel();
  console.log(`banco descartavel confirmado: ${String(linha.banco)} (${MARCA})`);
}
