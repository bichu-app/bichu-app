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
 * ## A segunda credencial, e por que ela entrou aqui depois
 *
 * `POST /v1/me/email-change` é operação destrutiva: quem toma uma sessão troca
 * o endereço e captura a conta pela recuperação de senha. O contrato declara
 * `x-reauth-scope: email_change` na operação e a rota declara
 * `reauthScope: 'email_change'`, então `registrarRota` instala o portão e a
 * chamada sem `X-Reauth-Token` responde 401 `reauthentication-required`.
 *
 * Este arquivo nasceu antes disso. A BICHUS-42 foi escrita quando a maquinaria
 * da BICHUS-48 não existia em `src/`, e as duas pontas só se encontraram no
 * merge de 22/09: a suite continuava chamando a rota só com a sessão, e os sete
 * casos que pedem a troca passaram a reprovar em 401. O defeito era da suite, e
 * não da rota — servidor de teste que dispensa a senha mede outra coisa do que
 * produção serve.
 *
 * A janela é de **300 s, uso único, uma finalidade e uma sessão**, então cada
 * ação pede a sua: `pedirTroca` abre uma em `POST /auth/reauth` e a apresenta.
 * Token guardado e reaproveitado reprova por "janela já consumida", e o
 * vermelho passa a dizer outra coisa do que o caso cobra. O caso 11 fixa isso
 * como afirmação, em vez de deixá-lo como recomendação de comentário.
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
 * - a cláusula `expires_at` retirada do consumo do token: reprova o caso 4;
 * - `reauthScope` retirado de `rotaDeTrocaDeEmail`, que é a divergência que a
 *   integração de 22/09 revelou: reprova o caso 10, e só ele.
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
  criarVerificadorDeReautenticacao,
  registrarRotasDeIdentidade,
  rotaDeReautenticacao,
  rotaDeTrocaDeEmail,
  type DependenciasDasRotas,
} from '../../src/modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../../src/modules/identity/application/aviso-de-reuso.js';
import type { Mailer, Mensagem } from '../../src/modules/identity/ports/mailer.js';
import { CABECALHO_DE_REAUTENTICACAO } from '../../src/shared/http/registrar-rota.js';
import type {
  RegistradorDeRotas,
  VerificadorDeReautenticacao,
} from '../../src/shared/http/registrar-rota.js';
import type { ReauthScope, RouteDefinition } from '../../src/shared/http/route-definition.js';

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

/** Onde a janela nasce. Vem da definicao da rota, como o caminho da troca. */
const CAMINHO_DA_REAUTENTICACAO = rotaDeReautenticacao.path;

/**
 * A finalidade da janela, escrita aqui à mão **e conferida contra a rota** no
 * caso 10.
 *
 * Derivar de `rotaDeTrocaDeEmail.reauthScope` seria o reflexo certo em qualquer
 * outra constante deste arquivo, e é errado nesta. Quem apagasse a declaração
 * faria todo `POST /auth/reauth` deste arquivo sair sem `scope`, e os nove
 * casos morreriam em 400 de corpo inválido — inclusive o único que existe para
 * acusar o apagamento, que terminaria vermelho pelo motivo errado. Com o valor
 * literal, apagar a declaração reprova **um** caso, e é o caso certo.
 */
const ESCOPO_DA_TROCA: ReauthScope = 'email_change';

/**
 * O que a rota declara, lido pelo tipo **largo**, e a largura é o ponto.
 *
 * `defineRoute` é genérico em `const`, então `reauthScope` tem tipo literal e
 * **some do tipo** junto com a linha. Lida pelo tipo estreito, apagar a
 * declaração vira erro de compilação: a suite inteira não roda e os onze casos
 * saem cancelados — que é o desfecho que `executar-suite.mjs` existe para
 * acusar, e não a afirmação que o caso 10 cobra. Uma isca que derruba a
 * compilação não mede a rota; ela mede o compilador, e de quebra apaga a
 * evidência dos outros dez casos.
 *
 * Pelo tipo largo, apagar a declaração compila, a suite roda inteira, e reprova
 * **um** caso, com a mensagem que diz o que se perdeu.
 */
const ESCOPO_DECLARADO_NA_ROTA = (rotaDeTrocaDeEmail as RouteDefinition).reauthScope;

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
  opcoes: { metodo: 'GET' | 'POST' | 'PUT'; corpo?: unknown; token?: string; reauth?: string },
): Promise<{ status: number; corpo: unknown }> {
  const cabecalhos: Record<string, string> = { accept: 'application/json' };
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  if (opcoes.token !== undefined) cabecalhos['authorization'] = `Bearer ${opcoes.token}`;
  if (opcoes.reauth !== undefined) cabecalhos[CABECALHO_DE_REAUTENTICACAO] = opcoes.reauth;

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

/**
 * Abre UMA janela de reautenticação para a troca de e-mail.
 *
 * A janela é de 300 segundos, **uso único**, uma finalidade e uma sessão
 * (BICHUS-48). Guardar o token numa variável de módulo e reaproveitá-lo entre
 * os casos faria a suite reprovar por "janela já consumida" e o vermelho
 * diria outra coisa do que o caso cobra. Uma por ação, sempre.
 */
async function abrirJanela(tutor: Tutor, senha: string = SENHA): Promise<string> {
  const resposta = await chamar(CAMINHO_DA_REAUTENTICACAO, {
    metodo: 'POST',
    token: tutor.acesso,
    corpo: { password: senha, scope: ESCOPO_DA_TROCA },
  });
  assert.equal(
    resposta.status,
    200,
    `POST ${CAMINHO_DA_REAUTENTICACAO} recusou a senha certa ` +
      `(${String(resposta.status)}): ${JSON.stringify(resposta.corpo)}`,
  );
  return (resposta.corpo as { reauth_token: string }).reauth_token;
}

/**
 * O pedido de troca **com** a segunda credencial, que é como o app o faz.
 *
 * `POST /me/email-change` declara `reauthScope: 'email_change'`, e o contrato
 * declara `x-reauth-scope: email_change` na mesma operação. Apresentar a janela
 * aqui é reproduzir o caminho da pessoa; o caso 10 é quem mede o outro lado,
 * que é a rota recusando quem não a apresenta.
 */
async function pedirTroca(
  tutor: Tutor,
  destino: string,
): Promise<{ status: number; corpo: unknown }> {
  return chamar(CAMINHO_DA_TROCA, {
    metodo: 'POST',
    corpo: { new_email: destino },
    token: tutor.acesso,
    reauth: await abrirJanela(tutor),
  });
}

before(async () => {
  const config = loadAppConfig();
  const contrato = carregarContrato(config.openapiSpecPath);

  banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const assinador = criarTokenSigner(config.token);

  // ==========================================================================
  // O SERVIDOR PRECISA DO VERIFICADOR DE REAUTENTICAÇÃO, E A FALTA DELE ERA UM
  // VERMELHO DE INTEGRAÇÃO, NÃO UMA OPÇÃO.
  // ==========================================================================
  // `requestEmailChange` passou a declarar `reauthScope: 'email_change'` quando
  // a BICHUS-42 e a maquinaria da BICHUS-48 se encontraram na integração de
  // 22/09 (merge `6e071a5`). O portão de `registrar-rota.ts` recusa subir uma
  // rota destrutiva num servidor sem o decorador, e recusar é o que ele deve
  // fazer: servidor de teste mais permissivo que o de produção mede outra
  // coisa. Este arquivo continuava montando o servidor como antes do encontro,
  // então o `before` estourava e os nove casos saíam CANCELADOS.
  //
  // A fiação é a mesma de `src/bin/api.ts` e a dos outros quatro arquivos de
  // integração que sobem rota com `reauthScope`: o verificador precisa das
  // dependências das rotas, e as dependências só existem depois, então ele
  // nasce como armadilha e é trocado abaixo.
  let verificarReautenticacao: VerificadorDeReautenticacao = () => {
    throw new Error('verificador chamado antes de a fiacao terminar');
  };

  app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    teto: tetoDeTeste(),
    reautenticacao: (request, escopo) => verificarReautenticacao(request, escopo),
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
      ids,
      baseDaWeb: config.publicBaseUrl,
      registrarOcorrencia: () => {
        /* idem */
      },
    }),
  });

  const dependenciasDasRotas: DependenciasDasRotas = {
    auth,
    assinador,
    contrato,
    issuer: config.token.issuer,
    apiBaseUrl: config.apiBaseUrl,
  };
  verificarReautenticacao = criarVerificadorDeReautenticacao(dependenciasDasRotas);

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, dependenciasDasRotas);
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

  void it('9. trocar a senha cancela a troca de e-mail pendente (critério 9)', async () => {
    const tutor = await criarTutor('senha');
    const destino = enderecoNovo('destino-senha');

    await pedirTroca(tutor, destino);
    const token = tokenDoLink((mensagensPara(destino)[0] as Mensagem).corpo);
    assert.equal((await perfil(tutor.acesso)).pending_email, destino);

    const troca = await chamar('/auth/password', {
      metodo: 'PUT',
      token: tutor.acesso,
      corpo: { current_password: SENHA, new_password: 'vento-sul-na-varanda-88' },
    });
    assert.equal(troca.status, 204, JSON.stringify(troca.corpo));

    // O link emitido antes da troca de senha é por onde quem tomou a conta
    // volta. Ele precisa estar morto.
    const confirmacao = await chamar('/auth/email-verification/confirm', {
      metodo: 'POST',
      corpo: { token },
    });
    assert.equal(
      confirmacao.status,
      410,
      'o link de troca emitido ANTES da troca de senha continua valendo depois ' +
        'dela. É exatamente por ele que quem tomou a conta volta.',
    );

    // E o pendente some da tela: aviso que não corresponde a nada é o que
    // ensina a pessoa a ignorar aviso.
    const entrarDeNovo = await chamar('/auth/login', {
      metodo: 'POST',
      corpo: { email: tutor.email, password: 'vento-sul-na-varanda-88', stay_signed_in: false },
    });
    assert.equal(entrarDeNovo.status, 200);
    const depois = await perfil((entrarDeNovo.corpo as { access_token: string }).access_token);
    assert.equal(depois.pending_email, null, 'a troca pendente sobreviveu à troca de senha');
    assert.equal(depois.email, tutor.email);
  });

  void it('8. sem sessão não há pedido: 401, e nada é gravado', async () => {
    const semToken = await chamar(CAMINHO_DA_TROCA, {
      metodo: 'POST',
      corpo: { new_email: enderecoNovo('sem-sessao') },
    });
    assert.equal(semToken.status, 401, JSON.stringify(semToken.corpo));
  });

  void it('10. ISCA — com sessão e SEM X-Reauth-Token a rota recusa, e nada é gravado', async () => {
    // O caso que faltava, e a colisão de integração de 22/09 é quem o pediu.
    // Os nove acima foram escritos quando a reautenticação não existia em
    // `src/`, então todos assumiam que uma sessão bastava. Quando a BICHUS-48
    // chegou e `requestEmailChange` passou a declarar a segunda credencial,
    // nenhum caso mediu a exigência: o arquivo virou vermelho por não
    // apresentar o cabeçalho, e não havia um só caso dizendo que apresentá-lo é
    // obrigatório. É este o caso que teria pego a divergência no dia.
    assert.equal(
      ESCOPO_DECLARADO_NA_ROTA,
      ESCOPO_DA_TROCA,
      'a rota parou de declarar `reauthScope`. Sem a declaração, `registrarRota` não instala ' +
        'o portão e a troca de e-mail volta a valer só com a sessão — que é exatamente o que o ' +
        'contrato proíbe em `x-reauth-scope: email_change`.',
    );

    const tutor = await criarTutor('sem-janela');
    const destino = enderecoNovo('destino-sem-janela');

    const antesNoAntigo = mensagensPara(tutor.email).length;
    const semJanela = await chamar(CAMINHO_DA_TROCA, {
      metodo: 'POST',
      corpo: { new_email: destino },
      token: tutor.acesso,
    });

    assert.equal(
      semJanela.status,
      401,
      'a troca de e-mail foi aceita só com a sessão. Quem toma uma sessão troca o endereço e ' +
        'captura a conta pela recuperação de senha: é a operação destrutiva que o contrato ' +
        'promete sob senha, servida sem ela.',
    );
    assert.match(
      JSON.stringify(semJanela.corpo),
      /reauthentication-required/,
      'a recusa não é a da segunda credencial, e o app não sabe abrir a folha de senha por ' +
        'outro `type`',
    );

    // Recusa é recusa: nem intenção gravada, nem mensagem saindo.
    const linha = await banco.db
      .selectFrom('users')
      .select(['email', 'pending_email'])
      .where('id', '=', tutor.id)
      .executeTakeFirstOrThrow();
    assert.equal(linha.email, tutor.email);
    assert.equal(linha.pending_email, null, 'a intenção foi gravada por um pedido recusado');
    assert.equal(mensagensPara(destino).length, 0, 'o endereço novo recebeu e-mail de um 401');
    assert.equal(
      mensagensPara(tutor.email).length,
      antesNoAntigo,
      'o endereço antigo recebeu aviso de um pedido que a rota recusou',
    );

    // E a mesma chamada, com a janela, passa. Sem esta metade o caso mediria
    // "a rota recusa", que uma rota quebrada também faz.
    const comJanela = await chamar(CAMINHO_DA_TROCA, {
      metodo: 'POST',
      corpo: { new_email: destino },
      token: tutor.acesso,
      reauth: await abrirJanela(tutor),
    });
    assert.equal(comJanela.status, 202, JSON.stringify(comJanela.corpo));
    assert.equal((await perfil(tutor.acesso)).pending_email, destino);
  });

  void it('11. a janela é de uso único: repetir o MESMO X-Reauth-Token recusa', async () => {
    // Por que isto é caso e não comentário: a suite pede uma janela por ação, e
    // quem vier depois vai sentir vontade de guardar o token num `before` para
    // economizar uma chamada. O dia em que alguém fizer isso, os casos
    // reprovam com "reauthentication-required" e o vermelho parece defeito da
    // troca de e-mail. Este caso nomeia o motivo antes que isso aconteça.
    const tutor = await criarTutor('uso-unico');
    const janela = await abrirJanela(tutor);

    const primeiro = await chamar(CAMINHO_DA_TROCA, {
      metodo: 'POST',
      corpo: { new_email: enderecoNovo('destino-uso-um') },
      token: tutor.acesso,
      reauth: janela,
    });
    assert.equal(primeiro.status, 202, JSON.stringify(primeiro.corpo));

    const segundo = await chamar(CAMINHO_DA_TROCA, {
      metodo: 'POST',
      corpo: { new_email: enderecoNovo('destino-uso-dois') },
      token: tutor.acesso,
      reauth: janela,
    });
    assert.equal(
      segundo.status,
      401,
      `a mesma janela serviu duas vezes (${String(segundo.status)}). Uso único é o que impede ` +
        'que um token capturado uma vez continue autorizando troca de endereço pelos 300 ' +
        'segundos inteiros.',
    );
  });
});
