/**
 * `POST /v1/auth/logout` chamado **exatamente como o contrato declara**
 * (BICHUS-81 critério 6, corrigido pela emenda 1 do ADR-0002).
 *
 * ## Por que este arquivo existe
 *
 * Havia três peças que não se encaixavam, e as três passavam em revisão:
 *
 * - `api/openapi.yaml` declarava `logout` **sem corpo de requisição**, e o tipo
 *   gerado trazia `requestBody?: never`;
 * - o manipulador em `routes.ts` lia `corpo.refresh_token`;
 * - `sair()` só revogava `if (refreshApresentado !== undefined)`.
 *
 * Quem seguisse o contrato ao pé da letra não mandava campo nenhum, nada era
 * revogado, e a resposta era `204` igual. A família continuava viva no banco
 * até vencer por inatividade, e um refresh já copiado renovava por até 180
 * dias. **O sucesso era indistinguível do nada.**
 *
 * ## Como este arquivo evita repetir o defeito que ele cobre
 *
 * O corpo da requisição **não é escrito à mão aqui**. Ele é montado a partir de
 * `contrato.requestBodySchema('logout')`, lido de `api/openapi.yaml` em tempo
 * de execução — quer dizer, o caso envia o que o contrato manda enviar, e nada
 * além. Isso não é preciosismo: um caso com `{ refresh_token: ... }` escrito à
 * mão passaria **hoje**, com o contrato ainda dizendo que não há corpo, porque
 * o manipulador lê o campo de qualquer jeito. Ele provaria o código contra ele
 * mesmo, e o desencontro entre documento e implementação — que é o defeito —
 * continuaria invisível.
 *
 * Prova de reprovação, rodada antes de esta linha ser escrita: com o
 * `requestBody` removido de `logout` em `api/openapi.yaml`,
 * `montarCorpoDoContrato` não encontra schema, a requisição sai sem corpo e o
 * caso "revoga a família do aparelho" reprova em
 * `repo.revogacoes.length` — 0 onde tem de ser 1.
 *
 * ## A segunda isca, que cobre o outro lado do mesmo critério
 *
 * `sair` deste aparelho **não pode tocar** `users.sessions_invalid_before`.
 * Essa coluna é de `users`, por pessoa e não por sessão: empurrá-la no logout
 * comum derrubaria o tablet e o celular de quem mora na mesma casa, e faria
 * `logout` virar `signOutAllDevices` com outro nome. O critério 6 da BICHUS-81,
 * do jeito que está escrito na issue, manda fazer exatamente isso — e é por
 * isso que a isca precisa existir em vez de a ausência ser assumida: um dublê
 * que só grita quando é chamado não reprova quem passa a chamar.
 *
 * ## O que este arquivo NÃO cobre
 *
 * - **O banco de verdade.** O que se afirma aqui é o efeito na porta
 *   `IdentityRepository`, com o dublê espelhando a semântica do SQL de
 *   `kysely-identity-repository.ts` (revogar só o que ainda não fora revogado;
 *   a busca por hash devolve a linha **inclusive revogada**, que é o que torna
 *   a repetição idempotente). Que o `UPDATE` de fato alcance as linhas é de
 *   `tests/integration/`.
 * - **O apagamento do cache no aparelho** (critérios 2 a 4 da BICHUS-81) e a
 *   baixa do token de push (BICHUS-91): são do app e de outro módulo.
 * - **A janela de até 15 minutos do token de acesso já emitido.** Ela é
 *   decisão declarada da emenda, não defeito, e nada aqui a fecha.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';

import type { AuditEvent, AuditLog } from '../../../audit/ports/audit-log.js';
import { carregarContrato, type Contrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { hashDeToken } from '../../../../shared/crypto/digest.js';
import type {
  AbsoluteUrl,
  Instant,
  OpaqueToken,
  TokenHash,
  UserId,
} from '../../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../../shared/time/relogio-de-teste.js';
import type {
  Conta,
  IdentityRepository,
  MotivoDeRevogacao,
  RefreshArmazenado,
} from '../../ports/identity-repository.js';
import type { Mailer } from '../../ports/mailer.js';
import type { TokenSigner } from '../../ports/token-signer.js';
import { criarAuthService } from '../../application/auth-service.js';
import { registrarRotasDeIdentidade, type DependenciasDasRotas } from './routes.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';

const TUTORA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const OUTRA_PESSOA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f02' as UserId;
const FAMILIA_DESTE_APARELHO = 'fam-do-celular-da-tutora';
const FAMILIA_ALHEIA = 'fam-de-outra-conta';
const AGORA = INSTANTE_FIXO;

/**
 * O refresh que o aparelho apresenta. Precisa de 20 caracteres ou mais: é o
 * piso que o contrato declara, e um valor menor seria recusado pela validação
 * antes de chegar ao serviço — o caso passaria a provar o `minLength` em vez da
 * revogação.
 */
const REFRESH_DESTE_APARELHO = 'refresh-do-celular-da-tutora-0001';
const REFRESH_DE_OUTRA_CONTA = 'refresh-de-outra-conta-0002-abcd';

/** Montada como `loadAppConfig()` monta: base pública mais `/problems`. */
const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;

function hashDe(token: string): TokenHash {
  return hashDeToken(token).toString('base64') as TokenHash;
}

function naoUsado(nome: string): never {
  throw new Error(`o dublê não implementa ${nome}: nenhum caso deste arquivo deveria chegar aqui`);
}

function contaAtiva(): Conta {
  return {
    id: TUTORA,
    email: 'tutora@exemplo.test',
    emailVerifiedAt: dataFixa(1),
    displayName: 'Tutora',
    phoneE164: null,
    phoneVerifiedAt: null,
    referencePostalCode: null,
    referenceNeighborhood: null,
    referenceCity: null,
    referenceState: null,
    pendingEmail: null,
    emailDeliverable: true,
    status: 'active',
    sessionsInvalidBefore: 0 as Instant,
    createdAt: dataFixa(1),
  };
}

/**
 * Dublê do repositório com a semântica do SQL, e não com a conveniência do
 * teste.
 *
 * Dois pontos copiados de `kysely-identity-repository.ts` de propósito, porque
 * são eles que decidem o desfecho dos casos abaixo:
 *
 * 1. `buscarRefreshPorHash` **não filtra por `revoked_at`** — a linha volta
 *    mesmo revogada. É isso que faz o segundo logout com o mesmo token ser
 *    idempotente em vez de virar 400.
 * 2. `revogarFamilia` só alcança o que ainda está com `revoked_at` nulo, e
 *    devolve **quantas linhas mudaram**. A segunda chamada devolve zero, e zero
 *    não é erro.
 */
class RepositorioFalso implements IdentityRepository {
  public readonly revogacoes: { familyId: string; motivo: MotivoDeRevogacao; agora: Instant }[] = [];
  /**
   * A isca do "sair de todos os aparelhos disfarçado". Fica como lista, e não
   * como `naoUsado`, porque o que precisa reprovar é a chamada EXISTIR.
   */
  public readonly invalidacoesDeSessao: { userId: UserId; agora: Instant }[] = [];
  /**
   * A outra metade da mesma isca, e ela so passou a existir com a BICHUS-125:
   * `sairDeTodosOsAparelhos` revoga as familias EM MASSA alem de empurrar
   * `sessions_invalid_before`. Sair deste aparelho nao pode chamar nenhuma das
   * duas, e uma isca que so olhasse a coluna deixaria passar a outra.
   */
  public readonly revogacoesEmMassa: { userId: UserId; motivo: MotivoDeRevogacao; agora: Instant }[] =
    [];

  private readonly linhas = new Map<TokenHash, RefreshArmazenado & { revokedAt: Date | null }>();

  constructor(private readonly conta: Conta | undefined) {
    this.linhas.set(hashDe(REFRESH_DESTE_APARELHO), {
      id: 'refresh-1',
      userId: TUTORA,
      familyId: FAMILIA_DESTE_APARELHO,
      issuedAt: AGORA,
      expiresAt: (AGORA + 30 * 86_400_000) as Instant,
      absoluteExpiresAt: (AGORA + 180 * 86_400_000) as Instant,
      staySignedIn: false,
      rotatedToId: null,
      revokedAt: null,
    });
    this.linhas.set(hashDe(REFRESH_DE_OUTRA_CONTA), {
      id: 'refresh-2',
      userId: OUTRA_PESSOA,
      familyId: FAMILIA_ALHEIA,
      issuedAt: AGORA,
      expiresAt: (AGORA + 30 * 86_400_000) as Instant,
      absoluteExpiresAt: (AGORA + 180 * 86_400_000) as Instant,
      staySignedIn: false,
      rotatedToId: null,
      revokedAt: null,
    });
  }

  buscarRefreshPorHash(hash: TokenHash): Promise<RefreshArmazenado | undefined> {
    return Promise.resolve(this.linhas.get(hash));
  }

  revogarFamilia(familyId: string, motivo: MotivoDeRevogacao, agora: Instant): Promise<number> {
    let alcancadas = 0;
    for (const linha of this.linhas.values()) {
      if (linha.familyId !== familyId || linha.revokedAt !== null) continue;
      linha.revokedAt = new Date(agora);
      alcancadas += 1;
    }
    this.revogacoes.push({ familyId, motivo, agora });
    return Promise.resolve(alcancadas);
  }

  invalidarSessoes(userId: UserId, agora: Instant): Promise<void> {
    this.invalidacoesDeSessao.push({ userId, agora });
    return Promise.resolve();
  }

  revogarTodasAsFamilias(
    userId: UserId,
    motivo: MotivoDeRevogacao,
    agora: Instant,
  ): Promise<number> {
    this.revogacoesEmMassa.push({ userId, motivo, agora });
    return Promise.resolve(0);
  }

  buscarContaPorId(): Promise<Conta | undefined> {
    return Promise.resolve(this.conta);
  }

  criarContaLocal(): Promise<Conta | undefined> {
    return naoUsado('criarContaLocal');
  }
  atualizarPerfil(): Promise<Conta | undefined> {
    return naoUsado('atualizarPerfil');
  }
  buscarContaPorEmail(): Promise<Conta | undefined> {
    return naoUsado('buscarContaPorEmail');
  }
  buscarCredencialLocalPorEmail(): Promise<undefined> {
    return naoUsado('buscarCredencialLocalPorEmail');
  }
  regravarCredencial(): Promise<void> {
    return naoUsado('regravarCredencial');
  }
  registrarLogin(): Promise<void> {
    return naoUsado('registrarLogin');
  }
  gravarRefresh(): Promise<void> {
    return naoUsado('gravarRefresh');
  }
  rotacionar(): Promise<boolean> {
    return naoUsado('rotacionar');
  }
  criarTokenDeVerificacao(): Promise<void> {
    return naoUsado('criarTokenDeVerificacao');
  }
  consumirTokenDeVerificacao(): Promise<undefined> {
    return naoUsado('consumirTokenDeVerificacao');
  }
  conferirTokenDeVerificacao(): Promise<undefined> {
    return naoUsado('conferirTokenDeVerificacao');
  }
  invalidarTokensPendentes(): Promise<number> {
    return naoUsado('invalidarTokensPendentes');
  }
  criarJanelaDeReautenticacao(): Promise<void> {
    return naoUsado('criarJanelaDeReautenticacao');
  }

  consumirJanelaDeReautenticacao(): never {
    throw new Error('consumirJanelaDeReautenticacao: nenhum caso deste arquivo chega aqui');
  }

  marcarEmailVerificado(): Promise<void> {
    return naoUsado('marcarEmailVerificado');
  }

  registrarPedidoDeExclusao(): Promise<undefined> {
    return naoUsado('registrarPedidoDeExclusao');
  }

  contasAExpurgar(): Promise<readonly UserId[]> {
    return naoUsado('contasAExpurgar');
  }

  expurgarConta(): Promise<boolean> {
    return naoUsado('expurgarConta');
  }

  registrarPedidoDeTrocaDeEmail(): Promise<void> {
    return naoUsado('registrarPedidoDeTrocaDeEmail');
  }

  concluirTrocaDeEmail(): Promise<Conta | undefined> {
    return naoUsado('concluirTrocaDeEmail');
  }

  cancelarTrocaDeEmailPendente(): Promise<void> {
    return naoUsado('cancelarTrocaDeEmailPendente');
  }
}

const TOKEN_DE_ACESSO = 'acesso-da-tutora';

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly repo: RepositorioFalso;
  readonly contrato: Contrato;
  readonly eventos: AuditEvent[];
}

/**
 * Sobe o servidor de verdade com o contrato de verdade e o serviço de verdade.
 * Só as portas de fora do processo são dublês.
 *
 * O contrato é `api/openapi.yaml`, e não um documento montado aqui: é
 * justamente o desencontro entre ele e o código que este arquivo existe para
 * acusar. Um contrato de mentira provaria o teste contra o teste.
 */
function montar(): Bancada {
  const repo = new RepositorioFalso(contaAtiva());
  const eventos: AuditEvent[] = [];
  const contrato = carregarContrato('api/openapi.yaml');

  const trilha: AuditLog = {
    record(evento) {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const mailer: Mailer = {
    enviar() {
      return naoUsado('mailer.enviar');
    },
  };
  const assinador: TokenSigner = {
    emitir: (_sub, agora, jti) => ({
      token: TOKEN_DE_ACESSO,
      expiresInSeconds: 900,
      issuedAt: Math.floor(agora / 1000),
      jti,
    }),
    verificar: (token) =>
      token === TOKEN_DE_ACESSO
        ? {
            ok: true,
            claims: {
              sub: TUTORA,
              iss: 'https://api.bichu.test',
              aud: 'https://api.bichu.test',
              iat: Math.floor(AGORA / 1000),
              exp: Math.floor(AGORA / 1000) + 900,
              jti: 'jti-1',
            },
          }
        : { ok: false, motivo: 'malformado' },
    jwks: () => [],
  };

  const auth = criarAuthService({
    repositorio: repo,
    assinador,
    trilha,
    ids: {
      uuidv7: () => 'id-novo',
      opaqueToken: () => 'refresh-novo' as OpaqueToken,
      random128: () => new Uint8Array(16),
      // BICHUS-154: a porta passou a ter `random80` (codigo da tag). Identidade
      // nao emite tag nenhuma; o valor so precisa existir e ser estavel.
      random80: () => new Uint8Array(10),
    },
    clock: relogioParado(AGORA),
    janelas: {
      idleTtlSeconds: 30 * 86_400,
      staySignedInIdleTtlSeconds: 180 * 86_400,
      absoluteTtlSeconds: 180 * 86_400,
    },
    hmacDeIp: () => null,
    avisarTitular: () => Promise.resolve(),
    mailer,
    registrarOcorrencia: () => {
      // Nenhum caso deste arquivo afirma log.
    },
    baseDaWeb: 'https://exemplo.invalid' as AbsoluteUrl,
  });

  const app = criarServidor({
    problemBaseUrl: PROBLEM_BASE_URL,
    isProduction: false,
    // Exigido desde a BICHUS-178: `registrarRota` recusa um servidor sem
    // contador, na subida. Contador EM MEMORIA e nao desligado, para que estes
    // casos exercitem a mesma fiacao que roda.
    teto: tetoDeTeste(),
    // BICHUS-48: `registrarRota` recusa, na subida, um servidor sem verificador
    // quando alguma rota declara `reauthScope` -- e `logout-all` declara. Este
    // arquivo nao exercita a janela de reautenticacao, entao o verificador
    // LANCA em vez de aprovar: um verificador que dissesse "ok" faria estes
    // casos rodarem contra uma porta destrutiva aberta e ninguem veria.
    reautenticacao: () => {
      throw new Error(
        'Verificador de reautenticacao chamado: nenhum caso deste arquivo exercita ' +
          'X-Reauth-Token. Quem precisa dele e sair-de-todos-pelo-http (integracao).',
      );
    },
  });
  const deps: DependenciasDasRotas = {
    auth,
    assinador,
    contrato,
    issuer: 'https://api.bichu.test',
    apiBaseUrl: 'https://api.bichu.test',
  };
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, deps);
      pronto();
    },
    { prefix: '/v1' },
  );

  return { app, repo, contrato, eventos };
}

/**
 * O corpo **que o contrato manda enviar**, montado a partir do schema da
 * própria especificação.
 *
 * Devolve `undefined` quando a operação não declara corpo — que é o estado em
 * que `logout` estava, e é o que faz as iscas reprovarem se alguém desfizer a
 * correção do contrato. Propriedade obrigatória sem valor conhecido é **falha
 * ruidosa**, e não um campo omitido em silêncio: campo novo no contrato precisa
 * aparecer aqui como erro, não como caso que continua verde cobrindo menos.
 */
function montarCorpoDoContrato(
  contrato: Contrato,
  operationId: string,
  valores: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) return undefined;

  const obrigatorios = Array.isArray(schema['required'])
    ? schema['required'].filter((nome): nome is string => typeof nome === 'string')
    : [];

  const corpo: Record<string, unknown> = {};
  for (const nome of obrigatorios) {
    if (!(nome in valores)) {
      throw new Error(
        `O contrato exige \`${nome}\` em \`${operationId}\` e esta bancada não sabe ` +
          `que valor enviar. Acrescente o valor em vez de omitir o campo: omitir ` +
          `deixaria o caso verde cobrindo menos do que ele diz cobrir.`,
      );
    }
    corpo[nome] = valores[nome];
  }
  return corpo;
}

async function pedirLogout(
  bancada: Bancada,
  valores: Readonly<Record<string, unknown>>,
  opcoes: { readonly autenticado?: boolean } = {},
): Promise<{ readonly status: number; readonly corpo: unknown }> {
  const corpo = montarCorpoDoContrato(bancada.contrato, 'logout', valores);
  const resposta = await bancada.app.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    headers: {
      ...(opcoes.autenticado === false ? {} : { authorization: `Bearer ${TOKEN_DE_ACESSO}` }),
      ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(corpo === undefined ? {} : { payload: corpo }),
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? undefined : (JSON.parse(resposta.body) as unknown),
  };
}

void describe('POST /v1/auth/logout chamado como o contrato declara (BICHUS-81 critério 6)', () => {
  void it('revoga a família de refresh daquele aparelho, e responde 204', async () => {
    const bancada = montar();

    const resposta = await pedirLogout(bancada, { refresh_token: REFRESH_DESTE_APARELHO });

    assert.equal(resposta.status, 204, 'o logout conforme o contrato precisa concluir');
    // ISCA: era aqui que o defeito morava. Com o contrato sem `requestBody`, o
    // cliente que o seguisse não mandava campo nenhum, esta lista ficava vazia,
    // e a resposta era 204 do mesmo jeito.
    assert.deepEqual(
      bancada.repo.revogacoes.map((r) => ({ familyId: r.familyId, motivo: r.motivo })),
      [{ familyId: FAMILIA_DESTE_APARELHO, motivo: 'logout' }],
      'sair deste aparelho revoga a família apresentada, no servidor',
    );
  });

  void it('NÃO empurra sessions_invalid_before: sair daqui não desloga a pessoa em casa', async () => {
    const bancada = montar();

    await pedirLogout(bancada, { refresh_token: REFRESH_DESTE_APARELHO });

    // ISCA: o critério 6 da BICHUS-81, ao pé da letra, manda atualizar
    // `sessions_invalid_before`. Essa coluna é de `users`, por PESSOA: fazer
    // isso aqui derrubaria o tablet e o celular de quem mora junto, e tornaria
    // `logout` idêntico a `signOutAllDevices`. A emenda 1 do ADR-0002 decidiu
    // contra, e é esta linha que segura a decisão.
    assert.deepEqual(
      bancada.repo.invalidacoesDeSessao,
      [],
      'sair deste aparelho não pode alcançar as outras sessões da mesma conta',
    );
    assert.deepEqual(
      bancada.repo.revogacoesEmMassa,
      [],
      'sair deste aparelho não pode revogar as famílias das outras sessões (BICHUS-125)',
    );
  });

  void it('recusa com 400 quando o refresh não vem, em vez de fingir 204', async () => {
    const bancada = montar();

    const resposta = await bancada.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}`, 'content-type': 'application/json' },
      payload: {},
    });

    assert.equal(resposta.statusCode, 400, 'logout que não revogou precisa ser erro visível');
    const corpo = JSON.parse(resposta.body) as { type: string; status: number };
    assert.equal(corpo.type, `${PROBLEM_BASE_URL}/validation-failed`);
    assert.equal(corpo.status, 400);
    assert.deepEqual(bancada.repo.revogacoes, [], 'nada foi revogado, e a resposta diz isso');
  });

  void it('recusa o refresh de outra conta sem revogar a família alheia', async () => {
    const bancada = montar();

    const resposta = await pedirLogout(bancada, { refresh_token: REFRESH_DE_OUTRA_CONTA });

    assert.equal(resposta.status, 400);
    assert.deepEqual(
      bancada.repo.revogacoes,
      [],
      'apresentar o token de outra pessoa não pode derrubar a sessão dela',
    );
  });

  void it('responde igual para refresh inexistente e para refresh alheio', async () => {
    const deOutraConta = await pedirLogout(montar(), { refresh_token: REFRESH_DE_OUTRA_CONTA });
    const inexistente = await pedirLogout(montar(), {
      refresh_token: 'refresh-que-nunca-existiu-0003',
    });

    assert.equal(inexistente.status, deOutraConta.status);
    // `correlation_id` e `instance` mudam a cada requisição, de propósito. O
    // resto precisa ser idêntico: distinguir os dois contaria a quem pergunta
    // se aquele token existe em algum lugar.
    const semRuido = (corpo: unknown): unknown => {
      const resto = { ...(corpo as Record<string, unknown>) };
      delete resto['correlation_id'];
      delete resto['instance'];
      return resto;
    };
    assert.deepEqual(semRuido(inexistente.corpo), semRuido(deOutraConta.corpo));
  });

  void it('é idempotente: repetir com a família já revogada responde 204 e não erra', async () => {
    const bancada = montar();

    const primeira = await pedirLogout(bancada, { refresh_token: REFRESH_DESTE_APARELHO });
    const segunda = await pedirLogout(bancada, { refresh_token: REFRESH_DESTE_APARELHO });

    assert.equal(primeira.status, 204);
    assert.equal(
      segunda.status,
      204,
      'o app que só consegue enviar a revogação atrasada não pode ser punido por isso',
    );
  });

  void it('grava a trilha com a família revogada, e não um auth.logout sem alvo', async () => {
    const bancada = montar();

    await pedirLogout(bancada, { refresh_token: REFRESH_DESTE_APARELHO });

    const logout = bancada.eventos.filter((evento) => evento.action === 'auth.logout');
    assert.equal(logout.length, 1);
    // Sem `resourceId` a trilha registrava que alguém saiu e não dizia de onde,
    // que é o mesmo silêncio do 204 vazio, por outro transporte.
    assert.equal(logout[0]?.resourceId, FAMILIA_DESTE_APARELHO);
  });

  void it('continua exigindo autenticação: sem Bearer é 401, não 400', async () => {
    const bancada = montar();

    const resposta = await pedirLogout(
      bancada,
      { refresh_token: REFRESH_DESTE_APARELHO },
      { autenticado: false },
    );

    assert.equal(resposta.status, 401);
    assert.deepEqual(bancada.repo.revogacoes, []);
  });
});
