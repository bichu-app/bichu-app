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

import { registrarRotasDaFilaDeAjuda } from '../../src/modules/support/adapters/http/admin-help-request-routes.js';
import { registrarRotasDeAjuda } from '../../src/modules/support/adapters/http/help-request-routes.js';
import { criarDuvidasDeAjuda } from '../../src/modules/support/adapters/persistence/kysely-duvidas-de-ajuda.js';
import { criarDuvidaDeAjudaService } from '../../src/modules/support/application/duvida-de-ajuda-service.js';
import { criarFilaDeAjudaService } from '../../src/modules/support/application/fila-de-ajuda-service.js';
import type { DuvidasDeAjuda } from '../../src/modules/support/ports/duvidas-de-ajuda.js';
import { loadAppConfig } from '../../src/shared/config/app-config.js';
import {
  criarEscritaAuditada,
  criarTrilhaTransacional,
} from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import { hashDeToken } from '../../src/shared/crypto/digest.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import type { RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';
import { criarServidor } from '../../src/shared/http/server.js';
import {
  CABECALHO_ANTI_CSRF,
  CABECALHO_DA_SUPERFICIE,
  COOKIE_DA_SESSAO_ADMINISTRATIVA,
  escoparRotasAdministrativas,
  VALOR_DA_SUPERFICIE_ADMINISTRATIVA,
  type PortaDaSessaoAdministrativa,
  type SessaoAdministrativaConferida,
} from '../../src/shared/http/superficie-administrativa.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { UserId } from '../../src/shared/types/brands.js';

const PREFIXO_DA_API = '/v1';
const CAMINHO = '/me/help-requests';
const ORIGEM_DO_PAINEL = 'https://painel.exemplo.test';
/** O token anti-CSRF: a guarda o exige em todo metodo nao seguro (403 sem ele). */
const TOKEN_ANTI_CSRF = 'token-anti-csrf-de-teste';
/** A conta do painel que marca como atendida. O `after` a apaga. */
const CONTA_DO_PAINEL = '01a18900-0000-7000-8000-00000000ad99';

/** A sessao do painel, de mentira: o caminho do dado e o que esta sob prova. */
const sessoesDeTeste = {
  conferir: () =>
    Promise.resolve({
      sessionId: 'sessao-de-teste',
      adminAccountId: CONTA_DO_PAINEL,
      displayName: 'Operadora de Teste',
      papeis: ['admin'],
      csrfTokenHash: hashDeToken(TOKEN_ANTI_CSRF),
      etiqueta: 'aaaaaaaa',
      instanteDaSenha: new Date(0),
    } as unknown as SessaoAdministrativaConferida),
  registrarRecusa: () => Promise.resolve(),
} as unknown as PortaDaSessaoAdministrativa;

/** Os cabecalhos que o painel de verdade manda. */
const DO_PAINEL: Record<string, string> = {
  accept: 'application/json',
  [CABECALHO_DA_SUPERFICIE]: VALOR_DA_SUPERFICIE_ADMINISTRATIVA,
  cookie: `${COOKIE_DA_SESSAO_ADMINISTRATIVA}=valor-de-teste`,
  origin: ORIGEM_DO_PAINEL,
  [CABECALHO_ANTI_CSRF]: TOKEN_ANTI_CSRF,
};

let banco: { db: Db; close: () => Promise<void> };
let app: RegistradorDeRotas;
let base: string;
let fila: DuvidasDeAjuda;
/**
 * A conta que esta mandando a duvida AGORA, e a lista de todas as criadas.
 *
 * **Uma conta por duvida, e nao uma para o arquivo inteiro.** O motivo e o
 * teto de chamada da propria rota: `deny_429` com dez por dia POR CONTA. Com
 * um autor so, este arquivo estourava o proprio teto ao crescer -- e o 429
 * aparecia num caso que media OUTRA coisa (o teto de 4000 caracteres),
 * apontando para o lugar errado. Medido: `o teto EXATO passa` reprovou com
 * `429 !== 202`.
 *
 * Rodar com conta nova por duvida tambem e o que o uso real parece: dez
 * duvidas da mesma pessoa num dia e que seria o caso estranho.
 */
let autor: UserId;
const autores: UserId[] = [];

/** Montada no `before`, quando `db` existe. */
let criarAutor: () => Promise<UserId>;

/**
 * Manda uma duvida por uma conta NOVA.
 *
 * A conta nova e o que mantem o teto de dez por dia por conta fora do caminho
 * deste arquivo -- ver o comentario de `autores`.
 */
async function chamar(corpo: unknown): Promise<{ status: number; corpo: unknown }> {
  await criarAutor();
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
  criarAutor = async () => {
    const novo = ids.uuidv7() as UserId;
    await db
      .insertInto('users')
      .values({
        id: novo,
        email: `ajuda-${randomUUID().slice(0, 8)}@exemplo.invalido`,
        public_ref: Buffer.from(ids.random128()).toString('base64url'),
        display_name: 'Tutor de Teste',
        birth_date: '1990-01-01',
        sessions_invalid_before: new Date(0),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    autores.push(novo);
    autor = novo;
    return novo;
  };
  await criarAutor();

  // A CONTA DO PAINEL precisa existir no banco: `attended_by_admin_id` tem FK
  // para `admin_accounts`, com `NO ACTION`. Sem a linha, marcar como atendida
  // reprovaria por chave estrangeira -- que e a FK fazendo o trabalho dela.
  await db
    .insertInto('admin_accounts')
    .values({
      id: CONTA_DO_PAINEL,
      email: `operadora-${randomUUID().slice(0, 8)}@exemplo.invalido`,
      display_name: 'Rita da Operacao',
      role: 'admin',
      password_phc: '$pbkdf2-sha512$i=1$YWFhYWFhYWFhYWFhYWFhYQ$YWFhYQ',
      password_updated_at: new Date(),
    })
    .execute();

  // A escrita auditada de verdade: a marcacao e o evento da trilha na MESMA
  // transacao (D49). Sem ela, `audit.events` nao recebe linha nenhuma -- medido
  // numa pilha de pe antes de este argumento existir.
  fila = criarDuvidasDeAjuda(
    db,
    ids,
    criarEscritaAuditada({
      db,
      trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
    }),
  );

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
      // A FILA ADMINISTRATIVA, no MESMO escopo e sobre a MESMA porta.
      //
      // **Pelo involucro de verdade, e nao solta**: `registrarRota` RECUSA
      // registrar rota `/admin/` fora de `escoparRotasAdministrativas` --
      // "ela seria servida sem a guarda do prefixo (ADR-0027 item 7)". Eu
      // tentei o atalho e a recusa me pegou, que e o desenho funcionando: a
      // fronteira administrativa nao e contornavel nem num teste.
      //
      // A SESSAO e o unico duble: o que este arquivo mede e o CAMINHO DO DADO
      // -- o que o app grava, o painel le --, e quem confere credencial de
      // painel tem portao proprio.
      escoparRotasAdministrativas(escopo, { origem: ORIGEM_DO_PAINEL, sessoes: sessoesDeTeste }, (adm) => {
        registrarRotasDaFilaDeAjuda(adm, { fila: criarFilaDeAjudaService(fila, systemClock) });
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
    // TODAS as contas criadas, e nao so a ultima: a FK e `ON DELETE CASCADE`,
    // entao cada uma leva as duvidas dela.
    for (const id of autores) {
      await banco.db.deleteFrom('users').where('id', '=', id).execute();
    }
    // A conta do painel DEPOIS das duvidas: a FK e `NO ACTION`, entao apagar a
    // conta com duvida atendida pendurada reprova -- e e assim que ela protege
    // a autoria de um expurgo operacional.
    await banco.db.deleteFrom('admin_accounts').where('id', '=', CONTA_DO_PAINEL).execute();
    await banco.close();
  }
});

async function lerAFila(busca = ''): Promise<{ status: number; corpo: unknown }> {
  const resposta = await fetch(`${base}${PREFIXO_DA_API}/admin/help-requests${busca}`, {
    headers: DO_PAINEL,
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto === '' ? undefined : JSON.parse(texto) };
}

void describe('A duvida de ajuda grava em help_requests, e a fila do painel a le', () => {
  void it('O CAMINHO INTEIRO: o app grava pela rota, e o PAINEL le pela rota dele', async () => {
    // E o caso que esta funcionalidade existe para ter. A duvida gravada que
    // nenhum humano alcanca e funcionalidade que nao existe -- foi assim que o
    // passkey foi entregue, com servidor, contrato e entitlement no lugar,
    // nenhuma porta de interface e zero credenciais no banco.
    const marca = randomUUID().slice(0, 8);
    const escrita = await chamar({
      subject: `Caminho inteiro ${marca}`,
      body: 'Escrita pelo app, lida pelo painel.',
    });
    assert.equal(escrita.status, 202, `REPROVA: a escrita falhou. Corpo: ${JSON.stringify(escrita.corpo)}`);

    const leitura = await lerAFila('?page=1&limit=50');
    assert.equal(
      leitura.status,
      200,
      `REPROVA: a fila do painel respondeu ${String(leitura.status)}. 404 = a rota ` +
        `administrativa nao esta registrada. Corpo: ${JSON.stringify(leitura.corpo)}`,
    );

    const corpo = leitura.corpo as { items: Record<string, unknown>[]; total: number };
    const minha = corpo.items.find((i) => i['subject'] === `Caminho inteiro ${marca}`);
    assert.ok(
      minha !== undefined,
      'REPROVA: o app gravou 202 e a rota do painel NAO devolve a duvida. As duas ' +
        'pontas estao olhando coisas diferentes, e o tutor espera uma resposta que ' +
        'ninguem vai ler.',
    );
    assert.equal(minha['body'], 'Escrita pelo app, lida pelo painel.');
    assert.match(
      String(minha['ref']),
      /^[A-Za-z0-9_-]{22}$/,
      'REPROVA: `ref` nao tem a forma de 22 simbolos base64url.',
    );
    // O CONJUNTO EXATO, e nao "contem": e a lista fechada que impede o autor de
    // entrar. `attended_at` e `attended_by` falam da OPERADORA do painel, e
    // `status` e derivado do instante.
    //
    // NADA DO TUTOR pode sair: o contrato afirma em TRES lugares que a fila de
    // pedidos de encontro e "a unica leitura de pessoa do backoffice v1" (D53 a
    // D57), e projeta-lo aqui criaria a segunda e tornaria aquela frase falsa.
    assert.deepEqual(
      Object.keys(minha).sort(),
      ['attended_at', 'attended_by', 'body', 'created_at', 'ref', 'status', 'subject'],
      'REPROVA: a resposta da fila carrega campo fora da lista fechada.',
    );
    assert.ok(
      corpo.total >= 1,
      'REPROVA: `total` nao conta a fila. O painel desenharia uma pagina so.',
    );
  });

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

    const pagina = await fila.listarAFila('open', 1, 10);
    const minha = pagina.itens.find((l) => l.assunto === 'Nao salva o segundo pet');
    assert.ok(
      minha !== undefined,
      'REPROVA: a rota respondeu 202 e a consulta do painel NAO acha a linha. E o ' +
        'desfecho pior de todos: o tutor ve o recado de recebido, espera resposta, e ' +
        'a fila esta vazia -- indistinguivel de um dia em que ninguem perguntou nada.',
    );
    assert.match(
      minha.ref,
      /^[A-Za-z0-9_-]{22}$/,
      'REPROVA: o `ref` da duvida nao tem a forma de 22 simbolos base64url. E ele que ' +
        'sai para o painel; o `id` e UUIDv7 e nunca sai (SEC-001/SEC-002).',
    );
    // Na PORTA os campos do atendimento sao opcionais, entao a duvida aberta
    // nao os carrega. O que este caso trava e que NENHUM campo de autor
    // apareca: a lista e fechada nos dois estados.
    assert.equal(
      Object.keys(minha).sort().join(','),
      'assunto,criadaEm,ref,texto',
      'REPROVA: a linha ABERTA da fila carrega campo a mais. NADA do tutor pode sair ' +
        '(D53 a D57), e os campos do atendimento so existem depois de alguem marcar.',
    );
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

    const pagina = await fila.listarAFila('open', 1, 50);
    const minhas = pagina.itens.filter((l) => l.assunto.endsWith(marca));
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

  void it('ATENDER: a duvida muda de estado, NAO sai da tabela, e guarda quem marcou', async () => {
    const marca = randomUUID().slice(0, 8);
    await chamar({ subject: `Atender ${marca}`, body: 'Para ser marcada como atendida.' });

    const antes = await lerAFila('?status=open&limit=50');
    const minha = (antes.corpo as { items: Record<string, unknown>[] }).items.find(
      (i) => i['subject'] === `Atender ${marca}`,
    );
    assert.ok(minha !== undefined, 'REPROVA: a duvida nao apareceu na aba aberta.');
    assert.equal(minha['status'], 'open');

    const ref = String(minha['ref']);
    const marcou = await fetch(
      `${base}${PREFIXO_DA_API}/admin/help-requests/${ref}/attendance`,
      { method: 'POST', headers: DO_PAINEL },
    );
    const corpoDaMarcacao = (await marcou.json()) as Record<string, unknown>;
    assert.equal(
      marcou.status,
      200,
      `REPROVA: marcar respondeu ${String(marcou.status)}. 403 = o par cookie + ` +
        `X-CSRF-Token nao chegou; 404 = o ref nao existe. Corpo: ${JSON.stringify(corpoDaMarcacao)}`,
    );
    assert.equal(corpoDaMarcacao['status'], 'attended');
    assert.equal(
      corpoDaMarcacao['attended_by'],
      'Rita da Operacao',
      'REPROVA: a autoria nao voltou. A decisao do cliente pede transicao auditavel, e ' +
        'o painel nao le a trilha -- a coluna e o unico lugar onde a autoria aparece ' +
        'para quem opera.',
    );
    assert.ok(typeof corpoDaMarcacao['attended_at'] === 'string');

    // **NAO SAIU DA TABELA**: so trocou de aba. "Nao apague nada".
    const naFila = await lerAFila('?status=open&limit=50');
    assert.equal(
      (naFila.corpo as { items: Record<string, unknown>[] }).items.filter(
        (i) => i['ref'] === ref,
      ).length,
      0,
      'REPROVA: a duvida atendida continua na aba aberta.',
    );
    const atendidas = await lerAFila('?status=attended&limit=50');
    assert.equal(
      (atendidas.corpo as { items: Record<string, unknown>[] }).items.filter(
        (i) => i['ref'] === ref,
      ).length,
      1,
      'REPROVA: a duvida sumiu das DUAS abas. Marcar como atendida e MUDANCA DE ESTADO ' +
        'e nunca `DELETE` -- a linha tem de continuar na tabela, e so trocar de aba.',
    );
  });

  void it('ATENDER grava na TRILHA, na mesma transacao', async () => {
    // O defeito que este caso existe para impedir ja aconteceu, e eu o medi:
    // com `x-audit` declarado no contrato e sem a escrita auditada, a rota
    // respondia 200, a coluna mudava, e `audit.events` ficava SEM nenhuma
    // linha de `admin.help_request.attended`. `x-audit` e DECLARACAO -- o
    // portao a confere e nada a escreve --, e a transicao que o cliente pediu
    // auditavel nao era.
    const marca = randomUUID().slice(0, 8);
    await chamar({ subject: `Trilha ${marca}`, body: 'Para conferir a trilha.' });
    const abertas = await lerAFila('?status=open&limit=50');
    const alvo = (abertas.corpo as { items: Record<string, unknown>[] }).items.find(
      (i) => i['subject'] === `Trilha ${marca}`,
    );
    const ref = String(alvo?.['ref']);

    const antes = await banco.db
      .selectFrom('audit.events')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('action', '=', 'admin.help_request.attended')
      .executeTakeFirstOrThrow();

    const marcou = await fetch(
      `${base}${PREFIXO_DA_API}/admin/help-requests/${ref}/attendance`,
      { method: 'POST', headers: DO_PAINEL },
    );
    assert.equal(marcou.status, 200);

    const evento = await banco.db
      .selectFrom('audit.events')
      .select(['action', 'resource_kind', 'resource_id', 'actor_admin_id', 'actor_kind'])
      .where('action', '=', 'admin.help_request.attended')
      .where('resource_id', '=', ref)
      .executeTakeFirst();

    assert.ok(
      evento !== undefined,
      `REPROVA: a marcacao respondeu 200 e a TRILHA nao tem linha para o ref ${ref}. ` +
        `Antes havia ${antes.n} evento(s) desta acao. O cliente pediu transicao ` +
        'auditavel, e `x-audit` no contrato nao escreve nada sozinho.',
    );
    assert.equal(evento.resource_kind, 'help_request');
    assert.equal(
      evento.actor_kind,
      'admin',
      'REPROVA: a trilha registrou o ator como outra coisa. Quem marca e conta do ' +
        'PAINEL, e `actor_admin_id` e nunca `actor_user_id` (ADR-0027 item 20.2).',
    );
    assert.equal(evento.actor_admin_id, CONTA_DO_PAINEL);
  });

  void it('ATENDER DE NOVO e idempotente: nao troca quem marcou nem quando', async () => {
    const marca = randomUUID().slice(0, 8);
    await chamar({ subject: `Duas vezes ${marca}`, body: 'Marcada duas vezes.' });
    const abertas = await lerAFila('?status=open&limit=50');
    const alvo = (abertas.corpo as { items: Record<string, unknown>[] }).items.find(
      (i) => i['subject'] === `Duas vezes ${marca}`,
    );
    const ref = String(alvo?.['ref']);

    const url = `${base}${PREFIXO_DA_API}/admin/help-requests/${ref}/attendance`;
    const primeira = (await (await fetch(url, { method: 'POST', headers: DO_PAINEL })).json()) as Record<string, unknown>;
    const segunda = (await (await fetch(url, { method: 'POST', headers: DO_PAINEL })).json()) as Record<string, unknown>;

    assert.deepEqual(
      segunda,
      primeira,
      'REPROVA: a segunda marcacao mudou a linha. Duas operadoras na mesma fila e uso ' +
        'normal, e sobrepor a autoria faria a segunda apagar o registro da primeira -- ' +
        'um `DELETE` disfarcado de `UPDATE`.',
    );
  });

  void it('ATENDER um `ref` que nao existe e 404', async () => {
    const resposta = await fetch(
      `${base}${PREFIXO_DA_API}/admin/help-requests/ZZZZZZZZZZZZZZZZZZZZZZ/attendance`,
      { method: 'POST', headers: DO_PAINEL },
    );
    assert.equal(
      resposta.status,
      404,
      `REPROVA: respondeu ${String(resposta.status)} sobre um ref inexistente.`,
    );
  });

  void it('`pending_total` conta as ABERTAS, e ignora o filtro', async () => {
    const atendidas = await lerAFila('?status=attended&limit=50');
    const corpo = atendidas.corpo as { items: unknown[]; total: number; pending_total: number };
    const abertas = await lerAFila('?status=open&limit=50');
    const quantas = (abertas.corpo as { total: number }).total;

    assert.equal(
      corpo.pending_total,
      quantas,
      'REPROVA: `pending_total` seguiu o filtro. Ele e o numerinho do menu e responde ' +
        '"quanto trabalho esta esperando" -- com o filtro aplicado nos dois, o menu ' +
        'anunciaria "0 pendentes" toda vez que alguem abrisse a aba dos atendidos, que ' +
        'e o defeito que a fila da Rede ja produziu.',
    );
  });

  void it('a fila PAGINA, e o `total` conta a fila inteira e nao a pagina', async () => {
    const marca = randomUUID().slice(0, 8);
    for (let i = 1; i <= 3; i++) {
      await chamar({ subject: `Pagina ${i} ${marca}`, body: `Texto ${i}.` });
    }

    const primeira = await fila.listarAFila('open', 1, 2);
    assert.equal(primeira.itens.length, 2, 'REPROVA: `limit` nao recortou a pagina.');

    const segunda = await fila.listarAFila('open', 2, 2);
    assert.ok(
      segunda.itens.length >= 1,
      'REPROVA: a pagina 2 veio vazia. Sem `offset`, o painel desenharia a mesma ' +
        'pagina para sempre e a fila teria fundo falso.',
    );
    assert.equal(
      primeira.itens.filter((l) => segunda.itens.some((o) => o.ref === l.ref)).length,
      0,
      'REPROVA: as paginas 1 e 2 repetem linha. `offset` errado faz o revisor ler duas ' +
        'vezes a mesma duvida e nunca chegar ao fim da fila.',
    );

    assert.ok(
      primeira.total >= 3,
      `REPROVA: \`total\` veio ${String(primeira.total)} com pelo menos 3 duvidas gravadas.`,
    );
    assert.notEqual(
      primeira.total,
      primeira.itens.length,
      'REPROVA: `total` e igual ao tamanho da pagina. Contar `linhas.length` em vez de ' +
        'perguntar ao banco faz o painel desenhar UMA pagina e esconder o resto da fila ' +
        '-- o defeito que uma fila nao pode ter.',
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

    const pagina = await fila.listarAFila('open', 1, 50);
    assert.equal(
      pagina.itens.filter((l) => l.assunto === `X${marca}`).length,
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
