/**
 * O teto de `GET /public/password-reset/{token}`: ele ALERTA, e nao recusa.
 *
 * ===========================================================================
 * POR QUE UMA ISCA QUE AFIRMA A AUSENCIA DE RECUSA
 * ===========================================================================
 * Afirmar "esta rota nao responde 429" parece o contrario do trabalho. Nao e:
 * `on_exceed: log_and_alert` e uma decisao de politica com argumento escrito
 * (`routes.ts`, `rotaDeConferenciaDeRedefinicao`, e o contrato em
 * `api/openapi.yaml`), e e a decisao mais facil do mundo de desfazer por
 * engano. Trocar `log_and_alert` por `deny_429` e tipo valido, compila,
 * atravessa revisao com a aparencia de estar "endurecendo a seguranca", e o
 * unico efeito real e trancar uma pessoa para fora da propria recuperacao de
 * senha. Ate 22/09/2026 o codigo estava exatamente assim, e nada acusava.
 *
 * O ARGUMENTO, em uma linha cada (a versao longa mora no `routes.ts`):
 *
 *   - o token tem 256 bits de CSPRNG e vale 30 minutos, entao o teto nao e a
 *     defesa contra enumeracao -- a chance de acerto fica na ordem de 10^-64;
 *   - `POST /auth/password-reset/confirm` responde 410 para token invalido do
 *     mesmo jeito e ja carrega `deny_429` nas invalidas, entao recusar aqui
 *     nao fecha o oraculo: troca o verbo de quem varre;
 *   - a dimensao e `ip`, e o CGNAT agrupa muita gente atras de poucos
 *     enderecos. Esta chamada acontece ao ABRIR o link do e-mail: recarregar a
 *     pagina, abrir no outro aparelho e o varredor de link do cliente de
 *     e-mail somam chamadas que a pessoa nao fez. Um 429 aqui deixa a pagina
 *     sem mostrar o formulario, e quem esta redefinindo a senha e justamente
 *     quem nao consegue entrar na conta por outro caminho.
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO MEDE
 * ===========================================================================
 * `TETO_DECLARADO + 1` chamadas seguidas com token invalido, do mesmo IP. O
 * teto conta TODAS elas (`log_and_alert` nao muda a contagem, muda o que
 * acontece no estouro), entao a ultima esta comprovadamente ALEM do teto.
 * Nenhuma pode responder 429.
 *
 * O numero de chamadas e deliberadamente maior que o teto ANTERIOR do codigo
 * (60): com 61 chamadas, a versao de 22/09 responderia `[410 x60, 429]` e este
 * arquivo reprovaria. Medir so 31 passaria nos dois mundos e vigiaria nada.
 *
 * Contrato: `api/openapi.yaml`, `checkPasswordResetToken` (dimension [ip],
 * limit 30, window 1h, on_exceed log_and_alert). Mecanismo: ADR-0016.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hmacDeEnderecoIp } from '../../src/shared/crypto/digest.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import type { RateLimitEntry } from '../../src/shared/http/route-definition.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
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
  rotaDeConferenciaDeRedefinicao,
  type DependenciasDasRotas,
} from '../../src/modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../../src/modules/identity/application/aviso-de-reuso.js';
import type { Mailer } from '../../src/modules/identity/ports/mailer.js';
import { criarLocalizacaoDeReferenciaRepository } from '../../src/modules/identity/adapters/persistence/kysely-localizacao-de-referencia.js';

const PREFIXO_DA_API = '/v1';

/**
 * O teto declarado, literal e com fonte: `api/openapi.yaml`,
 * `checkPasswordResetToken`. NAO sai de `rotaDeConferenciaDeRedefinicao`.
 */
const TETO_DECLARADO = 30;

/**
 * O teto que o CODIGO carregava ate 22/09/2026, com `deny_429`.
 *
 * Ele esta aqui como numero, e nao como comentario, porque e ele que
 * dimensiona a medicao: as chamadas precisam passar DELE para que a isca
 * reprove na versao antiga. Sem isso o arquivo ficaria verde nos dois mundos.
 */
const TETO_ANTIGO_DO_CODIGO = 60;

const CHAMADAS = TETO_ANTIGO_DO_CODIGO + 1;

let app: RegistradorDeRotas;
let banco: { db: Db; close: () => Promise<void> };
let base: string;

/** O token vai na URL, entao precisa ser seguro em componente de caminho. */
function tokenQueNaoExiste(): string {
  return randomBytes(32).toString('base64url');
}

async function conferir(token: string): Promise<{ status: number; corpo: unknown }> {
  const caminho = rotaDeConferenciaDeRedefinicao.path.replace(
    ':token',
    encodeURIComponent(token),
  );
  const resposta = await fetch(`${base}${PREFIXO_DA_API}${caminho}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
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
  const assinador = criarTokenSigner(config.token);

  let verificarReautenticacao: VerificadorDeReautenticacao = () => {
    throw new Error('verificador chamado antes de a fiacao terminar');
  };

  app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    // Contador EM MEMORIA, e nao desligado. Aqui isso importa MAIS que de
    // costume: este arquivo espera ausencia de 429, e um contador desligado
    // produziria a ausencia esperada sem que teto nenhum tivesse sido
    // consultado. A isca ficaria verde medindo o nada.
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
  // Nenhum caso deste arquivo manda e-mail: a conferencia do link nao envia
  // nada. O correio existe so porque o servico o exige na fiacao.
  const mailer: Mailer = { enviar: () => Promise.resolve() };

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
  if (banco !== undefined) await banco.close();
});

void describe('GET /public/password-reset/{token}: o teto alerta, e nao recusa', () => {
  void it(`${String(CHAMADAS)} chamadas seguidas do mesmo IP: nenhuma 429`, async () => {
    const status: number[] = [];
    for (let i = 0; i < CHAMADAS; i += 1) {
      status.push((await conferir(tokenQueNaoExiste())).status);
    }

    const posicao = status.indexOf(429);
    assert.equal(
      posicao,
      -1,
      `a ${String(posicao + 1)}a chamada a GET /public/password-reset/{token} respondeu 429.\n\n` +
        'ESTA ROTA NAO PODE RECUSAR, E A DECISAO TEM ARGUMENTO ESCRITO em `routes.ts` ' +
        '(`rotaDeConferenciaDeRedefinicao`) e no contrato (`api/openapi.yaml`, ' +
        '`checkPasswordResetToken`: on_exceed log_and_alert). O token tem 256 bits e vale 30 ' +
        'minutos, entao o teto nunca foi a defesa contra enumeracao; `POST ' +
        '/auth/password-reset/confirm` e o mesmo oraculo e ja recusa nas invalidas, entao ' +
        'recusar aqui nao fecha caminho nenhum. O que recusar aqui FAZ e deixar a pagina de ' +
        'redefinicao sem mostrar o formulario para quem abriu o proprio link -- a dimensao e ' +
        '`ip`, o CGNAT agrupa muita gente atras de poucos enderecos, e recarregar a pagina ou ' +
        'abrir no outro aparelho ja soma chamadas que a pessoa nao fez conscientemente. Quem ' +
        'redefine a senha e justamente quem nao consegue entrar na conta por outro caminho.\n\n' +
        'Se a decisao mudou, mude o CONTRATO primeiro e traga o argumento; trocar so o codigo ' +
        'foi o defeito que esta isca nasceu para impedir.',
    );
    assert.deepEqual(
      status,
      Array.from({ length: CHAMADAS }, () => 410),
      `alguma das ${String(CHAMADAS)} chamadas com token invalido nao respondeu 410: ` +
        `${JSON.stringify(status)}. Sem todas valerem, a ausencia de 429 acima nao prova nada ` +
        '-- uma rota que respondesse 404 por caminho errado tambem nunca daria 429.',
    );
  });

  void it('a rota declara o teto que o contrato declara', () => {
    const declaradas: readonly RateLimitEntry[] = rotaDeConferenciaDeRedefinicao.rateLimit ?? [];
    assert.equal(
      declaradas.length,
      1,
      'GET /public/password-reset/{token} deixou de declarar exatamente uma entrada de teto.',
    );
    const entrada = declaradas[0];
    assert.ok(entrada !== undefined);
    assert.deepEqual(
      {
        dimension: [...entrada.dimension],
        limit: entrada.limit,
        window: entrada.window,
        onExceed: entrada.onExceed,
      },
      { dimension: ['ip'], limit: TETO_DECLARADO, window: '1h', onExceed: 'log_and_alert' },
      'o teto de GET /public/password-reset/{token} divergiu do contrato ' +
        '(`api/openapi.yaml`, `checkPasswordResetToken`: dimension [ip], limit 30, window 1h, ' +
        'on_exceed log_and_alert). O numero 30 esta em pergunta aberta na pauta de ' +
        'refinamento de 22/09 ("30 por hora por IP, ou 60?"); enquanto ela nao for respondida, ' +
        'vale o contrato.',
    );
  });
});
