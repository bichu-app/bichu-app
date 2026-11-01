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
import type { Conta, FotoDoPerfil, MotivoDeRevogacao, RefreshArmazenado } from '../../ports/identity-repository.js';
import type { Mailer } from '../../ports/mailer.js';
import type { TokenSigner } from '../../ports/token-signer.js';
import { criarAuthService } from '../../application/auth-service.js';
import { registrarRotasDeIdentidade, type DependenciasDasRotas } from './routes.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { RepositorioQueRecusaTudo } from '../persistence/repositorio-que-recusa-tudo-de-teste.js';

const TUTORA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const OUTRA_PESSOA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f02' as UserId;
const FAMILIA_DESTE_APARELHO = 'fam-do-celular-da-tutora';
const FAMILIA_DO_TABLET = 'fam-do-tablet-da-tutora';
const FAMILIA_ALHEIA = 'fam-de-outra-conta';
const AGORA = INSTANTE_FIXO;

const REFRESH_DESTE_APARELHO = 'refresh-do-celular-da-tutora-0001';
const REFRESH_DE_OUTRA_CONTA = 'refresh-de-outra-conta-0002-abcd';

const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;

function hashDe(token: string): TokenHash {
  return hashDeToken(token) as TokenHash;
}

function chaveDe(hash: TokenHash): string {
  return hash.toString('hex');
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
    handle: null,
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

class RepositorioFalso extends RepositorioQueRecusaTudo {
  override fotoDoPerfil(): Promise<FotoDoPerfil | null> {
    return Promise.resolve(null);
  }

  protected recusar(nome: string): never {
    return naoUsado(nome);
  }

  public readonly revogacoes: { familyId: string; motivo: MotivoDeRevogacao; agora: Instant }[] = [];
  public readonly invalidacoesDeSessao: { userId: UserId; agora: Instant }[] = [];
  public readonly revogacoesEmMassa: { userId: UserId; motivo: MotivoDeRevogacao; agora: Instant }[] =
    [];

  private readonly linhas = new Map<string, RefreshArmazenado & { revokedAt: Date | null }>();

  constructor(private readonly conta: Conta | undefined) {
    super();

    this.linhas.set(chaveDe(hashDe(REFRESH_DESTE_APARELHO)), {
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
    this.linhas.set(chaveDe(hashDe(REFRESH_DE_OUTRA_CONTA)), {
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

  override buscarRefreshPorHash(hash: TokenHash): Promise<RefreshArmazenado | undefined> {
    return Promise.resolve(this.linhas.get(chaveDe(hash)));
  }

  override revogarFamilia(familyId: string, motivo: MotivoDeRevogacao, agora: Instant): Promise<number> {
    let alcancadas = 0;
    for (const linha of this.linhas.values()) {
      if (linha.familyId !== familyId || linha.revokedAt !== null) continue;
      linha.revokedAt = new Date(agora);
      alcancadas += 1;
    }
    this.revogacoes.push({ familyId, motivo, agora });
    return Promise.resolve(alcancadas);
  }

  override invalidarSessoes(userId: UserId, agora: Instant): Promise<void> {
    this.invalidacoesDeSessao.push({ userId, agora });
    return Promise.resolve();
  }

  override revogarTodasAsFamilias(
    userId: UserId,
    motivo: MotivoDeRevogacao,
    agora: Instant,
  ): Promise<number> {
    this.revogacoesEmMassa.push({ userId, motivo, agora });
    return Promise.resolve(0);
  }

  override buscarContaPorId(): Promise<Conta | undefined> {
    return Promise.resolve(this.conta);
  }

  expurgarConta(): Promise<boolean> {
    return naoUsado('expurgarConta');
  }
}

const TOKEN_DE_ACESSO = 'acesso-da-tutora';

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly repo: RepositorioFalso;
  readonly contrato: Contrato;
  readonly eventos: AuditEvent[];
  readonly localizacoes: Map<string, string>;
}

function chaveDaLocalizacao(dono: string, familia: string): string {
  return `${dono}\u0000${familia}`;
}

function montar(): Bancada {
  const repo = new RepositorioFalso(contaAtiva());
  const eventos: AuditEvent[] = [];
  const localizacoes = new Map<string, string>([
    [chaveDaLocalizacao(TUTORA, FAMILIA_DESTE_APARELHO), 'Paulista'],
    [chaveDaLocalizacao(TUTORA, FAMILIA_DO_TABLET), 'Pinheiros'],
  ]);
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
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
    removerPushDaConta: () => Promise.resolve(0),
    apagarLocalizacaoDaSessao: (dono, familia) =>
      Promise.resolve(localizacoes.delete(chaveDaLocalizacao(dono, familia)) ? 1 : 0),
    repositorio: repo,
    assinador,
    trilha,
    ids: {
      uuidv7: () => 'id-novo',
      opaqueToken: () => 'refresh-novo' as OpaqueToken,
      random128: () => new Uint8Array(16),
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
    teto: tetoDeTeste(),
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
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
  };
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, deps);
      pronto();
    },
    { prefix: '/v1' },
  );

  return { app, repo, contrato, eventos, localizacoes };
}

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
    assert.deepEqual(
      bancada.repo.revogacoes.map((r) => ({ familyId: r.familyId, motivo: r.motivo })),
      [{ familyId: FAMILIA_DESTE_APARELHO, motivo: 'logout' }],
      'sair deste aparelho revoga a família apresentada, no servidor',
    );
  });

  void it('SEC-021: a localização de referência NÃO sobrevive ao logout', async () => {
    const bancada = montar();
    assert.ok(
      bancada.localizacoes.has(chaveDaLocalizacao(TUTORA, FAMILIA_DESTE_APARELHO)),
      'a bancada precisa começar COM a localização, senão o caso não mede nada',
    );

    const resposta = await pedirLogout(bancada, { refresh_token: REFRESH_DESTE_APARELHO });

    assert.equal(resposta.status, 204);
    assert.ok(
      !bancada.localizacoes.has(chaveDaLocalizacao(TUTORA, FAMILIA_DESTE_APARELHO)),
      'a localização de referência SOBREVIVEU ao logout deste aparelho. O ADR-0010 ' +
        'promete, na tabela de retenção, que ela é "apagada ao sair da conta e ao ' +
        'excluir a conta"; o gatilho de 20260922000006 cumpre só a segunda metade, ' +
        'porque a exclusão lógica é um UPDATE em `users` e o logout não toca `users`. ' +
        'Quem sai da conta no celular emprestado continua, neste estado, dentro do raio ' +
        'de alerta com a região onde mora.',
    );
  });

  void it('SEC-021: dois aparelhos, uma pessoa — sair de um deixa a do outro de pé', async () => {
    const bancada = montar();

    await pedirLogout(bancada, { refresh_token: REFRESH_DESTE_APARELHO });

    assert.equal(
      bancada.localizacoes.get(chaveDaLocalizacao(TUTORA, FAMILIA_DO_TABLET)),
      'Pinheiros',
      'o tablet perdeu a localização dele porque o CELULAR saiu da conta. Sair é por ' +
        'aparelho (ADR-0002, emenda 1): "quem sai no celular da recepção do pet shop ' +
        'não está pedindo para cair da própria casa", e a localização passou a seguir ' +
        'a mesma regra.',
    );
    assert.equal(
      bancada.localizacoes.size,
      1,
      'sobrou mais de uma linha, ou nenhuma: o logout de um aparelho apaga exatamente uma',
    );
  });

  void it('SEC-021: a trilha conta as localizações que saíram, junto da família', async () => {
    const bancada = montar();

    await pedirLogout(bancada, { refresh_token: REFRESH_DESTE_APARELHO });

    const logout = bancada.eventos.find((e) => e.action === 'auth.logout');
    assert.ok(logout !== undefined, 'o logout precisa deixar evento');
    assert.equal(
      (logout.metadata as { locations_removed?: number } | undefined)?.locations_removed,
      1,
      '`locations_removed` ausente ou errado. Sem ele, "o apagamento rodou?" volta a ' +
        'não ter resposta em lugar nenhum: 0 e 1 são estados diferentes e precisam ser ' +
        'distinguíveis depois do fato.',
    );
    assert.deepEqual(
      Object.keys(logout.metadata ?? {}).sort(),
      ['locations_removed'],
      'apareceu campo novo no metadado do logout. Confira que ele não é coordenada nem ' +
        'identificador de aparelho antes de acrescentá-lo a esta lista.',
    );
  });

  void it('NÃO empurra sessions_invalid_before: sair daqui não desloga a pessoa em casa', async () => {
    const bancada = montar();

    await pedirLogout(bancada, { refresh_token: REFRESH_DESTE_APARELHO });

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
