/**
 * O teto de tentativas invalidas de `PUT /auth/password`, medido pela POSICAO
 * da recusa.
 *
 * ===========================================================================
 * POR QUE ESTA ROTA PRECISA DE ISCA PROPRIA
 * ===========================================================================
 * Trocar a senha exige `current_password` no proprio corpo. Quem tomou uma
 * sessao pode testar senhas ali, e o login nao fica sabendo: o login se defende
 * por e-mail e por IP, esta rota se defende por CONTA. Sem o teto de invalidas,
 * `PUT /auth/password` e oraculo de senha com a sessao na mao. A nota do
 * proprio contrato diz isso com todas as letras (`api/openapi.yaml`,
 * `changePassword`): "verifica `current_password`: sem limite, um token de
 * acesso roubado vira oraculo de senha".
 *
 * O comportamento ESTA correto: o teto existe e funciona. O que nao existia era
 * a vigilancia. Em 22/09 a entrada `applies_to: invalid_attempts` desta rota foi
 * removida e as duas suites ficaram VERDES -- unitaria e integracao. Este
 * arquivo e o que passa a reprovar.
 *
 * ===========================================================================
 * AS DUAS ARMADILHAS QUE JA PEGARAM ALGUEM NESTA MESMA ROTA
 * ===========================================================================
 * **1. "Alguma chamada levou 429" fica VERDE com a protecao removida.**
 * `changePassword` declara DUAS entradas de teto, as duas por `account` e as
 * duas `deny_429`:
 *
 *   - 10 por hora, contando TODA requisicao;
 *   - 5 por hora, contando so as INVALIDAS (`applies_to: invalid_attempts`).
 *
 * Apagar a segunda nao faz o 429 sumir: a primeira continua respondendo 429 --
 * so que na DECIMA PRIMEIRA chamada em vez da sexta. Um teste que afirme apenas
 * "alguma das chamadas levou 429" passa nos dois mundos e nao vigia nada. Foi
 * assim que a primeira isca de `POST /auth/reauth` nasceu inutil.
 *
 * Por isso o que este arquivo afirma e a POSICAO: as cinco primeiras respondem
 * 401 de credencial e a SEXTA responde 429. Dobrar o numero de tentativas que um
 * ladrao de sessao consegue por hora, de 5 para 10, e exatamente a regressao que
 * a medicao por presenca deixaria passar.
 *
 * **2. O numero esperado nao sai da declaracao da rota.**
 * `TETO_DE_INVALIDAS` e literal aqui, com a fonte citada, e nao
 * `rotaDeTrocaDeSenha.rateLimit[1].limit`. Um teste que tire o esperado do
 * mesmo lugar que exercita e tautologia: trocar 5 por 50 na rota passaria com a
 * suite verde, porque o teste teria passado a cobrar 50. O caso
 * `a rota declara o teto que o contrato declara` fecha o outro lado, comparando
 * a declaracao contra o literal -- sao duas afirmacoes independentes, e e a
 * independencia delas que da valor as duas.
 *
 * O CAMINHO, ao contrario do numero, sai da declaracao
 * (`rotaDeTrocaDeSenha.path`): caminho escrito a mao vira 404 em silencio, e
 * 404 nao e 429, entao a isca reprovaria pelo motivo errado.
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
import type { RateLimitEntry } from '../../src/shared/http/route-definition.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { UserId } from '../../src/shared/types/brands.js';
import type {
  RegistradorDeRotas,
  VerificadorDeReautenticacao,
} from '../../src/shared/http/registrar-rota.js';
import { criarTrilhaDeAuditoria } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../../src/modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import {
  criarVerificadorDeReautenticacao,
  registrarRotasDeIdentidade,
  rotaDePedidoDeRedefinicao,
  rotaDeTrocaDeSenha,
  type DependenciasDasRotas,
} from '../../src/modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../../src/modules/identity/application/aviso-de-reuso.js';
import type { Mailer, Mensagem } from '../../src/modules/identity/ports/mailer.js';
import { criarLocalizacaoDeReferenciaRepository } from '../../src/modules/identity/adapters/persistence/kysely-localizacao-de-referencia.js';

const PREFIXO_DA_API = '/v1';
const DOMINIO_DE_TESTE = 'exemplo.invalid';
const SENHA = 'chuva-morna-no-telhado-47';
const SENHA_ERRADA = 'vento-frio-na-varanda-88';
const SENHA_NOVA = 'barco-lento-na-manha-63';

/** Da DECLARACAO, nunca escrito a mao: caminho errado vira 404 em silencio. */
const TROCA_DE_SENHA = rotaDeTrocaDeSenha.path;
const PEDIDO_DE_REDEFINICAO = rotaDePedidoDeRedefinicao.path;

/**
 * O teto de tentativas INVALIDAS, literal e com fonte.
 *
 * Fonte: `api/openapi.yaml`, operacao `changePassword`, segunda entrada de
 * `x-rate-limit` (`applies_to: invalid_attempts`, `limit: 5`, `window: 1h`,
 * `on_exceed: deny_429`). ADR-0016 define o mecanismo.
 *
 * NAO sai de `rotaDeTrocaDeSenha.rateLimit`, e a distancia e o ponto: e ela que
 * transforma "o numero mudou" em suite vermelha.
 */
const TETO_DE_INVALIDAS = 5;

/** O outro teto da MESMA rota, que e quem torna a medicao por presenca inutil. */
const TETO_GERAL_DE_CHAMADAS = 10;

let app: RegistradorDeRotas;
let banco: { db: Db; close: () => Promise<void> };
let base: string;
const contas: UserId[] = [];

interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
  readonly retryAfter: string | null;
}

interface Sessao {
  readonly access_token: string;
}

async function chamar(
  caminho: string,
  opcoes: { metodo: 'POST' | 'PUT'; corpo?: unknown; token?: string },
): Promise<Resposta> {
  const cabecalhos: Record<string, string> = { accept: 'application/json' };
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  if (opcoes.token !== undefined) cabecalhos['authorization'] = `Bearer ${opcoes.token}`;

  const resposta = await fetch(`${base}${PREFIXO_DA_API}${caminho}`, {
    method: opcoes.metodo,
    headers: cabecalhos,
    ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
  });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    corpo: texto === '' ? undefined : JSON.parse(texto),
    retryAfter: resposta.headers.get('retry-after'),
  };
}

/** Uma conta por cenario: o teto conta por CONTA, e dois casos se cruzariam. */
async function contaNova(rotulo: string): Promise<{ email: string; sessao: Sessao }> {
  const email = `troca-${rotulo}-${randomUUID().slice(0, 8)}@${DOMINIO_DE_TESTE}`;
  const cadastro = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: { email, password: SENHA },
  });
  assert.equal(
    cadastro.status,
    201,
    `a conta ${email} nao foi criada (${String(cadastro.status)}): ${JSON.stringify(cadastro.corpo)}`,
  );
  const corpo = cadastro.corpo as { user: { id: string }; access_token: string };
  contas.push(corpo.user.id as UserId);
  return { email, sessao: { access_token: corpo.access_token } };
}

/** Uma tentativa de troca com a senha atual ERRADA. */
async function tentarComSenhaErrada(acesso: string): Promise<Resposta> {
  return chamar(TROCA_DE_SENHA, {
    metodo: 'PUT',
    token: acesso,
    corpo: { current_password: SENHA_ERRADA, new_password: SENHA_NOVA },
  });
}

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
  const caixaDeEntrada: Mensagem[] = [];

  let verificarReautenticacao: VerificadorDeReautenticacao = () => {
    throw new Error('verificador chamado antes de a fiacao terminar');
  };

  app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    // Contador EM MEMORIA, e nao desligado. Um contador desligado faria este
    // arquivo inteiro medir o nada, verde, para sempre.
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
    // SEC-021: o repositório REAL, e não um dublê. Estes casos têm banco de pé,
    // e um dublê aqui faria o apagamento do logout parecer exercitado sem nunca
    // tocar a tabela.
    apagarLocalizacaoDaSessao: (dono, familia) =>
      criarLocalizacaoDeReferenciaRepository(db).apagar(dono, familia),
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

void describe('o teto de invalidas de PUT /auth/password, pela posicao da recusa', () => {
  void it('a sexta senha atual errada na mesma hora responde 429; as cinco antes, 401', async () => {
    const { sessao } = await contaNova('posicao');

    // EM SERIE, de proposito. A contagem da invalida acontece em `onResponse`,
    // DEPOIS de a resposta sair: em paralelo a sexta poderia chegar ao teto
    // antes de a quinta ter sido contada, e a posicao medida seria outra.
    const respostas: Resposta[] = [];
    for (let i = 0; i < TETO_DE_INVALIDAS + 1; i += 1) {
      respostas.push(await tentarComSenhaErrada(sessao.access_token));
    }
    const status = respostas.map((r) => r.status);

    assert.deepEqual(
      status.slice(0, TETO_DE_INVALIDAS),
      Array.from({ length: TETO_DE_INVALIDAS }, () => 401),
      `as ${String(TETO_DE_INVALIDAS)} primeiras tentativas com a senha atual errada deviam ` +
        `ser 401 de credencial, e sairam ${JSON.stringify(status)}. Um 429 antes da quinta ` +
        'trancaria o titular que errou a propria senha quatro vezes, que e quem esta rota ' +
        'existe para atender.',
    );

    assert.equal(
      status[TETO_DE_INVALIDAS],
      429,
      `a ${String(TETO_DE_INVALIDAS + 1)}a tentativa com a senha atual errada respondeu ` +
        `${String(status[TETO_DE_INVALIDAS])}, e o conjunto foi ${JSON.stringify(status)}.\n\n` +
        'E A POSICAO QUE IMPORTA, E ESTE E O MOTIVO: `changePassword` declara DUAS entradas ' +
        `\`deny_429\` por \`account\`. Apagar a de invalidas nao faz o 429 sumir -- a geral de ` +
        `${String(TETO_GERAL_DE_CHAMADAS)} por hora continua recusando, so que na ` +
        `${String(TETO_GERAL_DE_CHAMADAS + 1)}a chamada. Se este caso saiu 401 aqui, quem ` +
        'tomou a sessao ganhou o dobro de palpites por hora e nada mais mudou: `PUT ' +
        '/auth/password` confere `current_password` no corpo, e sem este teto ela e oraculo ' +
        'de senha com a sessao na mao. O login NAO cobre isso, porque o login se defende por ' +
        'e-mail e por IP, e nao por conta.',
    );

    const ultima = respostas[TETO_DE_INVALIDAS];
    assert.ok(ultima !== undefined, 'a sexta resposta nao chegou');
    assert.equal(
      tipoDoProblema(ultima.corpo),
      'rate-limited',
      `a recusa saiu com \`type: ${tipoDoProblema(ultima.corpo)}\` em vez de \`rate-limited\`. ` +
        'Um 429 de outro `type` nao e este teto, e o app decide pelo `type` (RFC 9457).',
    );
    assert.ok(
      ultima.retryAfter !== null,
      'o 429 saiu sem `Retry-After`. RFC 9110: sem ele o app offline fica martelando a rota.',
    );
  });

  void it('a rota declara o teto que o contrato declara', () => {
    // O OUTRO LADO DA PINCA, e ele e independente do caso acima de proposito.
    // O caso de posicao prova que o mecanismo recusa onde deve; este prova que
    // o numero nao mudou. Se o esperado saisse da propria rota, trocar 5 por 50
    // passaria nos dois, porque os dois teriam passado a cobrar 50.
    // O tipo de `rateLimit` aqui e a tupla literal que `defineRoute` preserva,
    // e nela `appliesTo` so existe no segundo membro. Ler pelo tipo largo do
    // contrato (`RateLimitEntry`) e o que permite perguntar "quantas entradas
    // de invalidas existem?" -- inclusive a resposta ZERO, que e o caso que
    // este bloco precisa reprovar.
    const declaradas: readonly RateLimitEntry[] = rotaDeTrocaDeSenha.rateLimit ?? [];
    const invalidas = declaradas.filter((entrada) => entrada.appliesTo === 'invalid_attempts');
    assert.equal(
      invalidas.length,
      1,
      'PUT /auth/password deixou de declarar exatamente uma entrada ' +
        '`applies_to: invalid_attempts`. O contrato declara uma (`api/openapi.yaml`, ' +
        '`changePassword`), e e ela que impede o oraculo de senha.',
    );
    const entrada = invalidas[0];
    assert.ok(entrada !== undefined);
    assert.deepEqual(
      {
        dimension: [...entrada.dimension],
        limit: entrada.limit,
        window: entrada.window,
        onExceed: entrada.onExceed,
      },
      { dimension: ['account'], limit: TETO_DE_INVALIDAS, window: '1h', onExceed: 'deny_429' },
      'o teto de invalidas de PUT /auth/password divergiu do contrato ' +
        '(`api/openapi.yaml`, `changePassword`: dimension [account], limit 5, window 1h, ' +
        'on_exceed deny_429). Mudanca de teto e decisao de seguranca, nao de refatoracao.',
    );
  });

  void it('estourar o teto NAO fecha a recuperacao de senha', async () => {
    // Sem isto, o teto vira arma: quem tomou a sessao gasta as cinco de
    // proposito e tranca o titular para fora do proprio remedio. A recuperacao
    // se defende por e-mail e por IP, e nao pela conta -- entao ela precisa
    // continuar de pe, e esta e a unica saida que sobra para o titular.
    const { email, sessao } = await contaNova('remedio');
    for (let i = 0; i < TETO_DE_INVALIDAS + 1; i += 1) {
      await tentarComSenhaErrada(sessao.access_token);
    }

    const recuperacao = await chamar(PEDIDO_DE_REDEFINICAO, {
      metodo: 'POST',
      corpo: { email },
    });
    assert.equal(
      recuperacao.status,
      202,
      `a recuperacao de senha respondeu ${String(recuperacao.status)} depois de o teto de ` +
        `${String(TETO_DE_INVALIDAS)} invalidas de PUT /auth/password estourar: ` +
        `${JSON.stringify(recuperacao.corpo)}. O titular ficaria trancado para fora do ` +
        'proprio remedio, e quem tomou a conta dele teria conseguido isso de proposito.',
    );
  });
});
