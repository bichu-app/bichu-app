import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import { AppError } from '../../../shared/http/errors.js';
import type {
  AbsoluteUrl,
  Instant,
  OpaqueToken,
  TokenHash,
  UserId,
} from '../../../shared/types/brands.js';
import type { Clock } from '../../../shared/time/clock.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import { gerarHashDeSenha } from '../domain/password.js';
import type {
  Conta,
  CredencialLocal,
  FotoDoPerfil,
  MotivoDeRevogacao,
  NovoRefresh,
  PropositoDoToken,
  RefreshArmazenado,
  TokenConsumido,
} from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { ResultadoDaVerificacao, TokenSigner } from '../ports/token-signer.js';
import type { AvisoAoTitular, ContextoDaRequisicao } from './dependencies.js';
import { criarAuthService } from './auth-service.js';
import { RepositorioQueRecusaTudo } from '../adapters/persistence/repositorio-que-recusa-tudo-de-teste.js';

const VITIMA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const FAMILIA = 'fam-da-vitima';
const AGORA = INSTANTE_FIXO;

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: 'corr-1',
  ip: '203.0.113.7',
  userAgent: 'Bichu/1.0 (iPhone)',
};

function naoUsado(nome: string): never {
  throw new Error(`o dublê não implementa ${nome}: nenhum caso deste arquivo deveria chegar aqui`);
}

function contaAtiva(sessionsInvalidBefore: Instant): Conta {
  return {
    id: VITIMA,
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
    sessionsInvalidBefore,
    createdAt: dataFixa(1),
  };
}

interface RedefinicaoPendente {
  readonly pendente: TokenConsumido | undefined;
  readonly consumido: TokenConsumido | undefined;
  readonly credencial: CredencialLocal | undefined;
}

class RepositorioFalso extends RepositorioQueRecusaTudo {
  override fotoDoPerfil(): Promise<FotoDoPerfil | null> {
    return Promise.resolve(null);
  }

  protected recusar(nome: string): never {
    return naoUsado(nome);
  }

  public readonly revogacoes: { familyId: string; motivo: MotivoDeRevogacao; agora: Instant }[] = [];
  public readonly rotacoes: NovoRefresh[] = [];

  public readonly invalidacoesDeSessao: { userId: UserId; barreira: Instant; agora: Instant }[] =
    [];
  public readonly revogacoesEmMassa: {
    userId: UserId;
    motivo: MotivoDeRevogacao;
    agora: Instant;
  }[] = [];
  public familiasVivas = 2;
  public readonly invalidacoesDeTokens: { userId: UserId; agora: Instant }[] = [];
  public readonly credenciaisRegravadas: { identityId: string; agora: Instant }[] = [];
  public readonly consumosDeToken: Instant[] = [];
  public readonly familiasAbertas: NovoRefresh[] = [];
  public readonly loginsRegistrados: { identityId: string; agora: Instant }[] = [];

  public conta: Conta | undefined;

  constructor(
    private readonly refresh: RefreshArmazenado | undefined,
    conta: Conta | undefined,
    private readonly redefinicao: RedefinicaoPendente | undefined = undefined,
    private readonly login: CredencialLocal | undefined = undefined,
  ) {
    super();

    this.conta = conta;
  }

  override buscarRefreshPorHash(): Promise<RefreshArmazenado | undefined> {
    const gravado = this.familiasAbertas.at(-1);
    if (gravado === undefined) return Promise.resolve(this.refresh);
    return Promise.resolve({
      id: gravado.id,
      userId: gravado.userId,
      familyId: gravado.familyId,
      issuedAt: gravado.issuedAt,
      expiresAt: gravado.expiresAt,
      absoluteExpiresAt: gravado.absoluteExpiresAt,
      staySignedIn: gravado.staySignedIn,
      rotatedToId: null,
      revokedAt: null,
    });
  }

  override revogarFamilia(familyId: string, motivo: MotivoDeRevogacao, agora: Instant): Promise<number> {
    this.revogacoes.push({ familyId, motivo, agora });
    return Promise.resolve(2);
  }

  override buscarContaPorId(): Promise<Conta | undefined> {
    return Promise.resolve(this.conta);
  }

  override rotacionar(_atual: string, sucessor: NovoRefresh): Promise<boolean> {
    this.rotacoes.push(sucessor);
    return Promise.resolve(true);
  }
  override buscarCredencialLocalPorEmail(email: string): Promise<CredencialLocal | undefined> {
    if (this.redefinicao !== undefined) {
      const dono = this.redefinicao.consumido?.enviadoPara;
      return Promise.resolve(email === dono ? this.redefinicao.credencial : undefined);
    }
    if (this.login === undefined) return naoUsado('buscarCredencialLocalPorEmail');
    return Promise.resolve(this.login);
  }
  override regravarCredencial(identityId: string, _phc: string, agora: Instant): Promise<void> {
    if (this.redefinicao === undefined) return naoUsado('regravarCredencial');
    this.credenciaisRegravadas.push({ identityId, agora });
    return Promise.resolve();
  }
  override registrarLogin(identityId: string, agora: Instant): Promise<void> {
    if (this.login === undefined) return naoUsado('registrarLogin');
    this.loginsRegistrados.push({ identityId, agora });
    return Promise.resolve();
  }
  override gravarRefresh(novo: NovoRefresh): Promise<void> {
    if (this.login === undefined) return naoUsado('gravarRefresh');
    this.familiasAbertas.push(novo);
    return Promise.resolve();
  }
  override invalidarSessoes(userId: UserId, barreira: Instant, agora: Instant): Promise<void> {
    this.invalidacoesDeSessao.push({ userId, barreira, agora });
    if (this.conta !== undefined) {
      this.conta = {
        ...this.conta,
        sessionsInvalidBefore: Math.max(barreira, this.conta.sessionsInvalidBefore) as Instant,
      };
    }
    return Promise.resolve();
  }
  override revogarTodasAsFamilias(
    userId: UserId,
    motivo: MotivoDeRevogacao,
    agora: Instant,
  ): Promise<number> {
    this.revogacoesEmMassa.push({ userId, motivo, agora });
    return Promise.resolve(this.familiasVivas);
  }
  override consumirTokenDeVerificacao(
    _hash: TokenHash,
    _proposito: PropositoDoToken,
    agora: Instant,
  ): Promise<TokenConsumido | undefined> {
    if (this.redefinicao === undefined) return naoUsado('consumirTokenDeVerificacao');
    this.consumosDeToken.push(agora);
    return Promise.resolve(this.redefinicao.consumido);
  }
  override conferirTokenDeVerificacao(): Promise<TokenConsumido | undefined> {
    if (this.redefinicao === undefined) return naoUsado('conferirTokenDeVerificacao');
    return Promise.resolve(this.redefinicao.pendente);
  }
  override invalidarTokensPendentes(userId: UserId, agora: Instant): Promise<number> {
    if (this.redefinicao === undefined) return naoUsado('invalidarTokensPendentes');
    this.invalidacoesDeTokens.push({ userId, agora });
    return Promise.resolve(1);
  }

  expurgarConta(): Promise<boolean> {
    return naoUsado('expurgarConta');
  }

  override cancelarTrocaDeEmailPendente(): Promise<void> {
    return Promise.resolve();
  }
}

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly repo: RepositorioFalso;
  readonly eventos: AuditEvent[];
  readonly avisos: AvisoAoTitular[];
  readonly mensagens: Mensagem[];
}

function montar(opcoes: {
  refresh?: RefreshArmazenado | undefined;
  conta?: Conta | undefined;
  verificacao?: ResultadoDaVerificacao | undefined;
  redefinicao?: RedefinicaoPendente | undefined;
  login?: CredencialLocal | undefined;
  agora?: Instant | undefined;
  relogio?: Clock | undefined;
}): Bancada {
  const repo = new RepositorioFalso(
    opcoes.refresh,
    opcoes.conta,
    opcoes.redefinicao,
    opcoes.login,
  );
  const agoraDaBancada = opcoes.agora ?? AGORA;
  const eventos: AuditEvent[] = [];
  const avisos: AvisoAoTitular[] = [];
  const mensagens: Mensagem[] = [];

  const trilha: AuditLog = {
    record(evento) {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const mailer: Mailer = {
    enviar(mensagem) {
      mensagens.push(mensagem);
      return Promise.resolve();
    },
  };
  const iatPorToken = new Map<string, number>();
  const assinador: TokenSigner = {
    emitir: (sub, agora, jti) => {
      const iat = Math.floor(agora / 1000);
      const token = `token-de-${sub}#${String(iatPorToken.size + 1)}`;
      iatPorToken.set(token, iat);
      return { token, expiresInSeconds: 900, issuedAt: iat, jti };
    },
    verificar: (token) => {
      if (opcoes.verificacao !== undefined) return opcoes.verificacao;
      const iat = iatPorToken.get(token);
      if (iat === undefined) return { ok: false, motivo: 'malformado' };
      return {
        ok: true,
        claims: {
          sub: VITIMA,
          iss: 'https://api.bichu.test',
          aud: 'https://api.bichu.test',
          iat,
          exp: iat + 900,
          jti: 'jti-1',
        },
      };
    },
    jwks: () => [],
  };

  const servico = criarAuthService({
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
    removerPushDaConta: () => Promise.resolve(0),
    apagarLocalizacaoDaSessao: () => Promise.resolve(0),
    repositorio: repo,
    assinador,
    trilha,
    ids: {
      uuidv7: () => 'id-novo',
      opaqueToken: () => 'refresh-novo' as OpaqueToken,
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
    },
    clock: opcoes.relogio ?? relogioParado(agoraDaBancada),
    janelas: {
      idleTtlSeconds: 30 * 86_400,
      staySignedInIdleTtlSeconds: 180 * 86_400,
      absoluteTtlSeconds: 180 * 86_400,
    },
    hmacDeIp: () => null,
    avisarTitular: (aviso) => {
      avisos.push(aviso);
      return Promise.resolve();
    },
    mailer,
    registrarOcorrencia: () => {
      // Nenhum caso deste arquivo afirma log.
    },
    baseDaWeb: 'https://bichu.test' as AbsoluteUrl,
  });

  return { servico, repo, eventos, avisos, mensagens };
}

function refreshArmazenado(campos: Partial<RefreshArmazenado>): RefreshArmazenado {
  return {
    id: 'refresh-1',
    userId: VITIMA,
    familyId: FAMILIA,
    issuedAt: AGORA,
    expiresAt: (AGORA + 30 * 86_400_000) as Instant,
    absoluteExpiresAt: (AGORA + 180 * 86_400_000) as Instant,
    staySignedIn: false,
    rotatedToId: null,
    revokedAt: null,
    ...campos,
  };
}

async function capturar(promessa: Promise<unknown>): Promise<AppError> {
  try {
    await promessa;
  } catch (erro) {
    assert.ok(erro instanceof AppError, 'o serviço fala por AppError');
    return erro;
  }
  throw new assert.AssertionError({ message: 'a chamada deveria ter sido recusada' });
}

void describe('reuso de refresh token (BICHUS-15, critérios 4 e 10)', () => {
  const jaConsumido = () =>
    montar({
      refresh: refreshArmazenado({ rotatedToId: 'refresh-2' }),
      conta: contaAtiva(0 as Instant),
    });

  void it('revoga a família inteira, e não só o token apresentado', async () => {
    const bancada = jaConsumido();
    await capturar(bancada.servico.renovar('refresh-roubado', CONTEXTO));

    assert.deepEqual(
      bancada.repo.revogacoes.map((r) => ({ familyId: r.familyId, motivo: r.motivo })),
      [{ familyId: FAMILIA, motivo: 'reuse_detected' }],
    );
    assert.equal(bancada.repo.rotacoes.length, 0, 'reuso não emite token novo');
  });

  void it('avisa o titular: detecção silenciosa não protege ninguém', async () => {
    const bancada = jaConsumido();
    await capturar(bancada.servico.renovar('refresh-roubado', CONTEXTO));

    assert.deepEqual(bancada.avisos, [
      {
        tipo: 'refresh_reuse_detected',
        userId: VITIMA,
        ocorridoEm: AGORA,
        correlationId: CONTEXTO.correlationId,
        ipHmac: null,
      },
    ]);

    assert.deepEqual(bancada.mensagens, [], 'o serviço avisa pela porta, não pelo mailer');
  });

  void it('deixa o reuso registrado na trilha, com a família como recurso', async () => {
    const bancada = jaConsumido();
    await capturar(bancada.servico.renovar('refresh-roubado', CONTEXTO));

    const reuso = bancada.eventos.filter((e) => e.action === 'auth.refresh_reuse_detected');
    assert.equal(reuso.length, 1);
    assert.equal(reuso[0]?.resourceId, FAMILIA);
    assert.equal(reuso[0]?.actorUserId, VITIMA);
  });

  void it('responde com a MESMA 401 de sessão expirada, sem contar o que descobriu', async () => {
    const bancada = jaConsumido();
    const erro = await capturar(bancada.servico.renovar('refresh-roubado', CONTEXTO));

    assert.equal(erro.status, 401);
    assert.equal(erro.problemType, 'token-expired');
  });

  void it('token REVOGADO sem reuso não dispara revogação nova nem aviso', async () => {
    const bancada = montar({
      refresh: refreshArmazenado({ revokedAt: dataFixa(AGORA - 1000) }),
      conta: contaAtiva(0 as Instant),
    });

    const erro = await capturar(bancada.servico.renovar('refresh-de-sessao-encerrada', CONTEXTO));
    assert.equal(erro.status, 401);
    assert.deepEqual(bancada.avisos, []);
    assert.deepEqual(bancada.repo.revogacoes, []);
  });
});

void describe('autenticar(): a barreira do SEC-006 (BICHUS-15, critério 8)', () => {
  const claims = (iatEmSegundos: number): ResultadoDaVerificacao => ({
    ok: true,
    claims: {
      sub: VITIMA,
      iss: 'https://api.bichu.test',
      aud: 'https://api.bichu.test',
      iat: iatEmSegundos,
      exp: iatEmSegundos + 900,
      jti: 'jti-1',
    },
  });

  void it('recusa com 401 o token cujo `iat` é anterior a sessions_invalid_before', async () => {
    const revogadoEm = AGORA;
    const bancada = montar({
      conta: contaAtiva(revogadoEm),
      verificacao: claims(Math.floor((AGORA - 60_000) / 1000)),
    });

    const erro = await capturar(bancada.servico.autenticar('token-do-invasor'));
    assert.equal(erro.status, 401);
    assert.equal(erro.problemType, 'token-expired');
  });

  void it('aceita o token emitido DEPOIS da revogação', async () => {
    const bancada = montar({
      conta: contaAtiva(AGORA),
      verificacao: claims(Math.floor((AGORA + 60_000) / 1000)),
    });

    const autenticado = await bancada.servico.autenticar('token-legitimo');
    assert.equal(autenticado.conta.id, VITIMA);
    assert.equal(autenticado.jti, 'jti-1');
  });

  void it('recusa com 401 o token de emissor fora da lista (critério 5)', async () => {
    const bancada = montar({
      conta: contaAtiva(0 as Instant),
      verificacao: { ok: false, motivo: 'emissor_nao_confiavel' },
    });

    const erro = await capturar(bancada.servico.autenticar('token-de-outro-emissor'));
    assert.equal(erro.status, 401);
    assert.equal(erro.problemType, 'unauthenticated');
  });
});

void describe('confirmarRedefinicaoDeSenha(): o gatilho que sobrou do critério 7 (BICHUS-126)', () => {
  const EMAIL_DA_CONTA = 'tutora@exemplo.test';
  const LINK_DO_EMAIL = 'token-que-chegou-no-e-mail';
  const SENHA_NOVA = 'chuva-de-marco-no-quintal';

  const DONO: TokenConsumido = { userId: VITIMA, enviadoPara: EMAIL_DA_CONTA };
  const CREDENCIAL: CredencialLocal = {
    identityId: 'identidade-local-1',
    userId: VITIMA,
    passwordPhc: '$pbkdf2-sha512$i=210000$c2FsLWFudGlnbw$aGFzaC1hbnRpZ28',
    mustChange: false,
  };

  const redefinicaoQueCompleta = () =>
    montar({
      conta: contaAtiva(0 as Instant),
      redefinicao: { pendente: DONO, consumido: DONO, credencial: CREDENCIAL },
    });

  void it('empurra sessions_invalid_before pela porta, com o dono e o instante da troca', async () => {
    const bancada = redefinicaoQueCompleta();
    await bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, SENHA_NOVA, CONTEXTO);

    assert.deepEqual(bancada.repo.invalidacoesDeSessao, [
      { userId: VITIMA, barreira: AGORA, agora: AGORA },
    ]);
  });

  void it('derruba junto os links de redefinição pendentes e regrava a credencial', async () => {
    const bancada = redefinicaoQueCompleta();
    await bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, SENHA_NOVA, CONTEXTO);

    assert.deepEqual(bancada.repo.invalidacoesDeTokens, [{ userId: VITIMA, agora: AGORA }]);
    assert.deepEqual(bancada.repo.credenciaisRegravadas, [
      { identityId: CREDENCIAL.identityId, agora: AGORA },
    ]);
  });

  void it('deixa a troca na trilha, com a conta como ator e como recurso', async () => {
    const bancada = redefinicaoQueCompleta();
    await bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, SENHA_NOVA, CONTEXTO);

    const trocas = bancada.eventos.filter((e) => e.action === 'auth.password_reset_completed');
    assert.equal(trocas.length, 1);
    assert.equal(trocas[0]?.actorUserId, VITIMA);
    assert.equal(trocas[0]?.resourceId, VITIMA);
    assert.equal(trocas[0]?.correlationId, CONTEXTO.correlationId);
  });

  void it('senha fraca: não gasta o link, não troca nada e não mexe nas sessões', async () => {
    const bancada = redefinicaoQueCompleta();
    const erro = await capturar(
      bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, 'curta', CONTEXTO),
    );

    assert.equal(erro.problemType, 'weak-password');
    assert.deepEqual(bancada.repo.consumosDeToken, [], 'senha recusada NÃO gasta o link');
    assert.deepEqual(bancada.repo.invalidacoesDeSessao, []);
    assert.deepEqual(bancada.repo.credenciaisRegravadas, []);
  });

  void it('link já gasto entre a conferência e a transação: nada de sessão é tocado', async () => {
    const bancada = montar({
      conta: contaAtiva(0 as Instant),
      redefinicao: { pendente: DONO, consumido: undefined, credencial: CREDENCIAL },
    });

    const erro = await capturar(
      bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, SENHA_NOVA, CONTEXTO),
    );

    assert.equal(erro.problemType, 'verification-token-expired');
    assert.deepEqual(bancada.repo.invalidacoesDeSessao, []);
    assert.deepEqual(bancada.repo.credenciaisRegravadas, []);
    assert.deepEqual(bancada.eventos, [], 'nada aconteceu, nada é registrado');
  });
});

void describe('entrar no mesmo segundo da redefinição de senha (BICHUS-132)', () => {
  const EMAIL_DA_CONTA = 'tutora@exemplo.test';
  const SENHA_NOVA = 'chuva-de-marco-no-quintal';
  const IDENTIDADE = 'identidade-local-1';

  const LOGIN_EM = (INSTANTE_FIXO + 734) as Instant;
  const REDEFINIDA_EM = (INSTANTE_FIXO + 500) as Instant;
  const ANTES_DA_TROCA = (INSTANTE_FIXO - 60_000) as Instant;

  let phcGuardado: string | undefined;
  async function phcDaSenhaNova(): Promise<string> {
    phcGuardado ??= await gerarHashDeSenha(SENHA_NOVA);
    return phcGuardado;
  }

  async function bancadaDeLogin(sessionsInvalidBefore: Instant): Promise<Bancada> {
    return montar({
      conta: contaAtiva(sessionsInvalidBefore),
      agora: LOGIN_EM,
      login: {
        identityId: IDENTIDADE,
        userId: VITIMA,
        passwordPhc: await phcDaSenhaNova(),
        mustChange: false,
      },
    });
  }

  const entrar = (bancada: Bancada): Promise<{ access_token: string }> =>
    bancada.servico.entrar(
      { email: EMAIL_DA_CONTA, password: SENHA_NOVA, staySignedIn: false },
      CONTEXTO,
    );

  void it('A ISCA: a primeira tela depois de redefinir a senha FUNCIONA', async () => {
    const bancada = await bancadaDeLogin(REDEFINIDA_EM);
    const sessao = await entrar(bancada);

    const autenticado = await bancada.servico.autenticar(sessao.access_token);
    assert.equal(autenticado.conta.id, VITIMA);
  });

  void it('O CONTRAPESO: o token do invasor, anterior à troca, continua recusado', async () => {
    const bancada = await bancadaDeLogin(ANTES_DA_TROCA);
    const doInvasor = await entrar(bancada);

    bancada.repo.conta = contaAtiva(REDEFINIDA_EM);

    const erro = await capturar(bancada.servico.autenticar(doInvasor.access_token));
    assert.equal(erro.status, 401);
    assert.equal(erro.problemType, 'token-expired');
  });

  void it('os dois no MESMO segundo: o do invasor cai, o da vítima passa', async () => {
    const bancada = await bancadaDeLogin(ANTES_DA_TROCA);
    const doInvasor = await entrar(bancada);

    bancada.repo.conta = contaAtiva(REDEFINIDA_EM);
    const daVitima = await entrar(bancada);

    const erro = await capturar(bancada.servico.autenticar(doInvasor.access_token));
    assert.equal(erro.problemType, 'token-expired', 'quem estava dentro é expulso');

    const autenticado = await bancada.servico.autenticar(daVitima.access_token);
    assert.equal(autenticado.conta.id, VITIMA, 'quem acabou de retomar a conta entra');
  });

  void it('só o `iat` do token de acesso se move: refresh e trilha ficam em `agora`', async () => {
    const bancada = await bancadaDeLogin(REDEFINIDA_EM);
    await entrar(bancada);

    assert.deepEqual(bancada.repo.loginsRegistrados, [{ identityId: IDENTIDADE, agora: LOGIN_EM }]);
    assert.equal(bancada.repo.familiasAbertas.length, 1);
    assert.equal(
      bancada.repo.familiasAbertas[0]?.expiresAt,
      LOGIN_EM + 30 * 86_400_000,
      'o prazo do refresh conta a partir do relógio da requisição, e não do empurrão',
    );
  });
});

void describe('duas revogações no mesmo segundo (SEC-006)', () => {
  const EMAIL_DA_CONTA = 'tutora@exemplo.test';
  const SENHA = 'chuva-de-marco-no-quintal';
  const IDENTIDADE = 'identidade-local-1';

  const PRIMEIRA_REVOGACAO = (INSTANTE_FIXO + 200) as Instant;
  const LOGIN_DO_INVASOR = (INSTANTE_FIXO + 400) as Instant;
  const SEGUNDA_REVOGACAO = (INSTANTE_FIXO + 600) as Instant;
  const ANTES = (INSTANTE_FIXO - 60_000) as Instant;

  let phcGuardado: string | undefined;
  async function phcDaSenha(): Promise<string> {
    phcGuardado ??= await gerarHashDeSenha(SENHA);
    return phcGuardado;
  }

  async function bancadaComRelogio(): Promise<{ bancada: Bancada; mover: (q: Instant) => void }> {
    let agora: Instant = ANTES;
    const bancada = montar({
      conta: contaAtiva(ANTES),
      relogio: { now: () => agora } satisfies Clock,
      login: {
        identityId: IDENTIDADE,
        userId: VITIMA,
        passwordPhc: await phcDaSenha(),
        mustChange: false,
      },
    });
    return {
      bancada,
      mover: (quando: Instant) => {
        agora = quando;
      },
    };
  }

  const entrar = (bancada: Bancada): Promise<{ access_token: string }> =>
    bancada.servico.entrar({ email: EMAIL_DA_CONTA, password: SENHA, staySignedIn: false }, CONTEXTO);

  void it('A ISCA: o token emitido ENTRE as duas revogações não sobrevive à segunda', async () => {
    const { bancada, mover } = await bancadaComRelogio();

    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);

    mover(LOGIN_DO_INVASOR);
    const doInvasor = await entrar(bancada);
    const aindaVale = await bancada.servico.autenticar(doInvasor.access_token);
    assert.equal(aindaVale.conta.id, VITIMA, 'o token precisa ter VALIDO, senão não há o que revogar');

    mover(SEGUNDA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'password_changed', CONTEXTO);

    const erro = await capturar(bancada.servico.autenticar(doInvasor.access_token));
    assert.equal(
      erro.problemType,
      'token-expired',
      'a segunda revogação não alcançou o token emitido depois da primeira: quem tomou a ' +
        'conta continua dentro por até quinze minutos, e a troca de senha prometeu expulsá-lo',
    );
    assert.equal(erro.status, 401);
  });

  void it('O CONTRAPESO: quem revoga continua conseguindo entrar em seguida', async () => {
    const { bancada, mover } = await bancadaComRelogio();

    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);
    mover(SEGUNDA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'password_changed', CONTEXTO);

    const daVitima = await entrar(bancada);
    const autenticado = await bancada.servico.autenticar(daVitima.access_token);
    assert.equal(autenticado.conta.id, VITIMA, 'a primeira tela depois da troca não pode dar 401');
  });

  void it('sem revogação recente, a barreira gravada é `agora` ao milissegundo', async () => {
    const { bancada, mover } = await bancadaComRelogio();

    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);

    assert.deepEqual(bancada.repo.invalidacoesDeSessao, [
      { userId: VITIMA, barreira: PRIMEIRA_REVOGACAO, agora: PRIMEIRA_REVOGACAO },
    ]);
  });

  void it('o empurrão da segunda revogação é de no máximo um segundo', async () => {
    const { bancada, mover } = await bancadaComRelogio();

    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);
    mover(SEGUNDA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'password_changed', CONTEXTO);

    const segunda = bancada.repo.invalidacoesDeSessao[1];
    assert.ok(segunda !== undefined);
    assert.equal(segunda.agora, SEGUNDA_REVOGACAO, '`updated_at` continua no relógio da requisição');
    assert.ok(
      segunda.barreira > SEGUNDA_REVOGACAO,
      'a barreira precisa passar do `iat` que a emissão empurrou',
    );
    assert.ok(
      segunda.barreira - SEGUNDA_REVOGACAO <= 1000,
      'e não pode passar da virada seguinte: mais que isso é tempo de ninguém entrar',
    );
  });

  void it('a recusa é indistinguível de um token inválido qualquer', async () => {
    const { bancada, mover } = await bancadaComRelogio();

    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);
    mover(LOGIN_DO_INVASOR);
    const doInvasor = await entrar(bancada);
    mover(SEGUNDA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'password_changed', CONTEXTO);

    const pelaSegundaRevogacao = await capturar(bancada.servico.autenticar(doInvasor.access_token));

    const outra = montar({ conta: contaAtiva(0 as Instant), verificacao: { ok: false, motivo: 'expirado' } });
    const qualquerUm = await capturar(outra.servico.autenticar('token-vencido'));

    assert.equal(pelaSegundaRevogacao.status, qualquerUm.status);
    assert.equal(pelaSegundaRevogacao.problemType, qualquerUm.problemType);
    assert.equal(pelaSegundaRevogacao.message, qualquerUm.message);
  });
});

void describe('renovar() respeita sessions_invalid_before (BICHUS-77 critério 5)', () => {
  const TROCA_EM = (AGORA + 1_000) as Instant;

  void it('A ISCA: recusa o refresh emitido ANTES da troca de senha', async () => {
    const bancada = montar({
      refresh: refreshArmazenado({ issuedAt: AGORA }),
      conta: contaAtiva(TROCA_EM),
    });

    const erro = await capturar(bancada.servico.renovar('refresh-copiado', CONTEXTO));
    assert.equal(erro.status, 401);
    assert.equal(erro.problemType, 'token-expired');

    assert.deepEqual(bancada.repo.rotacoes, [], 'a recusa vem ANTES da rotação');
  });

  void it('O CONTRAPESO: o refresh emitido DEPOIS da troca continua valendo', async () => {
    const bancada = montar({
      refresh: refreshArmazenado({ issuedAt: (TROCA_EM + 1) as Instant }),
      conta: contaAtiva(TROCA_EM),
    });

    const sessao = await bancada.servico.renovar('refresh-legitimo', CONTEXTO);
    assert.equal(bancada.repo.rotacoes.length, 1, 'rotacionou normalmente');
    assert.ok(sessao.access_token.length > 0);
  });

  void it('o empate sobrevive: refresh nascido no MESMO instante da barreira renova', async () => {
    const bancada = montar({
      refresh: refreshArmazenado({ issuedAt: TROCA_EM }),
      conta: contaAtiva(TROCA_EM),
    });

    await bancada.servico.renovar('refresh-do-mesmo-instante', CONTEXTO);
    assert.equal(bancada.repo.rotacoes.length, 1);
  });

  void it('a recusa é indistinguível da de um refresh simplesmente vencido', async () => {
    const porBarreira = montar({
      refresh: refreshArmazenado({ issuedAt: AGORA }),
      conta: contaAtiva(TROCA_EM),
    });
    const porVencimento = montar({
      refresh: refreshArmazenado({ expiresAt: (AGORA - 1) as Instant }),
      conta: contaAtiva(0 as Instant),
    });

    const a = await capturar(porBarreira.servico.renovar('refresh-copiado', CONTEXTO));
    const b = await capturar(porVencimento.servico.renovar('refresh-vencido', CONTEXTO));

    assert.equal(a.status, b.status);
    assert.equal(a.problemType, b.problemType);
    assert.equal(a.message, b.message);
    assert.deepEqual(a.errors, b.errors);
  });

  void it('a tentativa negada entra na trilha, com a família como recurso', async () => {
    const bancada = montar({
      refresh: refreshArmazenado({ issuedAt: AGORA }),
      conta: contaAtiva(TROCA_EM),
    });
    await capturar(bancada.servico.renovar('refresh-copiado', CONTEXTO));

    const negadas = bancada.eventos.filter(
      (e) => e.action === 'auth.refresh_rejected_revoked_session',
    );
    assert.equal(negadas.length, 1);
    assert.equal(negadas[0]?.resourceId, FAMILIA);
    assert.equal(
      bancada.eventos.filter((e) => e.action === 'auth.session_refreshed').length,
      0,
      'renovação negada não é renovação',
    );
  });
});

void describe('a troca de senha derruba a renovação, de ponta a ponta (BICHUS-126 critério 7)', () => {
  const EMAIL_DA_CONTA = 'tutora@exemplo.test';
  const SENHA_NOVA = 'chuva-de-marco-no-quintal';
  const LINK_DO_EMAIL = 'token-que-chegou-no-e-mail';
  const DONO: TokenConsumido = { userId: VITIMA, enviadoPara: EMAIL_DA_CONTA };

  let phcGuardado: string | undefined;
  async function credencial(): Promise<CredencialLocal> {
    phcGuardado ??= await gerarHashDeSenha(SENHA_NOVA);
    return {
      identityId: 'identidade-local-1',
      userId: VITIMA,
      passwordPhc: phcGuardado,
      mustChange: false,
    };
  }

  function relogioQueAnda(inicio: Instant): { clock: Clock; avancar: (ms: number) => void } {
    let agora = inicio;
    return { clock: { now: () => agora }, avancar: (ms) => { agora = (agora + ms) as Instant; } };
  }

  async function bancadaCompleta(relogio: Clock): Promise<Bancada> {
    const cred = await credencial();
    return montar({
      conta: contaAtiva(0 as Instant),
      login: cred,
      redefinicao: { pendente: DONO, consumido: DONO, credencial: cred },
      relogio,
    });
  }

  void it('o refresh que funcionava antes da troca deixa de funcionar depois dela', async () => {
    const tempo = relogioQueAnda(AGORA);
    const bancada = await bancadaCompleta(tempo.clock);

    await bancada.servico.entrar(
      { email: EMAIL_DA_CONTA, password: SENHA_NOVA, staySignedIn: false },
      CONTEXTO,
    );
    await bancada.servico.renovar('refresh-novo', CONTEXTO);
    assert.equal(bancada.repo.rotacoes.length, 1, 'antes da troca, renova');

    tempo.avancar(500);
    const TROCA = (AGORA + 500) as Instant;
    await bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, SENHA_NOVA, CONTEXTO);
    assert.deepEqual(bancada.repo.invalidacoesDeSessao, [
      { userId: VITIMA, barreira: TROCA, agora: TROCA },
    ]);

    const erro = await capturar(bancada.servico.renovar('refresh-novo', CONTEXTO));
    assert.equal(erro.status, 401);
    assert.equal(bancada.repo.rotacoes.length, 1, 'depois da troca, não renova mais');
  });
});

void describe('o refresh emitido logo depois de uma revogação dupla renova (BICHUS-207 + BICHUS-77)', () => {
  const EMAIL_DA_CONTA = 'tutora@exemplo.test';
  const SENHA = 'chuva-de-marco-no-quintal';
  const IDENTIDADE = 'identidade-local-1';

  const PRIMEIRA_REVOGACAO = (INSTANTE_FIXO + 200) as Instant;
  const SEGUNDA_REVOGACAO = (INSTANTE_FIXO + 400) as Instant;
  const LOGIN = (INSTANTE_FIXO + 600) as Instant;
  const PRIMEIRA_RENOVACAO = (INSTANTE_FIXO + 800) as Instant;
  const ANTES = (INSTANTE_FIXO - 60_000) as Instant;

  const BARREIRA_ADIANTADA = (INSTANTE_FIXO + 1_001) as Instant;

  let phcGuardado: string | undefined;
  async function phcDaSenha(): Promise<string> {
    phcGuardado ??= await gerarHashDeSenha(SENHA);
    return phcGuardado;
  }

  async function bancadaComRelogio(
    barreiraInicial: Instant,
  ): Promise<{ bancada: Bancada; mover: (q: Instant) => void }> {
    let agora: Instant = ANTES;
    const bancada = montar({
      conta: contaAtiva(barreiraInicial),
      relogio: { now: () => agora } satisfies Clock,
      login: {
        identityId: IDENTIDADE,
        userId: VITIMA,
        passwordPhc: await phcDaSenha(),
        mustChange: false,
      },
    });
    return { bancada, mover: (quando: Instant) => { agora = quando; } };
  }

  const entrar = (bancada: Bancada): Promise<{ access_token: string }> =>
    bancada.servico.entrar({ email: EMAIL_DA_CONTA, password: SENHA, staySignedIn: false }, CONTEXTO);

  void it('A ISCA: entra no ≤1 s seguinte a uma revogação dupla e a PRIMEIRA renovação funciona', async () => {
    const { bancada, mover } = await bancadaComRelogio(ANTES);

    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);

    mover(SEGUNDA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'password_changed', CONTEXTO);
    assert.equal(
      bancada.repo.invalidacoesDeSessao.at(-1)?.barreira,
      BARREIRA_ADIANTADA,
      'o cenário só existe se a segunda revogação tiver mesmo adiantado a barreira',
    );

    mover(LOGIN);
    const daVitima = await entrar(bancada);
    const autenticado = await bancada.servico.autenticar(daVitima.access_token);
    assert.equal(autenticado.conta.id, VITIMA, 'o login em si precisa ter funcionado');

    mover(PRIMEIRA_RENOVACAO);
    const recusa = await bancada.servico
      .renovar('refresh-novo', CONTEXTO)
      .then(() => undefined, (erro: unknown) => erro);

    assert.equal(
      recusa,
      undefined,
      'a PRIMEIRA renovação de quem acabou de entrar foi recusada. O refresh do login nasceu ' +
        'com `issued_at = agora`, abaixo da barreira que a revogação dupla adiantou ' +
        '(BICHUS-207), e `refreshFoiRevogado` (BICHUS-77) o derrubou. Quem cai é a pessoa que ' +
        'acabou de retomar a conta, 200 ms depois de entrar. O `Math.max` de `abrirSessao` faz ' +
        'o refresh nascer NA barreira em vez de abaixo dela',
    );
    assert.equal(
      bancada.repo.rotacoes.length,
      1,
      'renovou de verdade: a rotação tem de estar gravada, e não só a chamada ter voltado',
    );
    assert.deepEqual(
      bancada.eventos.filter((e) => e.action === 'auth.refresh_rejected_revoked_session'),
      [],
      'a trilha registrou a renovação como se fosse sessão revogada, e a sessão é de 200 ms atrás',
    );
  });

  void it('O CONTRAPESO: sem revogação recente, o login renova normalmente', async () => {
    const { bancada, mover } = await bancadaComRelogio(ANTES);

    mover(LOGIN);
    await entrar(bancada);
    assert.equal(
      bancada.repo.familiasAbertas.at(-1)?.issuedAt,
      LOGIN,
      'sem barreira à frente do relógio, `issued_at` continua sendo `agora` ao milissegundo',
    );

    mover(PRIMEIRA_RENOVACAO);
    await bancada.servico.renovar('refresh-novo', CONTEXTO);
    assert.equal(bancada.repo.rotacoes.length, 1, 'renovou normalmente');
  });

  void it('O PORTÃO CONTINUA PORTÃO: o refresh anterior à barreira segue recusado', async () => {
    const bancada = montar({
      refresh: refreshArmazenado({ issuedAt: LOGIN }),
      conta: contaAtiva(BARREIRA_ADIANTADA),
      agora: PRIMEIRA_RENOVACAO,
    });

    const erro = await capturar(bancada.servico.renovar('refresh-copiado', CONTEXTO));
    assert.equal(erro.status, 401);
    assert.deepEqual(bancada.repo.rotacoes, [], 'a recusa vem ANTES da rotação');
  });
});
