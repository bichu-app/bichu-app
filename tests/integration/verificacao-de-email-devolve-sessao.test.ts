/**
 * `POST /v1/auth/email-verification/confirm` devolve **sessão**, e a sessão
 * funciona.
 *
 * ## Por que este arquivo existe
 *
 * Em 29/09/2026, em homologação (`hml.bichu.app`, commit `c3708d2`), a rota
 * respondia 200 com o schema `Me` — `id`, `email`, `email_verified`, o perfil
 * inteiro — onde o contrato declara `SessionResponse` desde a primeira onda.
 * Não havia `access_token`, `refresh_token`, `token_type` nem `expires_in`.
 *
 * O desvio não era de redação. A descrição do 200 diz por que a sessão sai
 * daqui — «devolve a sessao quando a requisicao veio sem token de acesso, para
 * que a intencao pendente execute em seguida» — e quem abre o link está na
 * página `/verificar-email`, que não tem token nenhum. Sem sessão na resposta,
 * a pessoa confirma o e-mail e tem que entrar de novo, e a intenção que ela
 * havia guardado (UX 8.3) morre ali. O app Flutter já lia a resposta como
 * sessão (`app/lib/api/auth_api.dart`, `Sessao.doJson`): os três documentos
 * concordavam entre si e discordavam do servidor.
 *
 * **Nenhum caso cobria o CORPO deste 200.** `troca-de-email.test.ts` e
 * `teto-das-confirmacoes-por-link.test.ts` chamam a rota e conferem o
 * *status*; nenhum olha o que veio dentro. Foi por esse buraco que o desvio
 * atravessou a esteira inteira até ser medido na mão em homologação.
 *
 * ## O que cada caso mede, e por que não bastava um
 *
 * 1. **A forma, lida do contrato e não copiada dele.** O conjunto de campos
 *    obrigatórios sai de `contrato.responseSchema('confirmEmailVerification',
 *    '200')` em tempo de execução. Uma lista literal aqui mediria o que eu
 *    escrevi; lida do documento, o dia em que o contrato mudar este caso muda
 *    junto, e o dia em que o código voltar a devolver `Me` ele reprova.
 * 2. **O token de acesso ABRE a conta.** Forma certa com token que não
 *    autentica é o mesmo defeito de produto com outra aparência: a intenção
 *    pendente continua sem executar. Só `GET /me` com aquele valor prova o
 *    contrário.
 * 3. **O refresh RENOVA.** É o que faz a sessão sobreviver aos 15 minutos do
 *    acesso; um refresh decorativo devolve a pessoa ao login uma hora depois.
 * 4. **O `user` da resposta já diz `email_verified: true`.** É a única
 *    diferença que a tela procura, e ela depende de a conta ser relida DEPOIS
 *    da escrita.
 * 5. **A confirmação da TROCA de endereço também devolve sessão, com o
 *    endereço novo.** Os dois propósitos entram pela mesma porta e o 200 é um
 *    só; o ramo da troca é o que passa por `concluirTrocaDeEmail`, e ele tem
 *    caminho próprio no código.
 *
 * ## Iscas conferidas
 *
 * Cada mecanismo foi desligado sozinho, com o arquivo alterado no disco antes
 * de rodar a suite inteira, e religado depois. O que cada uma reprovou:
 *
 * - **o handler voltando a devolver o perfil** (`reply.send(sessao.user)`, que
 *   é byte a byte o corpo medido em homologação): reprova os CINCO casos. Os
 *   casos 1 e 5 reprovam pela asserção que os nomeia; 2 e 3 reprovam porque
 *   `access_token` e `refresh_token` vêm `undefined` e a chamada seguinte sai
 *   401; o caso 4 reprova em `TypeError: Cannot read properties of undefined
 *   (reading 'email_verified')`, porque no corpo do perfil não existe `user`.
 *
 *   Eu havia previsto que o caso 4 sobreviveria a esta isca — o perfil também
 *   traz `email_verified` — e a previsão estava errada: ele lê o campo DE
 *   DENTRO de `user`, e é `user` que some. A previsão errada fica escrita
 *   porque ela é o próprio argumento de rodar isca em vez de deduzir;
 * - **a conta projetada lida ANTES de `marcarEmailVerificado`**: reprova só o
 *   caso 4, e com a mensagem dele (`actual: false, expected: true`);
 * - **`concluirTrocaDeEmail` devolvendo a conta antiga**: reprova só o caso 5.
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
import { carregarContrato, type Contrato } from '../../src/shared/http/contract.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { UserId } from '../../src/shared/types/brands.js';
import { criarTrilhaDeAuditoria } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../../src/modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import {
  criarVerificadorDeReautenticacao,
  registrarRotasDeIdentidade,
  rotaDeConfirmacaoDeEmail,
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

const PREFIXO_DA_API = '/v1';

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/** Nada em comum com o endereço: a política recusa senha parecida com o e-mail. */
const SENHA = 'chuva-morna-no-telhado-47';

/** O caminho vem da definição da rota, nunca de uma cópia. */
const CAMINHO_DA_CONFIRMACAO = rotaDeConfirmacaoDeEmail.path;
const CAMINHO_DA_TROCA = rotaDeTrocaDeEmail.path;
const CAMINHO_DA_REAUTENTICACAO = rotaDeReautenticacao.path;

let app: RegistradorDeRotas;
let banco: { db: Db; close: () => Promise<void> };
let base: string;
let contrato: Contrato;

const contas: UserId[] = [];

/** As mensagens que o serviço mandaria. Ninguém sai da máquina. */
const caixaDeEntrada: Mensagem[] = [];

function enderecoNovo(rotulo: string): string {
  return `sessao-${rotulo}-${randomUUID().slice(0, 8)}@${DOMINIO_DE_TESTE}`;
}

async function chamar(
  caminho: string,
  opcoes: { metodo: 'GET' | 'POST'; corpo?: unknown; token?: string; reauth?: string },
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

/**
 * Cria a conta e devolve o token do link que o cadastro disparou.
 *
 * O token em claro existe na função que emite e no corpo do e-mail, e em
 * nenhum outro lugar — nem na trilha, nem no log, nem na resposta. Lê-lo da
 * caixa de entrada é a única forma honesta de o teste seguir o caminho que a
 * pessoa segue.
 */
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

function mensagensPara(endereco: string): Mensagem[] {
  return caixaDeEntrada.filter((m) => m.para.toLowerCase() === endereco.toLowerCase());
}

function tokenDoLink(corpo: string): string {
  const achado = /[?&]token=([^\s&]+)/.exec(corpo);
  assert.ok(achado, `nenhum link com token no corpo da mensagem:\n${corpo}`);
  return achado[1] as string;
}

/** O token de verificação que o cadastro mandou para este endereço. */
function tokenDeVerificacaoDe(endereco: string): string {
  const mensagens = mensagensPara(endereco);
  assert.ok(
    mensagens.length > 0,
    `o cadastro não mandou verificação para ${endereco}: sem o link não há o que confirmar`,
  );
  return tokenDoLink((mensagens[mensagens.length - 1] as Mensagem).corpo);
}

/**
 * Confirma **sem `Authorization`**, que é a situação que a descrição do
 * contrato nomeia e a única em que o defeito aparece: a página
 * `/verificar-email` não tem token nenhum.
 */
async function confirmarSemToken(token: string): Promise<{ status: number; corpo: unknown }> {
  return chamar(CAMINHO_DA_CONFIRMACAO, { metodo: 'POST', corpo: { token } });
}

interface CorpoDeSessao {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly refresh_token: string;
  readonly user: { id: string; email: string; email_verified: boolean };
}

/**
 * Os campos que o contrato EXIGE no 200, lidos do documento em tempo de
 * execução.
 *
 * Repetir a lista aqui mediria o que eu escrevi. Lida de
 * `responseSchema`, ela acompanha o contrato: se `SessionResponse` ganhar um
 * campo obrigatório, este arquivo passa a cobrá-lo sem ninguém editar nada.
 */
function obrigatoriosDo200(): readonly string[] {
  const schema = contrato.responseSchema(rotaDeConfirmacaoDeEmail.operationId, '200');
  assert.ok(
    schema !== undefined,
    `o contrato não declara corpo para o 200 de ${rotaDeConfirmacaoDeEmail.operationId}: ` +
      'não há contra o que comparar, e um caso que não compara nada é pior que nenhum',
  );
  const exigidos = (schema as { required?: unknown }).required;
  assert.ok(
    Array.isArray(exigidos) && exigidos.length > 0,
    'o 200 do contrato não tem campo obrigatório nenhum; confira o schema antes deste caso',
  );
  return exigidos as readonly string[];
}

before(async () => {
  const config = loadAppConfig();
  contrato = carregarContrato(config.openapiSpecPath);

  banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const assinador = criarTokenSigner(config.token);

  // `POST /me/email-change` é destrutiva e declara `reauthScope`, e
  // `registrar-rota.ts` recusa subir rota destrutiva em servidor sem o
  // decorador. A fiação é a de `src/bin/api.ts`: o verificador precisa das
  // dependências, que só existem depois, então ele nasce como armadilha.
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
      // Silencioso de propósito: o que este arquivo afirma sai da resposta, da
      // caixa de entrada e do banco, nunca do log.
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

void describe(`POST ${CAMINHO_DA_CONFIRMACAO} devolve SessionResponse, e a sessão vale`, () => {
  void it('1. o corpo do 200 tem TODOS os campos que o contrato exige da sessão', async () => {
    const tutor = await criarTutor('forma');
    const resposta = await confirmarSemToken(tokenDeVerificacaoDe(tutor.email));

    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const corpo = resposta.corpo as Record<string, unknown>;

    const faltando = obrigatoriosDo200().filter((campo) => !(campo in corpo));
    assert.deepEqual(
      faltando,
      [],
      'o 200 não é a sessão que o contrato declara. Foi assim que a rota ' +
        'respondeu em homologação em 29/09/2026: o schema `Me` no lugar de ' +
        '`SessionResponse`. Quem abre o link confirma o e-mail e fica sem ' +
        'token — e a intenção pendente que a própria descrição do 200 promete ' +
        `executar em seguida não executa. Campos presentes: ${Object.keys(corpo).join(', ')}`,
    );
    assert.equal((corpo as unknown as CorpoDeSessao).token_type, 'Bearer');
  });

  void it('2. o access_token que veio no 200 abre a conta em GET /me', async () => {
    const tutor = await criarTutor('acesso');
    const resposta = await confirmarSemToken(tokenDeVerificacaoDe(tutor.email));
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const sessao = resposta.corpo as CorpoDeSessao;

    const eu = await chamar('/me', { metodo: 'GET', token: sessao.access_token });
    assert.equal(
      eu.status,
      200,
      'o token que a confirmação devolveu não autentica. Forma certa com token ' +
        'que não abre a conta é o mesmo defeito de produto com outra aparência: ' +
        `a intenção pendente continua sem executar. ${JSON.stringify(eu.corpo)}`,
    );
    assert.equal((eu.corpo as { id: string }).id, tutor.id);
  });

  void it('3. o refresh_token que veio no 200 renova a sessão', async () => {
    const tutor = await criarTutor('refresh');
    const resposta = await confirmarSemToken(tokenDeVerificacaoDe(tutor.email));
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const sessao = resposta.corpo as CorpoDeSessao;

    const renovada = await chamar('/auth/refresh', {
      metodo: 'POST',
      corpo: { refresh_token: sessao.refresh_token },
    });
    assert.equal(
      renovada.status,
      200,
      'o refresh da confirmação não renova. Sem ele a sessão morre com o acesso, ' +
        `e a pessoa volta ao login no meio do que estava fazendo. ${JSON.stringify(renovada.corpo)}`,
    );
    assert.ok(
      typeof (renovada.corpo as CorpoDeSessao).access_token === 'string',
      'a renovação não devolveu acesso novo',
    );
  });

  void it('4. o `user` da resposta já diz email_verified: true', async () => {
    const tutor = await criarTutor('perfil');
    const resposta = await confirmarSemToken(tokenDeVerificacaoDe(tutor.email));
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const sessao = resposta.corpo as CorpoDeSessao;

    assert.equal(
      sessao.user.email_verified,
      true,
      'a conta veio LIDA ANTES da escrita. A tela que recebe esta resposta ' +
        'procura exatamente este campo, e com `false` ela continua mostrando o ' +
        'aviso de e-mail por verificar logo depois de a pessoa ter verificado.',
    );
    assert.equal(sessao.user.id, tutor.id);
    assert.equal(sessao.user.email, tutor.email);
  });

  void it('5. a confirmação da TROCA de endereço também devolve sessão, com o endereço novo', async () => {
    const tutor = await criarTutor('troca');
    const destino = enderecoNovo('destino-troca');

    const janela = await chamar(CAMINHO_DA_REAUTENTICACAO, {
      metodo: 'POST',
      token: tutor.acesso,
      corpo: { password: SENHA, scope: 'email_change' },
    });
    assert.equal(janela.status, 200, JSON.stringify(janela.corpo));

    const pedido = await chamar(CAMINHO_DA_TROCA, {
      metodo: 'POST',
      corpo: { new_email: destino },
      token: tutor.acesso,
      reauth: (janela.corpo as { reauth_token: string }).reauth_token,
    });
    assert.equal(pedido.status, 202, JSON.stringify(pedido.corpo));

    // O link da troca vai para o endereço NOVO, e é só de lá que ele sai.
    const resposta = await confirmarSemToken(tokenDoLink(
      (mensagensPara(destino)[0] as Mensagem).corpo,
    ));
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const corpo = resposta.corpo as Record<string, unknown>;

    const faltando = obrigatoriosDo200().filter((campo) => !(campo in corpo));
    assert.deepEqual(
      faltando,
      [],
      'os dois propósitos entram pela mesma porta e o 200 é um só, mas o ramo ' +
        'da troca não devolveu sessão. É o ramo que passa por ' +
        `\`concluirTrocaDeEmail\`. Campos presentes: ${Object.keys(corpo).join(', ')}`,
    );
    assert.equal(
      (corpo as unknown as CorpoDeSessao).user.email,
      destino,
      'a sessão da troca carrega o endereço ANTIGO: a conta foi projetada de ' +
        'antes do `UPDATE`, e a tela mostraria o endereço que a pessoa acabou de trocar',
    );
  });
});
