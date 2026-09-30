/**
 * **A janela de reautenticacao, pela rota, contra Postgres de verdade.**
 *
 * ## O que este arquivo existe para pegar, e o que so ele pega
 *
 * `POST /v1/auth/reauth` abre uma janela de 5 minutos para UMA finalidade, e
 * as operacoes destrutivas do contrato a exigem no cabecalho
 * `X-Reauth-Token`. Cinco das amarras da janela vivem em lugares que **dublê
 * nenhum consegue reproduzir**:
 *
 * | amarra | onde ela e imposta | o que um dublê faria |
 * |---|---|---|
 * | finalidade e um dos seis valores | `CHECK` de `reauth_tokens.scope` | guardaria qualquer string |
 * | a conta existe | `REFERENCES users (id)` | aceitaria um UUID inventado |
 * | uso unico sob concorrencia | `UPDATE ... WHERE consumed_at IS NULL` | devolveria sucesso as duas chamadas |
 * | escopo, sessao e barreira | as sete clausulas do mesmo `WHERE` | leria a linha e decidiria depois |
 * | a linha morre com a conta | `ON DELETE CASCADE` | ficaria para sempre |
 *
 * A quarta linha e a mais importante e a menos visivel: o `UPDATE` que
 * consome tambem e o que confere (ADR-0021). Um dublê que lesse e depois
 * marcasse passaria em todos os casos deste arquivo **menos** sob corrida, e a
 * corrida e o ataque.
 *
 * ## O criterio 9, que e o unico que nao e sobre negar
 *
 * Reautenticacao e oraculo de senha por construcao: quem tomou a sessao testa
 * senhas aqui sem disparar nada do login, que se defende por e-mail e por IP e
 * nao por conta. O teto do contrato e 5 **invalidas** por hora por conta. O que
 * ele NAO pode fazer e trancar o titular para fora do proprio remedio: a
 * recuperacao de senha continua aberta, e ha um caso aqui para isso.
 *
 * ## A isca, e como ela foi provada
 *
 * Desligada uma de cada vez, rodada, vista reprovar, e religada -- em
 * 22/09/2026, com node 22.23.2 e a pilha de integracao efemera. O roteiro
 * ABORTA quando o trecho a desligar nao casa exatamente uma vez, e confere a
 * mudanca por sha256 E por `git diff` nao vazio antes de rodar.
 *
 * | o que foi desligado | reprovaram |
 * |---|---|
 * | `reauthScope` de `rotaDeLogoutTotal` | nao compila (o proprio tipo acusa) |
 * | `reauthScope: 'session_revocation'` -> `'tag_revocation'` | 1 (o portao de contrato, pelo VALOR) |
 * | `reauthScope` acrescentado a `/auth/logout`, que o contrato nao marca | 7 |
 * | `.where('token_hash'...)` -- ver nota abaixo | nao aplicavel |
 * | `.where('user_id', '=', consumo.userId)` do consumo | 3 |
 * | `.where('scope', '=', consumo.escopoExigido)` | 3 |
 * | `.where('access_jti', '=', consumo.acessoJti)` | 3 |
 * | `.where('consumed_at', 'is', null)` | 2 |
 * | `.where('expires_at', '>', ...)` | 2 |
 * | `.where('issued_at', '>=', ...)` (SEC-006) | 3 |
 * | a conferencia de `expiraEm` dentro de `conferirJanela` | 1 |
 * | a entrada `invalid_attempts` de `rotaDeReautenticacao` | 1 (so a integracao) |
 * | `detail` do 401 passando a dizer "a senha local desta conta" | 1 (so a integracao) |
 * | `session_revocation` fora do `CHECK` da migracao | 7 (so a integracao) |
 *
 * **A isca do teto nasceu inutil, e isso esta escrito aqui de proposito.** A
 * primeira versao afirmava "alguma das seis tentativas levou 429" e ficava
 * VERDE com a entrada `invalid_attempts` removida, porque a outra entrada da
 * mesma rota (10 por hora) tambem responde 429 -- so que na decima primeira
 * chamada. E a primeira versao do roteiro apontava para o bloco de
 * `rotaDeTrocaDeSenha`, que tem o texto identico: casou uma vez, desligou o
 * teto da rota errada, e teria produzido um relatorio errado. Confira a
 * clausula que existe, nao a que voce espera encontrar.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha e efemera e migra do zero. E isso que faz deste arquivo uma prova
 * sobre a MIGRACAO `20260922000005_reautenticacao-com-senha.sql`, e nao sobre
 * o banco que por acaso estava na maquina de quem rodou.
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
import type { VerificadorDeReautenticacao } from '../../src/shared/http/registrar-rota.js';
import type { RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';
import { criarTrilhaDeAuditoria } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../../src/modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import {
  criarVerificadorDeReautenticacao,
  registrarRotasDeIdentidade,
  rotaDeLogoutTotal,
  rotaDeReautenticacao,
  type DependenciasDasRotas,
} from '../../src/modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../../src/modules/identity/application/aviso-de-reuso.js';
import type { Mailer, Mensagem } from '../../src/modules/identity/ports/mailer.js';
import { JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS } from '../../src/modules/identity/domain/reautenticacao.js';

const PREFIXO_DA_API = '/v1';
const DOMINIO_DE_TESTE = 'exemplo.invalid';
const SENHA = 'chuva-morna-no-telhado-47';
const SENHA_ERRADA = 'vento-frio-na-varanda-88';

/** Os caminhos saem da DECLARACAO da rota; escritos a mao viram 404 em silencio. */
const REAUTH = rotaDeReautenticacao.path;
const LOGOUT_TOTAL = rotaDeLogoutTotal.path;

/**
 * O escopo tambem sai da declaracao. Ele e `session_revocation` hoje; o que
 * este arquivo afirma e que a rota exige EXATAMENTE o escopo que declara, e
 * nao que o valor seja esse.
 */
const ESCOPO_CERTO = rotaDeLogoutTotal.reauthScope;

/**
 * Um escopo que a rota NAO exige, para o caso do escopo trocado.
 *
 * Tirado do enum do contrato em vez de escrito a mao: assim ele continua sendo
 * um escopo valido de `POST /auth/reauth` -- o caso mede "janela legitima de
 * outra finalidade", e nao "valor invalido", que e outra coisa e responderia
 * 400 na validacao do corpo.
 */
const ESCOPO_DE_OUTRA_FINALIDADE = 'tag_revocation';

let app: RegistradorDeRotas;
let banco: { db: Db; close: () => Promise<void> };
let base: string;
const contas: UserId[] = [];
const caixaDeEntrada: Mensagem[] = [];

interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
}

interface Sessao {
  readonly access_token: string;
  readonly refresh_token: string;
}

async function chamar(
  caminho: string,
  opcoes: { metodo: 'GET' | 'POST'; corpo?: unknown; token?: string; reauth?: string },
): Promise<Resposta> {
  const cabecalhos: Record<string, string> = { accept: 'application/json' };
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  if (opcoes.token !== undefined) cabecalhos['authorization'] = `Bearer ${opcoes.token}`;
  if (opcoes.reauth !== undefined) cabecalhos['x-reauth-token'] = opcoes.reauth;

  const resposta = await fetch(`${base}${PREFIXO_DA_API}${caminho}`, {
    method: opcoes.metodo,
    headers: cabecalhos,
    ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto === '' ? undefined : JSON.parse(texto) };
}

/** Uma conta nova por cenario: os casos derrubam sessoes e nao podem se cruzar. */
async function contaNova(rotulo: string): Promise<{ id: UserId; email: string; sessao: Sessao }> {
  const email = `reauth-${rotulo}-${randomUUID().slice(0, 8)}@${DOMINIO_DE_TESTE}`;
  const cadastro = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: { email, password: SENHA },
  });
  assert.equal(
    cadastro.status,
    201,
    `a conta ${email} nao foi criada (${String(cadastro.status)}): ${JSON.stringify(cadastro.corpo)}`,
  );
  const corpo = cadastro.corpo as { user: { id: string } } & Sessao;
  const id = corpo.user.id as UserId;
  contas.push(id);
  return { id, email, sessao: { access_token: corpo.access_token, refresh_token: corpo.refresh_token } };
}

async function entrar(email: string): Promise<Sessao> {
  const login = await chamar('/auth/login', {
    metodo: 'POST',
    corpo: { email, password: SENHA, stay_signed_in: false },
  });
  assert.equal(login.status, 200, `login de ${email}: ${JSON.stringify(login.corpo)}`);
  return login.corpo as Sessao;
}

async function abrirJanela(acesso: string, escopo: string): Promise<string> {
  const resposta = await chamar(REAUTH, {
    metodo: 'POST',
    token: acesso,
    corpo: { password: SENHA, scope: escopo },
  });
  assert.equal(
    resposta.status,
    200,
    `POST ${REAUTH} recusou a senha certa (${String(resposta.status)}): ${JSON.stringify(resposta.corpo)}`,
  );
  return (resposta.corpo as { reauth_token: string }).reauth_token;
}

/** O `type` do problema, sem o prefixo da URL. */
function tipoDoProblema(corpo: unknown): string {
  const tipo = (corpo as { type?: unknown }).type;
  return typeof tipo === 'string' ? (tipo.split('/').pop() ?? '') : '';
}

before(async () => {
  const config = loadAppConfig();
  const contrato = carregarContrato(config.openapiSpecPath);

  banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const assinador = criarTokenSigner(config.token);

  let verificarReautenticacao: VerificadorDeReautenticacao = () => {
    throw new Error('verificador chamado antes de a fiacao terminar');
  };

  app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    // Contador EM MEMORIA, e nao desligado: o caso do teto de tentativa
    // precisa de um contador que conte de verdade.
    teto: tetoDeTeste(),
    reautenticacao: (request, escopo) => verificarReautenticacao(request, escopo),
  });

  const trilha = criarTrilhaDeAuditoria({
    db,
    ids,
    clock: systemClock,
    ipHmacKey: config.ipHmacKey,
    onFailure: (erro) => {
      console.error('trilha de auditoria nao gravou:', erro);
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
    // SEC-019: `derrubarTodasAsSessoes` remove o cadastro de push. Esta bancada
    // não é sobre isso, então a função é contada e não observada. O caso que
    // PROVA a remoção, lendo a linha de `user_devices` depois, é
    // `sair-de-todos-os-aparelhos.test.ts` e
    // `tests/integration/sair-de-todos-pelo-http.test.ts`.
    removerPushDaConta: () => Promise.resolve(0),
    repositorio,
    assinador,
    trilha,
    ids,
    clock: systemClock,
    janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    mailer,
    registrarOcorrencia: () => {
      // Nenhum caso deste arquivo afirma log.
    },
    baseDaWeb: config.publicBaseUrl,
    avisarTitular: criarAvisoDeReusoAoTitular({
      repositorio,
      mailer,
      ids,
      baseDaWeb: config.publicBaseUrl,
      registrarOcorrencia: () => {
        // idem
      },
    }),
  });

  const deps: DependenciasDasRotas = {
    auth,
    assinador,
    contrato,
    issuer: config.token.issuer,
    apiBaseUrl: config.apiBaseUrl,
  };
  verificarReautenticacao = criarVerificadorDeReautenticacao(deps);

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, deps);
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

void describe('BICHUS-48 — POST /v1/auth/reauth abre a janela, e so com a senha certa', () => {
  void it('a senha certa devolve 200 com `expires_in` de 300 segundos', async () => {
    const { sessao } = await contaNova('abre');
    const resposta = await chamar(REAUTH, {
      metodo: 'POST',
      token: sessao.access_token,
      corpo: { password: SENHA, scope: ESCOPO_CERTO },
    });

    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const corpo = resposta.corpo as { reauth_token?: unknown; expires_in?: unknown; scope?: unknown };
    assert.equal(
      corpo.expires_in,
      JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS,
      'o criterio 10 e o contrato fixam 300 segundos, e o valor sai de UM lugar so ' +
        '(`JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS`).',
    );
    assert.equal(corpo.scope, ESCOPO_CERTO);
    assert.equal(
      typeof corpo.reauth_token,
      'string',
      'a resposta nao trouxe a janela. Sem ela a folha de senha nao tem o que apresentar.',
    );
  });

  void it('a senha errada responde 401 `invalid-credentials`, e nao diz nada sobre a conta', async () => {
    const { sessao } = await contaNova('senha-errada');
    const resposta = await chamar(REAUTH, {
      metodo: 'POST',
      token: sessao.access_token,
      corpo: { password: SENHA_ERRADA, scope: ESCOPO_CERTO },
    });

    assert.equal(resposta.status, 401, JSON.stringify(resposta.corpo));
    assert.equal(
      tipoDoProblema(resposta.corpo),
      'invalid-credentials',
      'o `type` precisa ser `invalid-credentials`: e ele que `registrarRota` conta como ' +
        'tentativa invalida, e sem ele o teto de 5 por hora do contrato nunca e alcancado.',
    );

    // A RESPOSTA NAO PODE DESCREVER A CONTA. Nem "esta conta nao tem senha
    // local", nem o endereco de e-mail, nem nada sobre COMO ela se autentica --
    // que e a pergunta que decide onde o ataque insiste quando o primeiro
    // provedor externo entrar.
    //
    // O que esta conferencia alcanca, e o que ela nao alcanca: ela le o texto
    // que sai. Ela NAO consegue comparar a resposta de uma conta sem senha
    // local com a de uma com senha, porque nao existe caminho em `src/` que
    // crie identidade `google`, `apple` ou `keycloak` (medido em 22/09, e as
    // tres estao na restricao de `user_identities.provider`). A simetria de
    // `reautenticar` esta escrita e testada no unitario; o dia em que o
    // primeiro provedor externo entrar, o caso que falta e um cadastro por ele
    // e a mesma medicao aqui.
    const texto = `${String((resposta.corpo as { title?: unknown }).title)} ` +
      `${String((resposta.corpo as { detail?: unknown }).detail)}`;
    for (const proibido of ['local', 'phc', 'provider', 'externo', 'hash']) {
      assert.ok(
        !texto.toLowerCase().includes(proibido),
        `o texto do 401 menciona '${proibido}' e descreve como a conta se autentica: ${texto}`,
      );
    }
    assert.ok(
      !JSON.stringify(resposta.corpo).includes('@'),
      `o corpo do 401 carrega um endereco de e-mail: ${JSON.stringify(resposta.corpo)}`,
    );
  });

  void it('a senha errada NAO derruba a sessao normal: a pessoa continua no app', async () => {
    const { sessao } = await contaNova('sessao-sobrevive');
    await chamar(REAUTH, {
      metodo: 'POST',
      token: sessao.access_token,
      corpo: { password: SENHA_ERRADA, scope: ESCOPO_CERTO },
    });

    const perfil = await chamar('/me', { metodo: 'GET', token: sessao.access_token });
    assert.equal(
      perfil.status,
      200,
      `errar a senha na folha de reautenticacao deslogou a pessoa (${String(perfil.status)}). ` +
        'O criterio 3 e explicito: a conveniencia fica na navegacao e o custo fica no ato ' +
        'destrutivo. Deslogar aqui poe o custo no lugar errado.',
    );
  });
});

void describe('BICHUS-48 — a janela vale para o que foi aberta, e so uma vez', () => {
  void it('a janela do escopo certo deixa `logout-all` passar', async () => {
    const { email } = await contaNova('escopo-certo');
    const sessao = await entrar(email);
    const janela = await abrirJanela(sessao.access_token, ESCOPO_CERTO);

    const resposta = await chamar(LOGOUT_TOTAL, {
      metodo: 'POST',
      token: sessao.access_token,
      reauth: janela,
    });
    assert.equal(resposta.status, 204, JSON.stringify(resposta.corpo));
  });

  void it('a janela de OUTRA finalidade e recusada com 401, e nao com 403', async () => {
    const { email } = await contaNova('escopo-trocado');
    const sessao = await entrar(email);
    // Janela legitima, senha certa, dentro dos 5 minutos -- e aberta para
    // revogar uma plaquinha. Sem esta amarra, quem reautentica para revogar uma
    // tag emite sem saber uma autorizacao para derrubar a conta inteira.
    const janela = await abrirJanela(sessao.access_token, ESCOPO_DE_OUTRA_FINALIDADE);

    const resposta = await chamar(LOGOUT_TOTAL, {
      metodo: 'POST',
      token: sessao.access_token,
      reauth: janela,
    });
    assert.equal(
      resposta.status,
      401,
      `a janela de '${ESCOPO_DE_OUTRA_FINALIDADE}' serviu para '${String(ESCOPO_CERTO)}' ` +
        `(${String(resposta.status)}): ${JSON.stringify(resposta.corpo)}`,
    );
    assert.equal(
      tipoDoProblema(resposta.corpo),
      'reauthentication-required',
      '401 e nao 403, e o contrato diz por que: a janela para AQUELA finalidade ' +
        'simplesmente nao foi aberta. 403 diria "voce nao pode", que e outra coisa.',
    );
  });

  void it('a janela e de uso unico: a segunda apresentacao do mesmo valor e 401', async () => {
    const { email } = await contaNova('uso-unico');
    const primeira = await entrar(email);
    const janela = await abrirJanela(primeira.access_token, ESCOPO_CERTO);

    const usoUm = await chamar(LOGOUT_TOTAL, {
      metodo: 'POST',
      token: primeira.access_token,
      reauth: janela,
    });
    assert.equal(usoUm.status, 204, JSON.stringify(usoUm.corpo));

    // Sessao nova, porque a anterior caiu com o proprio logout-all. A janela e
    // a MESMA, e e isso que o caso mede.
    const segunda = await entrar(email);
    const usoDois = await chamar(LOGOUT_TOTAL, {
      metodo: 'POST',
      token: segunda.access_token,
      reauth: janela,
    });
    assert.equal(
      usoDois.status,
      401,
      `a mesma janela serviu duas vezes (${String(usoDois.status)}). O esquema \`reauth\` ` +
        'do contrato declara uso unico; sem ele um valor capturado no primeiro uso vale ' +
        'pelos 5 minutos inteiros.',
    );
  });

  void it('a janela de uma conta nao serve na sessao de outra', async () => {
    const alvo = await contaNova('vitima');
    const outra = await contaNova('vizinha');

    const sessaoDoAlvo = await entrar(alvo.email);
    const janelaDaOutra = await abrirJanela(outra.sessao.access_token, ESCOPO_CERTO);

    const resposta = await chamar(LOGOUT_TOTAL, {
      metodo: 'POST',
      token: sessaoDoAlvo.access_token,
      reauth: janelaDaOutra,
    });
    assert.equal(
      resposta.status,
      401,
      'a janela de outra conta derrubou as sessoes desta. O `user_id` saiu do `WHERE` de ' +
        '`construtorDoConsumoDaJanela`, e uma janela legitima virou chave mestra.',
    );

    const perfil = await chamar('/me', { metodo: 'GET', token: sessaoDoAlvo.access_token });
    assert.equal(
      perfil.status,
      200,
      'a recusa revogou as sessoes do alvo assim mesmo. O 401 precisa acontecer ANTES do ' +
        'efeito, senao ele e so um rotulo em cima de um estrago consumado.',
    );
  });

  void it('a janela nao atravessa de um aparelho para outro', async () => {
    const { email } = await contaNova('outro-aparelho');
    const aparelhoA = await entrar(email);
    const aparelhoB = await entrar(email);

    // Mesma conta, mesma senha, dois `jti`. O esquema `reauth` do contrato diz
    // "preso ao `jti` do token de acesso que o pediu": a janela aberta no
    // aparelho roubado nao vale no aparelho de casa, e vice-versa.
    const janelaDoA = await abrirJanela(aparelhoA.access_token, ESCOPO_CERTO);

    const resposta = await chamar(LOGOUT_TOTAL, {
      metodo: 'POST',
      token: aparelhoB.access_token,
      reauth: janelaDoA,
    });
    assert.equal(
      resposta.status,
      401,
      'a janela aberta num aparelho valeu em outro. O `access_jti` saiu do `WHERE`, e o ' +
        'vinculo com a sessao que o contrato declara deixou de existir.',
    );
  });

  void it('sem cabecalho nenhum, a resposta e a MESMA de uma janela que nao serve', async () => {
    // Criterio 11, e a razao e de interface: a folha de senha abre igual nos
    // dois casos, e o app nao precisa de dois caminhos. Uma resposta diferente
    // para "ausente" e para "nao serve" tambem contaria a quem esta atacando se
    // o valor que ele tentou chegou a existir.
    const { email } = await contaNova('sem-cabecalho');
    const sessao = await entrar(email);

    const ausente = await chamar(LOGOUT_TOTAL, { metodo: 'POST', token: sessao.access_token });
    const inventada = await chamar(LOGOUT_TOTAL, {
      metodo: 'POST',
      token: sessao.access_token,
      reauth: 'janela-que-nunca-existiu-'.padEnd(64, 'x'),
    });

    assert.equal(ausente.status, 401, JSON.stringify(ausente.corpo));
    assert.equal(inventada.status, 401, JSON.stringify(inventada.corpo));
    assert.equal(tipoDoProblema(ausente.corpo), 'reauthentication-required');
    assert.equal(
      tipoDoProblema(inventada.corpo),
      tipoDoProblema(ausente.corpo),
      'cabecalho ausente e cabecalho que nao serve respondem `type` diferente. A diferenca ' +
        'e um oraculo, e e um caminho a mais para o app manter.',
    );
  });
});

void describe('BICHUS-48 — o teto de tentativa, e o que ele nao pode trancar', () => {
  void it('a sexta senha errada na mesma hora responde 429 com `Retry-After`', async () => {
    const { sessao } = await contaNova('teto');

    // O contrato declara 5 invalidas por hora por conta. A contagem e por
    // `type` do problema e acontece em `onResponse`, DEPOIS da resposta sair:
    // as chamadas vao em serie de proposito, porque em paralelo a sexta poderia
    // sair antes de a quinta ter sido contada.
    const respostas: Resposta[] = [];
    for (let i = 0; i < 6; i += 1) {
      respostas.push(
        await chamar(REAUTH, {
          metodo: 'POST',
          token: sessao.access_token,
          corpo: { password: SENHA_ERRADA, scope: ESCOPO_CERTO },
        }),
      );
    }

    // A POSICAO, e nao "alguma delas". O contrato declara 5 invalidas por hora:
    // a quinta ainda e recusada por credencial (401) e a SEXTA e recusada pelo
    // teto (429). Afirmar apenas "alguma levou 429" deixaria passar a remocao
    // da entrada `invalid_attempts`, porque a outra entrada da rota (10 por
    // hora) tambem responde 429 -- so que na decima primeira chamada, que e
    // tarde demais para servir de defesa contra forca bruta.
    const status = respostas.map((r) => r.status);
    assert.deepEqual(
      status.slice(0, 5),
      [401, 401, 401, 401, 401],
      `as cinco primeiras tentativas com senha errada deviam ser 401 de credencial: ` +
        `${JSON.stringify(status)}. Um 429 antes da quinta trancaria o titular que errou ` +
        'a senha quatro vezes, e o criterio 3 poe o custo no ato destrutivo, nao na navegacao.',
    );
    assert.equal(
      status[5],
      429,
      `a SEXTA tentativa com senha errada respondeu ${String(status[5])}: ` +
        `${JSON.stringify(status)}.\n\n` +
        'Sem o teto de 5 invalidas por hora, reautenticacao e um oraculo de senha aberto a ' +
        'quem tomou a sessao: ele testa a vontade e o login nem fica sabendo, porque o login ' +
        'se defende por e-mail e por IP, e nao por conta. O teto de 10 por hora da mesma ' +
        'rota NAO cobre isto -- ele so recusa na decima primeira chamada.',
    );
    const ultima = respostas[5];
    assert.ok(
      ultima !== undefined && (ultima.corpo as { title?: unknown }).title !== undefined,
      'o 429 saiu sem corpo de problema',
    );
  });

  void it('estourar o teto NAO fecha a recuperacao de senha (criterio 9)', async () => {
    const { email, sessao } = await contaNova('recuperacao');

    for (let i = 0; i < 6; i += 1) {
      await chamar(REAUTH, {
        metodo: 'POST',
        token: sessao.access_token,
        corpo: { password: SENHA_ERRADA, scope: ESCOPO_CERTO },
      });
    }

    const recuperacao = await chamar('/auth/password-reset', {
      metodo: 'POST',
      corpo: { email },
    });
    assert.equal(
      recuperacao.status,
      202,
      `a recuperacao de senha respondeu ${String(recuperacao.status)} depois de o teto de ` +
        'reautenticacao estourar. O titular que esqueceu a senha ficaria trancado para fora ' +
        'do proprio remedio por ter errado seis vezes -- e quem tomou a conta dele teria ' +
        'conseguido isso de proposito.',
    );
  });
});

void describe('BICHUS-48 — o que so o banco responde', () => {
  void it('a linha da janela morre junto com a conta (`ON DELETE CASCADE`)', async () => {
    const { id, sessao } = await contaNova('cascade');
    await abrirJanela(sessao.access_token, ESCOPO_CERTO);

    const antes = await banco.db
      .selectFrom('reauth_tokens')
      .select('id')
      .where('user_id', '=', id)
      .execute();
    assert.equal(antes.length, 1, 'a janela nao foi gravada; o caso abaixo nao mediria nada.');

    await banco.db.deleteFrom('users').where('id', '=', id).execute();

    const depois = await banco.db
      .selectFrom('reauth_tokens')
      .select('id')
      .where('user_id', '=', id)
      .execute();
    assert.equal(
      depois.length,
      0,
      'a janela sobreviveu a exclusao da conta. `ON DELETE CASCADE` virou outra coisa, e a ' +
        'exclusao de conta passaria a falhar por chave estrangeira -- que e exatamente o ' +
        'defeito que `chave-estrangeira-contra-restricao` procura.',
    );
  });

  void it('o banco recusa um escopo fora dos seis', async () => {
    const { id } = await contaNova('escopo-invalido');

    // A trava de ultima instancia. A borda ja recusa com 400 pelo enum do
    // contrato, e o tipo do TypeScript ja recusa antes disso -- mas os dois
    // valem so para quem passa por eles. O `CHECK` vale para qualquer escrita,
    // inclusive a de um script de correcao rodado a mao as tres da manha.
    await assert.rejects(
      banco.db
        .insertInto('reauth_tokens')
        .values({
          id: randomUUID(),
          user_id: id,
          access_jti: randomUUID(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          scope: 'apagar_tudo' as any,
          token_hash: Buffer.from(randomUUID()),
          issued_at: new Date(),
          expires_at: new Date(Date.now() + 300_000),
          created_ip_hmac: null,
        })
        .execute(),
      /reauth_tokens_escopo|violates check constraint/i,
      'o banco aceitou um escopo que nao existe. A restricao `reauth_tokens_escopo` sumiu, ' +
        'e a coluna voltou a aceitar qualquer string -- que e a forma exata do defeito de ' +
        '22/09 com `logout_all`.',
    );
  });
});
