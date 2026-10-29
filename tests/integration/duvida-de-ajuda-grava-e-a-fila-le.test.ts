/**
 * A DUVIDA DE AJUDA, CONTRA POSTGRES: a rota grava e a consulta do painel le.
 *
 * Pedido do cliente de 29/10/2026 ("no menu do usuario, adicione um botao de
 * ajuda, que abrira uma pagina com um formulario de duvida"), na decisao dele
 * de destino: **grava no banco e vai para o backoffice**, **sem notificacao por
 * e-mail**.
 *
 * ## O QUE ESTE ARQUIVO PROVA, E POR QUE ELE PRECISA DE BANCO
 *
 * Duas coisas, e nenhuma das duas cabe num duble.
 *
 * 1. **A MIGRACAO EXISTE E A TABELA ACEITA A LINHA.** `20261029000010` cria
 *    `help_requests` com dois `CHECK` e uma FK. Sem ela, o `INSERT` estoura no
 *    Postgres -- e e por isso que a prova tem de ser contra o Postgres: o
 *    duble em memoria aceitaria a escrita e o arquivo ficaria verde com a
 *    tabela inexistente.
 *
 * 2. **A DUVIDA GRAVADA E LEGIVEL PELA CONSULTA QUE O PAINEL VAI USAR.** Esta
 *    e a metade que costuma faltar. Sem ela, a funcionalidade nasce com
 *    entrada e **sem porta de saida**: linha gravada que nenhuma consulta
 *    alcanca, e que ninguem descobre estar inalcancavel ate o dia de construir
 *    a tela. O caso de baixo escreve pela ROTA e le pela porta
 *    `listarAFila` -- a mesma que a rota administrativa vai chamar quando
 *    existir.
 *
 * ## COMO VER CADA CASO REPROVAR
 *
 * - **Sem a migracao** (`git rm` o arquivo e `make reset`): reprova
 *   `a duvida mandada pela rota chega em help_requests` -- o `INSERT` nao acha
 *   a tabela e a rota responde 500.
 * - **Sem a rota** (comente `registrarRota` em `help-request-routes.ts`):
 *   reprova o mesmo caso, agora por 404.
 * - **Sem a leitura** (troque `orderBy('created_at', 'desc')` por `'asc'` em
 *   `kysely-duvidas-de-ajuda.ts`): reprova
 *   `a fila do painel devolve a mais nova primeiro`.
 *
 * ## O TETO E PROVADO NOS DOIS LADOS, E NAO SO NO QUE RECUSA
 *
 * Um caso manda o teto EXATO e espera `202`; o outro manda teto mais um e
 * espera `400`. So o segundo passaria num servidor que recusasse tudo.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { registrarRotasDeAjuda } from '../../src/modules/support/adapters/http/help-request-routes.js';
import { criarDuvidasDeAjuda } from '../../src/modules/support/adapters/persistence/kysely-duvidas-de-ajuda.js';
import { criarDuvidaDeAjudaService } from '../../src/modules/support/application/duvida-de-ajuda-service.js';
import type { DuvidasDeAjuda } from '../../src/modules/support/ports/duvidas-de-ajuda.js';
import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import type { RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { UserId } from '../../src/shared/types/brands.js';

const PREFIXO_DA_API = '/v1';
const CAMINHO = '/me/help-requests';

let banco: { db: Db; close: () => Promise<void> };
let app: RegistradorDeRotas;
let base: string;
let fila: DuvidasDeAjuda;
/** A conta que manda as duvidas. O `after` a apaga, e a FK leva as duvidas. */
let autor: UserId;

async function chamar(corpo: unknown): Promise<{ status: number; corpo: unknown }> {
  const resposta = await fetch(`${base}${PREFIXO_DA_API}${CAMINHO}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: 'Bearer token-de-teste',
    },
    body: JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto === '' ? undefined : JSON.parse(texto) };
}

before(async () => {
  const config = loadAppConfig();
  const contrato = carregarContrato(config.openapiSpecPath);

  banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());

  // A CONTA, inserida direto: o que este arquivo mede e a duvida, e levantar a
  // fiacao inteira de identidade so para ter um `author_user_id` valido poria
  // meia duzia de servicos entre o defeito e a mensagem de falha.
  autor = ids.uuidv7() as UserId;
  await db
    .insertInto('users')
    .values({
      id: autor,
      email: `ajuda-${randomUUID().slice(0, 8)}@exemplo.invalido`,
      public_ref: Buffer.from(ids.random128()).toString('base64url'),
      display_name: 'Tutor de Teste',
      birth_date: '1990-01-01',
      sessions_invalid_before: new Date(0),
      created_at: new Date(),
      updated_at: new Date(),
    })
    .execute();

  fila = criarDuvidasDeAjuda(db, ids);

  app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    teto: tetoDeTeste(),
  });

  // A FUNCAO DE PRODUCAO, a mesma que `src/bin/api.ts` chama. O autenticador e
  // o unico duble, e de proposito: o que esta sob prova e a duvida, nao o
  // token.
  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeAjuda(escopo, {
        duvidas: criarDuvidaDeAjudaService(fila, systemClock),
        autenticador: { autenticar: () => Promise.resolve({ userId: autor }) },
        contrato,
      });
      pronto();
    },
    { prefix: PREFIXO_DA_API },
  );

  await app.listen({ port: 0, host: '127.0.0.1' });
  const endereco = app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${String(endereco.port)}`;
});

after(async () => {
  if (app !== undefined) await app.close();
  if (banco !== undefined) {
    // A FK e `ON DELETE CASCADE`: apagar a conta leva as duvidas dela. Este
    // `after` tambem e, de lambuja, a prova de que a cascata declarada em
    // `CHAVES_ESTRANGEIRAS` e a que o banco tem -- sem ela, este `DELETE`
    // estouraria por violacao de chave estrangeira.
    await banco.db.deleteFrom('users').where('id', '=', autor).execute();
    await banco.close();
  }
});

void describe('A duvida de ajuda grava em help_requests, e a fila do painel a le', () => {
  void it('a duvida mandada pela rota chega em help_requests', async () => {
    const resposta = await chamar({
      subject: 'Nao salva o segundo pet',
      body: 'Toda vez que eu aperto salvar, a tela volta para o comeco.',
    });

    assert.equal(
      resposta.status,
      202,
      `REPROVA: a rota respondeu ${String(resposta.status)}. 404 = a rota nao esta ` +
        'registrada em `registrarRotasDeAjuda`; 500 = a migracao `20261029000010` nao ' +
        `foi aplicada e \`help_requests\` nao existe. Corpo: ${JSON.stringify(resposta.corpo)}`,
    );
    // O CORPO, medido. **Nada neste repositorio confere corpo de resposta**:
    // so o corpo da REQUISICAO e validado contra o contrato.
    assert.deepEqual(resposta.corpo, { status: 'accepted' });

    const linhas = await fila.listarAFila(10);
    const minha = linhas.find((l) => l.assunto === 'Nao salva o segundo pet');
    assert.ok(
      minha !== undefined,
      'REPROVA: a rota respondeu 202 e a consulta do painel NAO acha a linha. E o ' +
        'desfecho pior de todos: o tutor ve o recado de recebido, espera resposta, e ' +
        'a fila esta vazia -- indistinguivel de um dia em que ninguem perguntou nada.',
    );
    assert.equal(minha.autor, autor, 'REPROVA: o autor gravado nao e o da sessao.');
    assert.equal(
      minha.texto,
      'Toda vez que eu aperto salvar, a tela volta para o comeco.',
      'REPROVA: o texto gravado nao e o texto mandado.',
    );
  });

  void it('a fila do painel devolve a mais nova primeiro', async () => {
    const marca = randomUUID().slice(0, 8);
    await chamar({ subject: `Primeira ${marca}`, body: 'Mandada antes.' });
    await chamar({ subject: `Segunda ${marca}`, body: 'Mandada depois.' });

    const linhas = await fila.listarAFila(50);
    const minhas = linhas.filter((l) => l.assunto.endsWith(marca));
    assert.equal(
      minhas.length,
      2,
      'REPROVA: a consulta do painel nao devolveu as duas. Duvida repetida NAO e ' +
        'deduplicada de proposito: quem manda duas vezes mandou duas.',
    );
    assert.equal(
      minhas[0]?.assunto,
      `Segunda ${marca}`,
      'REPROVA: a fila veio da mais velha para a mais nova. A ordem e ' +
        '`created_at desc`, que e a que o indice `help_requests_da_fila` serve -- ' +
        'trocar a ordem aqui deixa o indice sem leitor e poe o que chegou hoje no ' +
        'fim de uma lista que ninguem rola ate o fim.',
    );
  });

  void it('o teto EXATO passa -- o controle positivo da recusa', async () => {
    const resposta = await chamar({ subject: 'a'.repeat(120), body: 'b'.repeat(4000) });
    assert.equal(
      resposta.status,
      202,
      `REPROVA: o teto exato foi recusado com ${String(resposta.status)}. Sem este caso, ` +
        'um `CHECK` apertado demais, ou um `maxLength` errado, passaria pelo caso de ' +
        'baixo sem ninguem notar -- portao que reprova tudo some do CI tao rapido ' +
        'quanto portao que aprova tudo.',
    );
  });

  void it('estourar o teto e 400, e NADA e gravado -- recusa com mensagem, nunca corte', async () => {
    const marca = randomUUID().slice(0, 8);
    const resposta = await chamar({ subject: `X${marca}`, body: 'b'.repeat(4001) });
    assert.equal(
      resposta.status,
      400,
      `REPROVA: 4001 caracteres passaram com ${String(resposta.status)}. Se passou 202, o ` +
        '`maxLength: 4000` do contrato nao esta recusando antes do handler e o `CHECK` ' +
        'do banco virou a primeira linha de defesa -- e ai o desfecho seria 500.',
    );

    const linhas = await fila.listarAFila(50);
    assert.equal(
      linhas.filter((l) => l.assunto === `X${marca}`).length,
      0,
      'REPROVA: o 400 veio e a linha foi gravada mesmo assim, provavelmente truncada. ' +
        'Truncar em silencio foi recusado de proposito: o fim do texto e onde o tutor ' +
        'diz o que ja tentou, e e justamente o que um corte comeria.',
    );
  });

  void it('assunto que vira vazio depois do aparo e 400, e nao 500', async () => {
    // TRES caracteres, entao o `minLength: 2` do contrato aprova. Aparado, vira
    // UM, e o `CHECK help_requests_assunto_tamanho` recusaria -- em 500. A
    // conferencia do servico sobre o APARADO e o que transforma isso em 400.
    const resposta = await chamar({ subject: ' a ', body: 'Texto suficiente aqui.' });
    assert.equal(
      resposta.status,
      400,
      `REPROVA: respondeu ${String(resposta.status)}. 500 significa que o aparo chegou ao ` +
        'banco: o contrato conta os caracteres do que CHEGOU (tres, aprovado pelo ' +
        '`minLength: 2`) e o banco conta os do que foi GRAVADO (um, recusado pelo ' +
        '`CHECK`). Quem reconcilia os dois e a conferencia do servico sobre o aparado, ' +
        'e ela existe para o tutor receber um erro que ele consegue consertar.',
    );
  });
});
