/**
 * "Sair de todos os aparelhos" — o gatilho que a BICHUS-125 existe para construir,
 * provado pelo EFEITO e não pela chamada.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import { AppError } from '../../../shared/http/errors.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { Clock } from '../../../shared/time/clock.js';
import { dataFixa, INSTANTE_FIXO } from '../../../shared/time/relogio-de-teste.js';
import type {
  AbsoluteUrl,
  Instant,
  OpaqueToken,
  TokenHash,
  UserId,
} from '../../../shared/types/brands.js';
import { gerarHashDeSenha } from '../domain/password.js';
import type {
  Conta,
  CredencialLocal,
  FotoDoPerfil,
  MotivoDeRevogacao,
  NovoRefresh,
  RefreshArmazenado,
} from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { ClaimsDoAcesso, TokenSigner } from '../ports/token-signer.js';
import type { Autenticado } from './auth-service.js';
import { criarAuthService } from './auth-service.js';
import type { ContextoDaRequisicao } from './dependencies.js';
import { RepositorioQueRecusaTudo } from '../adapters/persistence/repositorio-que-recusa-tudo-de-teste.js';

const TUTORA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const EMAIL = 'tutora@exemplo.test';
const SENHA = 'chuva-morna-no-telhado-37';

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: 'corr-1',
  ip: '203.0.113.7',
  userAgent: 'Bichu/1.0 (iPhone)',
};

/** Relógio que anda quando o caso mandar. */
function relogioQueAnda(inicio: Instant = INSTANTE_FIXO): Clock & {
  avancar: (ms: number) => void;
} {
  let agora = inicio;
  return {
    now: () => agora,
    avancar: (ms: number) => {
      agora = (agora + ms) as Instant;
    },
  };
}

function geradorSequencial(): IdGenerator {
  let n = 0;
  return {
    uuidv7: () => `id-${String(++n).padStart(4, '0')}`,
    opaqueToken: () => `tok-${String(++n).padStart(4, '0')}` as OpaqueToken,
    random128: () => new Uint8Array(16),
    random80: () => new Uint8Array(10),
  };
}

/** Um `refresh_tokens` de mentira que se comporta como a tabela. */
interface Linha {
  id: string;
  userId: UserId;
  familyId: string;
  /** `TokenHash` e `Buffer` desde 19/10: a comparacao e `.equals`, nunca `===`. */
  tokenHash: TokenHash;
  /** BICHUS-77: `renovar()` compara este valor com a barreira da conta. */
  issuedAt: Instant;
  expiresAt: Instant;
  absoluteExpiresAt: Instant;
  staySignedIn: boolean;
  rotatedToId: string | null;
  revokedAt: Date | null;
  revokedReason: MotivoDeRevogacao | null;
}

/** A recusa deste arquivo, pelo nome da porta. */
function naoUsado(nome: string): never {
  throw new Error(`${nome}: nenhum caso deste arquivo deveria chegar aqui`);
}

class BancoDeMentira extends RepositorioQueRecusaTudo {
  override fotoDoPerfil(): Promise<FotoDoPerfil | null> {
    return Promise.resolve(null);
  }

  protected recusar(nome: string): never {
    return naoUsado(nome);
  }

  public readonly linhas: Linha[] = [];
  public conta: Conta;
  public readonly credencial: CredencialLocal;

  constructor(phc: string) {
    super();

    this.conta = {
      id: TUTORA,
      email: EMAIL,
      emailVerifiedAt: dataFixa(0),
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
      createdAt: dataFixa(0),
    };
    this.credencial = {
      identityId: 'ident-1',
      userId: TUTORA,
      passwordPhc: phc,
      mustChange: false,
    };
  }

  /** As linhas que o "sair de todos" tem de alcançar. */
  get vivas(): Linha[] {
    return this.linhas.filter((l) => l.revokedAt === null);
  }

  override gravarRefresh(novo: NovoRefresh): Promise<void> {
    this.linhas.push({
      id: novo.id,
      userId: novo.userId,
      familyId: novo.familyId,
      tokenHash: novo.tokenHash,
      issuedAt: novo.issuedAt,
      expiresAt: novo.expiresAt,
      absoluteExpiresAt: novo.absoluteExpiresAt,
      staySignedIn: novo.staySignedIn,
      rotatedToId: null,
      revokedAt: null,
      revokedReason: null,
    });
    return Promise.resolve();
  }

  override buscarRefreshPorHash(hash: TokenHash): Promise<RefreshArmazenado | undefined> {
    const l = this.linhas.find((x) => x.tokenHash.equals(hash));
    if (l === undefined) return Promise.resolve(undefined);
    return Promise.resolve({
      id: l.id,
      userId: l.userId,
      familyId: l.familyId,
      issuedAt: l.issuedAt,
      expiresAt: l.expiresAt,
      absoluteExpiresAt: l.absoluteExpiresAt,
      staySignedIn: l.staySignedIn,
      rotatedToId: l.rotatedToId,
      revokedAt: l.revokedAt,
    });
  }

  override rotacionar(atualId: string, sucessor: NovoRefresh, agora: Instant): Promise<boolean> {
    const atual = this.linhas.find((x) => x.id === atualId);
    if (atual === undefined || atual.rotatedToId !== null || atual.revokedAt !== null) {
      return Promise.resolve(false);
    }
    atual.rotatedToId = sucessor.id;
    atual.revokedAt = dataFixa(agora);
    atual.revokedReason = 'rotation';
    void this.gravarRefresh(sucessor);
    return Promise.resolve(true);
  }

  override revogarFamilia(familyId: string, motivo: MotivoDeRevogacao, agora: Instant): Promise<number> {
    const alvo = this.linhas.filter((l) => l.familyId === familyId && l.revokedAt === null);
    for (const l of alvo) {
      l.revokedAt = dataFixa(agora);
      l.revokedReason = motivo;
    }
    return Promise.resolve(alvo.length);
  }

  override revogarTodasAsFamilias(
    userId: UserId,
    motivo: MotivoDeRevogacao,
    agora: Instant,
  ): Promise<number> {
    const alvo = this.linhas.filter((l) => l.userId === userId && l.revokedAt === null);
    for (const l of alvo) {
      l.revokedAt = dataFixa(agora);
      l.revokedReason = motivo;
    }
    return Promise.resolve(alvo.length);
  }

  override invalidarSessoes(userId: UserId, agora: Instant): Promise<void> {
    if (this.conta.id === userId) {
      this.conta = { ...this.conta, sessionsInvalidBefore: agora };
    }
    return Promise.resolve();
  }

  override buscarContaPorId(): Promise<Conta | undefined> {
    return Promise.resolve(this.conta);
  }
  override buscarContaPorEmail(): Promise<Conta | undefined> {
    return Promise.resolve(this.conta);
  }
  override buscarCredencialLocalPorEmail(): Promise<CredencialLocal | undefined> {
    return Promise.resolve(this.credencial);
  }
  override registrarLogin(): Promise<void> {
    return Promise.resolve();
  }
  override regravarCredencial(): Promise<void> {
    return Promise.resolve();
  }
  override invalidarTokensPendentes(): Promise<number> {
    return Promise.resolve(0);
  }

  expurgarConta(): Promise<boolean> {
    throw new Error('expurgarConta: nenhum caso deste arquivo deveria chegar aqui');
  }

  override cancelarTrocaDeEmailPendente(): Promise<void> {
    return Promise.resolve();
  }
}

/** O cadastro de aparelhos como uma TABELA de mentira, e não um espião. */
class CadastroDeAparelhosDeMentira {
  private readonly linhas = new Map<string, { dono: UserId; pushToken: string }>();

  registrar(id: string, dono: UserId, pushToken: string): void {
    this.linhas.set(id, { dono, pushToken });
  }

  /** O que a composição injeta em `removerPushDaConta`. */
  removerPushDaConta = (dono: UserId): Promise<number> => {
    const alvos = [...this.linhas.entries()].filter(([, linha]) => linha.dono === dono);
    for (const [id] of alvos) this.linhas.delete(id);
    return Promise.resolve(alvos.length);
  };

  /** A leitura que decide os casos: a linha ainda está lá? */
  continuariaRecebendo(id: string): boolean {
    return this.linhas.has(id);
  }

  get quantidade(): number {
    return this.linhas.size;
  }
}

/** O texto da reprovação diz o RISCO, e não o número. */
const AINDA_RECEBE =
  'o aparelho continuaria recebendo alerta de pet perdido. A sessão caiu e a linha de ' +
  '`user_devices` ficou, com `push_token` e `push_permission = granted` intactos: quem ' +
  'está com o telefone levado segue recebendo nome do animal e região de quem acabou de ' +
  'tentar se proteger. É o SEC-019.';

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly banco: BancoDeMentira;
  readonly aparelhos: CadastroDeAparelhosDeMentira;
  readonly relogio: ReturnType<typeof relogioQueAnda>;
  readonly eventos: AuditEvent[];
  readonly mensagens: Mensagem[];
}

/**
 * `pushQuebrado` existe para UM caso: o que prova que a falha do passo 3 propaga
 * em vez de virar sucesso silencioso.
 */
async function montar(opcoes: { pushQuebrado?: boolean } = {}): Promise<Bancada> {
  const relogio = relogioQueAnda();
  const banco = new BancoDeMentira(await gerarHashDeSenha(SENHA));
  const aparelhos = new CadastroDeAparelhosDeMentira();
  const eventos: AuditEvent[] = [];
  const mensagens: Mensagem[] = [];

  /**
   * O assinador guarda o `iat` que emitiu e o devolve na verificação, com o mesmo
   * `Math.floor` do emissor real.
   */
  const claimsPorToken = new Map<string, ClaimsDoAcesso>();
  const assinador: TokenSigner = {
    emitir(sub: UserId, agora: Instant, jti: string) {
      const iat = Math.floor(agora / 1000);
      const token = `jwt-${jti}`;
      claimsPorToken.set(token, {
        sub,
        iss: 'https://teste',
        aud: 'bichu',
        iat,
        exp: iat + 900,
        jti,
      });
      return { token, expiresInSeconds: 900, issuedAt: iat, jti };
    },
    verificar(token: string, agora: Instant) {
      const claims = claimsPorToken.get(token);
      if (claims === undefined) return { ok: false as const, motivo: 'malformado' as const };
      if (claims.exp * 1000 <= agora) return { ok: false as const, motivo: 'expirado' as const };
      return { ok: true as const, claims };
    },
    jwks: () => [],
  };

  const servico = criarAuthService({
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
    apagarLocalizacaoDaSessao: () => Promise.resolve(0),
    repositorio: banco,
    assinador,
    trilha: {
      record(evento) {
        eventos.push(evento);
        return Promise.resolve();
      },
    } satisfies AuditLog,
    ids: geradorSequencial(),
    clock: relogio,
    janelas: {
      idleTtlSeconds: 30 * 24 * 3600,
      staySignedInIdleTtlSeconds: 180 * 24 * 3600,
      absoluteTtlSeconds: 180 * 24 * 3600,
    },
    hmacDeIp: () => null,
    avisarTitular: () => Promise.resolve(),
    mailer: {
      enviar(mensagem) {
        mensagens.push(mensagem);
        return Promise.resolve();
      },
    } satisfies Mailer,
    registrarOcorrencia: () => undefined,
    removerPushDaConta:
      opcoes.pushQuebrado === true
        ? () => Promise.reject(new Error('o cadastro de aparelhos recusou a remoção'))
        : aparelhos.removerPushDaConta,
    baseDaWeb: 'https://bichu.test' as AbsoluteUrl,
  });

  return { servico, banco, aparelhos, relogio, eventos, mensagens };
}

/** Dois aparelhos no cadastro de push: o que foi levado e o que ficou. */
const APARELHO_ROUBADO = 'aparelho-roubado';
const APARELHO_DE_CASA = 'aparelho-de-casa';

function comDoisAparelhosNoPush(b: Bancada): void {
  b.aparelhos.registrar(APARELHO_ROUBADO, TUTORA, 'fcm-do-telefone-levado');
  b.aparelhos.registrar(APARELHO_DE_CASA, TUTORA, 'fcm-do-tablet-de-casa');
}

/** Entra de verdade, pelo caminho da senha. */
async function entrarNoAparelho(b: Bancada): Promise<{ acesso: string; refresh: string }> {
  const sessao = await b.servico.entrar(
    { email: EMAIL, password: SENHA, staySignedIn: false },
    CONTEXTO,
  );
  return { acesso: sessao.access_token, refresh: sessao.refresh_token };
}

async function autenticado(b: Bancada, acesso: string): Promise<Autenticado> {
  return b.servico.autenticar(acesso);
}

async function recusa(acao: () => Promise<unknown>): Promise<AppError> {
  const erro = await acao().then(
    () => undefined,
    (e: unknown) => e,
  );
  assert.ok(erro instanceof AppError, 'a chamada deveria ter sido recusada, e foi ACEITA');
  return erro;
}

void describe('sair de todos os aparelhos (BICHUS-125, gatilho 1)', () => {
  void it('dois aparelhos: um pede para sair de todos, e o refresh do OUTRO para de funcionar', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);
    const aparelhoB = await entrarNoAparelho(b);

    assert.equal(b.banco.vivas.length, 2, 'os dois aparelhos precisam ter sessão viva');
    const familias = new Set(b.banco.vivas.map((l) => l.familyId));
    assert.equal(familias.size, 2, 'cada aparelho abre a própria família');

    b.relogio.avancar(1000);
    await b.servico.renovar(aparelhoB.refresh, CONTEXTO);
    const refreshVivoDoB = b.banco.vivas.find((l) => l.userId === TUTORA && l.revokedAt === null);
    assert.ok(refreshVivoDoB !== undefined);

    b.relogio.avancar(1000);
    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    b.relogio.avancar(1000);
    const refreshAtualDoB = b.banco.linhas.find(
      (l) => l.id === refreshVivoDoB.id,
    );
    assert.ok(refreshAtualDoB !== undefined);
    assert.equal(
      b.banco.vivas.length,
      0,
      'sobrou refresh vivo depois do "sair de todos": a revogação em massa não aconteceu',
    );
  });

  void it('o refresh do outro aparelho é RECUSADO na renovação', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);
    const aparelhoB = await entrarNoAparelho(b);

    b.relogio.avancar(1000);
    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    b.relogio.avancar(1000);
    const erro = await recusa(() => b.servico.renovar(aparelhoB.refresh, CONTEXTO));
    assert.equal(erro.problemType, 'token-expired');
  });

  void it('a barreira também é empurrada: o token de ACESSO do outro aparelho cai', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);
    const aparelhoB = await entrarNoAparelho(b);

    await autenticado(b, aparelhoB.acesso);

    b.relogio.avancar(1000);
    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    const erro = await recusa(() => b.servico.autenticar(aparelhoB.acesso));
    assert.equal(erro.problemType, 'token-expired');
  });

  void it('CONTRAPESO: um refresh emitido DEPOIS do "sair de todos" continua valendo', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);

    b.relogio.avancar(1000);
    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    b.relogio.avancar(2000);
    const novaSessao = await entrarNoAparelho(b);
    b.relogio.avancar(1000);
    const renovada = await b.servico.renovar(novaSessao.refresh, CONTEXTO);
    assert.ok(renovada.access_token.length > 0);
    await b.servico.autenticar(renovada.access_token);
  });

  void it('a trilha grava o pedido, com o motivo e quantas famílias caíram', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);
    await entrarNoAparelho(b);

    b.relogio.avancar(1000);
    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    const evento = b.eventos.find((e) => e.action === 'auth.sessions_revoked');
    assert.ok(evento !== undefined, 'o gatilho não entrou na auditoria');
    assert.equal(evento.resourceId, TUTORA);
    assert.deepEqual(evento.metadata, {
      reason: 'logout_all',
      revoked_families: 2,
      devices_removed: 0,
    });
  });

  void it('o motivo gravado é `logout_all`, e NÃO `logout`: os dois verbos não se confundem', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);

    b.relogio.avancar(1000);
    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    const motivos = new Set(b.banco.linhas.map((l) => l.revokedReason));
    assert.ok(motivos.has('logout_all'));
    assert.ok(
      !motivos.has('logout'),
      'gravar `logout` aqui apagaria da trilha a diferença entre sair de um aparelho e derrubar a conta',
    );
  });

  void it('o titular é avisado por e-mail: se não foi ele, é a única chance de descobrir hoje', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);

    b.relogio.avancar(1000);
    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    const aviso = b.mensagens.find((m) => m.para === EMAIL);
    assert.ok(aviso !== undefined, 'nenhum aviso saiu para o endereço da conta');
    assert.match(aviso.corpo, /todos os aparelhos/i);
  });

  void it('é idempotente: chamado duas vezes, a segunda revoga zero e não erra', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);
    const eu = await autenticado(b, aparelhoA.acesso);

    await b.servico.sairDeTodosOsAparelhos(eu, CONTEXTO);
    const primeiraRevogacao = b.banco.linhas[0]?.revokedAt;

    b.relogio.avancar(5000);
    await b.servico.sairDeTodosOsAparelhos(eu, CONTEXTO);

    const eventos = b.eventos.filter((e) => e.action === 'auth.sessions_revoked');
    assert.equal(eventos.length, 2, 'o evento é do PEDIDO, e os dois pedidos aconteceram');
    assert.deepEqual(eventos[1]?.metadata, {
      reason: 'logout_all',
      revoked_families: 0,
      devices_removed: 0,
    });
    assert.deepEqual(
      b.banco.linhas[0]?.revokedAt,
      primeiraRevogacao,
      'a segunda chamada reescreveu a hora da primeira: `revoked_at IS NULL` não está na cláusula',
    );
  });
});

void describe('troca de senha (BICHUS-125, gatilho 2)', () => {
  void it('derruba as sessões dos OUTROS aparelhos, não só a barreira', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);
    const aparelhoB = await entrarNoAparelho(b);

    b.relogio.avancar(1000);
    await b.servico.trocarSenha(
      await autenticado(b, aparelhoA.acesso),
      SENHA,
      'vento-frio-na-varanda-42',
      CONTEXTO,
    );

    assert.equal(b.banco.vivas.length, 0, 'sobrou refresh vivo depois da troca de senha');
    b.relogio.avancar(1000);
    const erro = await recusa(() => b.servico.renovar(aparelhoB.refresh, CONTEXTO));
    assert.equal(erro.problemType, 'token-expired');
  });

  void it('senha atual errada é recusada, e NÃO chega a revogar nada', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);

    b.relogio.avancar(1000);
    const eu = await autenticado(b, aparelhoA.acesso);
    const erro = await recusa(() =>
      b.servico.trocarSenha(
        eu,
        'a-senha-errada-de-quem-tomou-a-conta',
        'vento-frio-na-varanda-42',
        CONTEXTO,
      ),
    );
    assert.equal(erro.problemType, 'invalid-credentials');
    assert.equal(
      b.banco.vivas.length,
      1,
      'a recusa revogou sessão: quem só tem o token de acesso derrubaria o titular sem saber a senha',
    );
  });

  void it('a senha nova fraca é recusada DEPOIS da atual: a política não vaza para quem não provou nada', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);
    const eu = await autenticado(b, aparelhoA.acesso);

    const erro = await recusa(() => b.servico.trocarSenha(eu, 'errada', '123', CONTEXTO));
    assert.equal(
      erro.problemType,
      'invalid-credentials',
      'respondeu sobre a senha NOVA a quem não provou saber a atual',
    );
  });

  void it('a trilha registra a recusa, que é o sinal mais útil que existe', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);

    const eu = await autenticado(b, aparelhoA.acesso);
    await recusa(() =>
      b.servico.trocarSenha(eu, 'errada', 'vento-frio-na-varanda-42', CONTEXTO),
    );
    assert.ok(b.eventos.some((e) => e.action === 'auth.password_change_refused'));
  });
});

void describe('redefinição de senha (BICHUS-125): a barreira era metade do trabalho', () => {
  void it('a revogação em massa passa a ser a MESMA dos outros gatilhos', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);

    await b.servico.invalidarTodasAsSessoes(TUTORA, 'password_changed', CONTEXTO);

    assert.equal(b.banco.vivas.length, 0);
    b.relogio.avancar(1000);
    const erro = await recusa(() => b.servico.renovar(aparelhoA.refresh, CONTEXTO));
    assert.equal(erro.problemType, 'token-expired');
  });
});

/** O SEC-019: os caminhos de revogação em massa apagam o cadastro de push. */
void describe('SEC-019: revogar sessão apaga o endereço de entrega do push', () => {
  void it('"sair de todos os aparelhos" tira o aparelho ROUBADO do cadastro de push', async () => {
    const b = await montar();
    comDoisAparelhosNoPush(b);
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);

    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    assert.equal(b.aparelhos.continuariaRecebendo(APARELHO_ROUBADO), false, AINDA_RECEBE);
  });

  void it('o aparelho de QUEM PEDIU cai junto, e isso é a decisão e não um efeito colateral', async () => {
    const b = await montar();
    comDoisAparelhosNoPush(b);
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);

    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    assert.equal(
      b.aparelhos.quantidade,
      0,
      'sobrou aparelho no cadastro de push depois de "sair de todos". A pessoa pediu TODOS, ' +
        'e poupar um exige um vínculo que `user_devices` não tem.',
    );
  });

  void it('a troca de senha também apaga: os seis caminhos herdam o mesmo conserto', async () => {
    const b = await montar();
    comDoisAparelhosNoPush(b);
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);

    await b.servico.trocarSenha(
      await autenticado(b, aparelhoA.acesso),
      SENHA,
      'vento-frio-na-varanda-42',
      CONTEXTO,
    );

    assert.equal(b.aparelhos.continuariaRecebendo(APARELHO_ROUBADO), false, AINDA_RECEBE);
  });

  void it('`invalidarTodasAsSessoes`, a porta pública, herda pelo mesmo lugar', async () => {
    const b = await montar();
    comDoisAparelhosNoPush(b);
    await entrarNoAparelho(b);
    b.relogio.avancar(1000);

    await b.servico.invalidarTodasAsSessoes(TUTORA, 'password_changed', CONTEXTO);

    assert.equal(b.aparelhos.continuariaRecebendo(APARELHO_ROUBADO), false, AINDA_RECEBE);
  });

  void it('a trilha conta os aparelhos que saíram, junto das famílias', async () => {
    const b = await montar();
    comDoisAparelhosNoPush(b);
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);

    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    const evento = [...b.eventos]
      .reverse()
      .find((e: AuditEvent) => e.action === 'auth.sessions_revoked');
    assert.ok(evento !== undefined, 'a revogação em massa não gravou `auth.sessions_revoked`');
    assert.equal(evento.metadata?.['devices_removed'], 2);
  });

  void it('conta SEM aparelho registrado não vira falha: zero é sucesso', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);

    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    const evento = [...b.eventos]
      .reverse()
      .find((e: AuditEvent) => e.action === 'auth.sessions_revoked');
    assert.equal(evento?.metadata?.['devices_removed'], 0);
  });

  void it('a falha ao remover o push PROPAGA: não há sucesso com push vivo', async () => {
    const b = await montar({ pushQuebrado: true });
    comDoisAparelhosNoPush(b);
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);

    const erro = await b.servico
      .sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO)
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    assert.ok(
      erro !== undefined,
      'o cadastro de push recusou a remoção e a operação respondeu SUCESSO. Quem pediu ' +
        'acredita que resolveu, e o aparelho roubado continua recebendo.',
    );
  });
});
