/**
 * BICHUS-42 — a troca de e-mail contra Postgres, pelo HTTP.
 *
 * ## Por que este arquivo existe, e por que ele é de integração
 *
 * O que esta história promete não cabe num teste de unidade, porque três das
 * quatro promessas são sobre **o que o banco faz**:
 *
 * 1. `users.email` NÃO muda no pedido — só na confirmação. Um dublê de
 *    repositório prova que o serviço chamou o método certo; só o banco prova
 *    que a coluna continuou com o valor antigo.
 * 2. **Qual e-mail recupera a senha no intervalo.** A resposta está numa
 *    cláusula `WHERE` (`buscarCredencialLocalPorEmail` casa por `users.email` e
 *    nunca por `pending_email`). Um dublê não tem cláusula `WHERE`: ele
 *    responderia o que o autor do dublê achasse. Aqui o pedido de redefinição
 *    é disparado de verdade e se lê para ONDE a mensagem foi.
 * 3. **O link vencido.** A expiração é `expires_at > now()` dentro do `UPDATE`
 *    que consome o token. Ela não existe em lugar nenhum do TypeScript.
 * 4. **O teto.** `dimension: account, 5/24h` é aplicado pelo contador real
 *    montado por `tetoDeTeste()`, e a recusa é o 429 que o Fastify devolve.
 *
 * ## Iscas conferidas
 *
 * Cada mecanismo foi desligado sozinho, com o arquivo alterado no disco antes
 * de rodar, e religado depois. O que cada uma reprovou está no relatório da
 * entrega; o resumo:
 *
 * - `concluirTrocaDeEmail` passando a gravar `users.email` já no pedido (quer
 *   dizer, a troca valendo SEM confirmação): reprova o caso 1 e o caso 5;
 * - o ramo de endereço ocupado passando a responder 409: reprova o caso 6;
 * - `rateLimit` da rota trocado por um teto largo: reprova o caso 7;
 * - a cláusula `expires_at` retirada do consumo do token: reprova o caso 4.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hmacDeEnderecoIp } from '../../src/shared/crypto/digest.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { UserId } from '../../src/shared/types/brands.js';
import { criarTrilhaDeAuditoria } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../../src/modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import {
  registrarRotasDeIdentidade,
  rotaDeTrocaDeEmail,
} from '../../src/modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../../src/modules/identity/application/aviso-de-reuso.js';
import type { Mailer, Mensagem } from '../../src/modules/identity/ports/mailer.js';
import type { RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';

const PREFIXO_DA_API = '/v1';

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/** Nada em comum com o endereço: a política recusa senha parecida com o e-mail. */
const SENHA = 'chuva-morna-no-telhado-47';

/**
 * O caminho vem da definição da rota, e o teto também.
 *
 * Repetir `5` aqui faria o caso 7 continuar verde no dia em que alguém
 * afrouxasse o teto da rota: ele mediria o número copiado, não o aplicado.
 */
const CAMINHO_DA_TROCA = rotaDeTrocaDeEmail.path;
const TETO_POR_CONTA = rotaDeTrocaDeEmail.rateLimit?.[0]?.limit ?? 0;

let app: RegistradorDeRotas;
let banco: { db: Db; close: () => Promise<void> };
let base: string;

const contas: UserId[] = [];

/** As mensagens que o serviço mandaria. Ninguém sai da máquina. */
const caixaDeEntrada: Mensagem[] = [];

function enderecoNovo(rotulo: string): string {
  return `troca-${rotulo}-${randomUUID().slice(0, 8)}@${DOMINIO_DE_TESTE}`;
}

async function chamar(
  caminho: string,
  opcoes: { metodo: 'GET' | 'POST'; corpo?: unknown; token?: string },
): Promise<{ status: number; corpo: unknown }> {
  const cabecalhos: Record<string, string> = { accept: 'application/json' };
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  if (opcoes.token !== undefined) cabecalhos['authorization'] = `Bearer ${opcoes.token}`;

  const resposta = await fetch(`${base}${PREFIXO_DA_API}${caminho}`, {
    method: opcoes.metodo,
    headers: cabecalhos,
    ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto === '' ? undefined : JSON.parse(texto) };
}

interface Tutor {
  readonly id: UserId;
  readonly email: string;
  readonly acesso: string;
}

async function criarTutor(rotulo: string): Promise<Tutor> {
  const email = enderecoNovo(rotulo);
  const cadastro = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: { email, password: SENHA },
  });
  assert.equal(
    cadastro.status,
    201,
    `a conta ${email} não foi criada (${String(cadastro.status)}): ` +
      `${JSON.stringify(cadastro.corpo)}`,
  );
  const corpo = cadastro.corpo as { access_token: string; user: { id: string } };
  const id = corpo.user.id as UserId;
  contas.push(id);
  return { id, email, acesso: corpo.access_token };
}

/** O que `GET /v1/me` diz da conta agora. */
async function perfil(acesso: string): Promise<{
  email: string;
  pending_email: string | null;
  email_verified: boolean;
  email_deliverable: boolean;
}> {
  const resposta = await chamar('/me', { metodo: 'GET', token: acesso });
  assert.equal(resposta.status, 200, `GET /me falhou: ${JSON.stringify(resposta.corpo)}`);
  return resposta.corpo as {
    email: string;
    pending_email: string | null;
    email_verified: boolean;
    email_deliverable: boolean;
  };
}

/** As mensagens que foram para este endereço, na ordem em que saíram. */
function mensagensPara(endereco: string): Mensagem[] {
  return caixaDeEntrada.filter((m) => m.para.toLowerCase() === endereco.toLowerCase());
}

/**
 * O token em claro que viajou no corpo da mensagem.
 *
 * Ele existe na função que emite e no corpo do e-mail, e em nenhum outro lugar
 * — nem na trilha, nem no log, nem na resposta. Lê-lo daqui é a única forma
 * honesta de o teste seguir o caminho que a pessoa segue.
 */
function tokenDoLink(corpo: string): string {
  const achado = /[?&]token=([^\s&]+)/.exec(corpo);
  assert.ok(achado, `nenhum link com token no corpo da mensagem:\n${corpo}`);
  return achado[1] as string;
}

async function pedirTroca(
  tutor: Tutor,
  destino: string,
): Promise<{ status: number; corpo: unknown }> {
  return chamar(CAMINHO_DA_TROCA, {
    metodo: 'POST',
    corpo: { new_email: destino },
    token: tutor.acesso,
  });
}

before(async () => {
  const config = loadAppConfig();
  const contrato = carregarContrato(config.openapiSpecPath);

  banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const assinador = criarTokenSigner(config.token);

  app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    teto: tetoDeTeste(),
  });

  const trilha = criarTrilhaDeAuditoria({
    db,
    ids,
    clock: systemClock,
    ipHmacKey: config.ipHmacKey,
    onFailure: (erro) => {
      console.error('trilha de auditoria não gravou:', erro);
    },
  });

  const repositorio = criarIdentityRepository(db, ids);

  const mailer: Mailer = {
    enviar: (mensagem: Mensagem) => {
      caixaDeEntrada.push(mensagem);
      return Promise.resolve();
    },
  };

  const auth = criarAuthService({
    repositorio,
    assinador,
    trilha,
    ids,
    clock: systemClock,
    janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    mailer,
    registrarOcorrencia: () => {
      // Silencioso de propósito: o que este arquivo afirma sai da caixa de
      // entrada e do banco, nunca do log.
    },
    baseDaWeb: config.publicBaseUrl,
    avisarTitular: criarAvisoDeReusoAoTitular({
      repositorio,
      mailer,
      registrarOcorrencia: () => {
        /* idem */
      },
    }),
  });

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, {
        auth,
        assinador,
        contrato,
        issuer: config.token.issuer,
        apiBaseUrl: config.apiBaseUrl,
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
    for (const id of contas) {
      await banco.db.deleteFrom('users').where('id', '=', id).execute();
    }
    await banco.close();
  }
});

void describe(`BICHUS-42 — POST ${CAMINHO_DA_TROCA} contra Postgres`, () => {
  void it('1. o pedido NÃO troca o e-mail da conta: ele só declara a intenção', async () => {
    const tutor = await criarTutor('intencao');
    const destino = enderecoNovo('destino-intencao');

    const resposta = await pedirTroca(tutor, destino);
    assert.equal(resposta.status, 202, JSON.stringify(resposta.corpo));

    const depois = await perfil(tutor.acesso);
    assert.equal(
      depois.email,
      tutor.email,
      'o e-mail da conta mudou no PEDIDO. É exatamente isto que o título da ' +
        'história proíbe: sem a confirmação no endereço novo, quem tomou a sessão ' +
        'troca o endereço e captura a conta pela recuperação de senha.',
    );
    assert.equal(depois.pending_email, destino);

    // O que o banco guarda, e não só o que a resposta projeta.
    const linha = await banco.db
      .selectFrom('users')
      .select(['email', 'pending_email'])
      .where('id', '=', tutor.id)
      .executeTakeFirstOrThrow();
    assert.equal(linha.email, tutor.email);
    assert.equal(linha.pending_email, destino);
  });

  void it('2. o aviso sai para o endereço ANTIGO no instante do pedido, e nomeia o novo', async () => {
    const tutor = await criarTutor('testemunha');
    const destino = enderecoNovo('destino-testemunha');

    const antesDoPedido = mensagensPara(tutor.email).length;
    await pedirTroca(tutor, destino);

    const paraOAntigo = mensagensPara(tutor.email);
    assert.equal(
      paraOAntigo.length,
      antesDoPedido + 1,
      'nada chegou ao endereço antigo no pedido. Avisar depois da troca é tarde: ' +
        'a essa altura a recuperação de senha já aponta para quem tomou a sessão, e ' +
        'o endereço antigo é a única testemunha que a conta tem.',
    );

    const aviso = paraOAntigo[paraOAntigo.length - 1] as Mensagem;
    assert.match(aviso.assunto, /trocar o e-mail/i);
    assert.ok(
      aviso.corpo.includes(destino),
      'o aviso não diz QUAL endereço foi pedido, e é lendo isso que a pessoa ' +
        'reconhece o que não pediu.',
    );
    // O aviso não carrega o link: quem tem a caixa antiga não confirma a troca.
    assert.doesNotMatch(aviso.corpo, /[?&]token=/);
  });

  void it('3. o link vai para o endereço NOVO, e abri-lo troca o e-mail de verdade', async () => {
    const tutor = await criarTutor('confirma');
    const destino = enderecoNovo('destino-confirma');

    await pedirTroca(tutor, destino);

    const paraONovo = mensagensPara(destino);
    assert.equal(paraONovo.length, 1, 'o endereço novo não recebeu o link de confirmação');

    const token = tokenDoLink((paraONovo[0] as Mensagem).corpo);
    const confirmacao = await chamar('/auth/email-verification/confirm', {
      metodo: 'POST',
      corpo: { token },
    });
    assert.equal(confirmacao.status, 200, JSON.stringify(confirmacao.corpo));

    const depois = await perfil(tutor.acesso);
    assert.equal(depois.email, destino, 'a confirmação não trocou o e-mail da conta');
    assert.equal(depois.pending_email, null);
    assert.equal(
      depois.email_verified,
      true,
      'abrir o link é a prova de alcance que a verificação pede; exigir um segundo ' +
        'e-mail depois seria pedir duas vezes a mesma prova',
    );
    assert.equal(depois.email_deliverable, true);

    // O endereço antigo recebe o desfecho, e é a última mensagem que ele vê.
    const fecho = mensagensPara(tutor.email);
    assert.ok(
      (fecho[fecho.length - 1] as Mensagem).assunto.match(/foi trocado/i),
      'o endereço antigo soube que PEDIRAM e nunca se a troca valeu',
    );

    // Entrar passa a ser pelo endereço novo, e não mais pelo antigo.
    const pelaNova = await chamar('/auth/login', {
      metodo: 'POST',
      corpo: { email: destino, password: SENHA, stay_signed_in: false },
    });
    assert.equal(pelaNova.status, 200, 'não dá para entrar pelo endereço confirmado');

    const pelaAntiga = await chamar('/auth/login', {
      metodo: 'POST',
      corpo: { email: tutor.email, password: SENHA, stay_signed_in: false },
    });
    assert.equal(pelaAntiga.status, 401, 'o endereço antigo continua entrando na conta');
  });

  void it('4. ISCA — o link VENCIDO não troca nada, e responde o mesmo 410 de sempre', async () => {
    const tutor = await criarTutor('vencido');
    const destino = enderecoNovo('destino-vencido');

    await pedirTroca(tutor, destino);
    const token = tokenDoLink((mensagensPara(destino)[0] as Mensagem).corpo);

    // O relógio não se mexe; a linha envelhece. É o mesmo que o `expires_at`
    // vê, e não depende de esperar 24 horas.
    await banco.db
      .updateTable('verification_tokens')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('user_id', '=', tutor.id)
      .where('purpose', '=', 'email_change')
      .execute();

    const confirmacao = await chamar('/auth/email-verification/confirm', {
      metodo: 'POST',
      corpo: { token },
    });
    assert.equal(
      confirmacao.status,
      410,
      'o link vencido ainda funciona. A validade existe para que um acesso ' +
        'transitório à caixa de entrada não volte a valer amanhã.',
    );

    const depois = await perfil(tutor.acesso);
    assert.equal(depois.email, tutor.email, 'o e-mail mudou com um link vencido');
    assert.equal(
      depois.pending_email,
      destino,
      'o pedido sumiu junto com o link vencido: a tela precisa do pendente para ' +
        'oferecer "pedir de novo"',
    );
  });

  void it('5. entre pedir e confirmar, quem recupera a senha é o endereço ANTIGO', async () => {
    const tutor = await criarTutor('recuperacao');
    const destino = enderecoNovo('destino-recuperacao');

    await pedirTroca(tutor, destino);

    const antesNoAntigo = mensagensPara(tutor.email).length;
    const antesNoNovo = mensagensPara(destino).length;

    const pedidoPeloAntigo = await chamar('/auth/password-reset', {
      metodo: 'POST',
      corpo: { email: tutor.email },
    });
    assert.equal(pedidoPeloAntigo.status, 202);

    assert.equal(
      mensagensPara(tutor.email).length,
      antesNoAntigo + 1,
      'a redefinição de senha parou de ir para o endereço da conta durante o ' +
        'intervalo. É por este caminho que o titular retoma a conta quando percebe ' +
        'o aviso de troca.',
    );

    const pedidoPeloNovo = await chamar('/auth/password-reset', {
      metodo: 'POST',
      corpo: { email: destino },
    });
    assert.equal(pedidoPeloNovo.status, 202, 'a resposta variou com a existência da conta');
    assert.equal(
      mensagensPara(destino).length,
      antesNoNovo,
      'a recuperação de senha aceitou o endereço PENDENTE. Um `OR pending_email` ' +
        'em qualquer busca do repositório entrega a conta a quem só pediu a troca, ' +
        'e torna a confirmação decorativa.',
    );
  });

  void it('6. ISCA — o endereço novo já ter dono não muda nem o status, nem o corpo, nem o que sai', async () => {
    const tutor = await criarTutor('opaco');
    const vizinha = await criarTutor('vizinha');

    const livre = enderecoNovo('destino-livre');
    const respostaLivre = await pedirTroca(tutor, livre);

    const antesNaVizinha = mensagensPara(vizinha.email).length;
    const respostaOcupada = await pedirTroca(tutor, vizinha.email);

    assert.equal(
      respostaOcupada.status,
      respostaLivre.status,
      'o status revela se o endereço já tem conta. É o oráculo de existência que o ' +
        'SEC-003 fecha no cadastro, e aqui ele seria consultável por qualquer ' +
        'pessoa com uma sessão.',
    );
    assert.deepEqual(respostaOcupada.corpo, respostaLivre.corpo, 'o corpo revela a diferença');

    assert.equal(
      mensagensPara(vizinha.email).length,
      antesNaVizinha,
      'mandamos e-mail para o endereço alheio que a pessoa digitou: a nossa saída ' +
        'de SMTP virou sonda de endereço',
    );

    // A conta da vizinha não foi tocada, e o pendente do pedinte não ficou com
    // o endereço dela.
    const dela = await perfil(vizinha.acesso);
    assert.equal(dela.email, vizinha.email);
    const dele = await perfil(tutor.acesso);
    assert.notEqual(dele.pending_email, vizinha.email);
  });

  void it(`7. ISCA — o teto de ${String(TETO_POR_CONTA)} por conta recusa o pedido seguinte com 429`, async () => {
    const tutor = await criarTutor('teto');

    assert.ok(TETO_POR_CONTA > 0, 'a rota ficou sem teto declarado');

    for (let i = 0; i < TETO_POR_CONTA; i += 1) {
      const resposta = await pedirTroca(tutor, enderecoNovo(`teto-${String(i)}`));
      assert.equal(
        resposta.status,
        202,
        `o pedido ${String(i + 1)} de ${String(TETO_POR_CONTA)} já foi recusado`,
      );
    }

    const excedente = await pedirTroca(tutor, enderecoNovo('teto-excedente'));
    assert.equal(
      excedente.status,
      429,
      'o teto sumiu. Cada pedido manda DUAS mensagens e o destino é escolhido por ' +
        'quem chama: sem teto, uma sessão vira disparador de e-mail nosso contra ' +
        'endereço alheio.',
    );
    assert.match(
      JSON.stringify(excedente.corpo),
      /rate-limited/,
      'a recusa não é a do teto de chamada',
    );
  });

  void it('8. sem sessão não há pedido: 401, e nada é gravado', async () => {
    const semToken = await chamar(CAMINHO_DA_TROCA, {
      metodo: 'POST',
      corpo: { new_email: enderecoNovo('sem-sessao') },
    });
    assert.equal(semToken.status, 401, JSON.stringify(semToken.corpo));
  });
});
