import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import { hashDeToken } from '../../../shared/crypto/digest.js';
import { AppError } from '../../../shared/http/errors.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { comoIso, type Clock } from '../../../shared/time/clock.js';
import { dataFixa, INSTANTE_FIXO } from '../../../shared/time/relogio-de-teste.js';
import type {
  AbsoluteUrl,
  Instant,
  OpaqueToken,
  TokenHash,
  UserId,
} from '../../../shared/types/brands.js';
import type {
  ConsequenciasDaExclusao,
  Conta,
  FotoDoPerfil,
  MotivoDeRevogacao,
  NovoTokenDeVerificacao,
  PropositoDoToken,
  TokenConsumido,
} from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { TokenSigner } from '../ports/token-signer.js';
import type { Autenticado } from './auth-service.js';
import { criarAuthService, PRAZO_DE_EXPURGO_EM_MS } from './auth-service.js';
import type { ContextoDaRequisicao } from './dependencies.js';
import { RepositorioQueRecusaTudo } from '../adapters/persistence/repositorio-que-recusa-tudo-de-teste.js';

const TUTORA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const EMAIL = 'tutora@exemplo.test';
const LINK_EM_CLARO = 'tokenDoNaoFuiEuComTrintaEDoisBytes';

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: 'corr-215',
  ip: '203.0.113.7',
  userAgent: 'Bichu/1.0 (iPhone)',
};

function hashDe(valor: string): TokenHash {
  return hashDeToken(valor) as TokenHash;
}

function contaViva(): Conta {
  return {
    id: TUTORA,
    email: EMAIL,
    emailVerifiedAt: dataFixa(),
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
    createdAt: dataFixa(),
  };
}

class BancoCaiu extends Error {
  constructor(public readonly onde: string) {
    super(`banco indisponível em ${onde}`);
    this.name = 'BancoCaiu';
  }
}

interface LinhaDeRefresh {
  familyId: string;
  revokedAt: Instant | null;
  revokedReason: MotivoDeRevogacao | null;
}

interface LinhaDeToken {
  hash: TokenHash;
  proposito: PropositoDoToken;
  enviadoPara: string;
  expiraEm: Instant;
  consumidoEm: Instant | null;
}

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

  override contasAExpurgar(): never {
    throw new Error('contasAExpurgar: é do worker, não do serviço');
  }

  public conta: Conta = contaViva();
  public readonly refresh: LinhaDeRefresh[] = [
    { familyId: 'fam-celular', revokedAt: null, revokedReason: null },
    { familyId: 'fam-tablet', revokedAt: null, revokedReason: null },
  ];
  public readonly tokens: LinhaDeToken[] = [];
  public marcada: { status: string; deletedAt: Instant } | undefined;
  public tokensInvalidados = 0;
  public quebrar: string | undefined;

  private conferirInterruptor(onde: string): void {
    if (this.quebrar === onde) throw new BancoCaiu(onde);
  }

  override buscarContaPorId(id: UserId): Promise<Conta | undefined> {
    return Promise.resolve(id === TUTORA ? this.conta : undefined);
  }

  override revogarTodasAsFamilias(
    userId: UserId,
    motivo: MotivoDeRevogacao,
    agora: Instant,
  ): Promise<number> {
    this.conferirInterruptor('revogarTodasAsFamilias');
    let caidas = 0;
    for (const linha of this.refresh) {
      if (userId === TUTORA && linha.revokedAt === null) {
        linha.revokedAt = agora;
        linha.revokedReason = motivo;
        caidas += 1;
      }
    }
    return Promise.resolve(caidas);
  }

  override invalidarSessoes(userId: UserId, barreira: Instant): Promise<void> {
    this.conferirInterruptor('invalidarSessoes');
    if (userId !== TUTORA) return Promise.resolve();
    this.conta = {
      ...this.conta,
      sessionsInvalidBefore: Math.max(barreira, this.conta.sessionsInvalidBefore) as Instant,
    };
    return Promise.resolve();
  }

  override registrarPedidoDeExclusao(
    userId: UserId,
    agora: Instant,
  ): Promise<ConsequenciasDaExclusao | undefined> {
    this.conferirInterruptor('registrarPedidoDeExclusao');
    if (userId !== TUTORA || this.marcada !== undefined) return Promise.resolve(undefined);
    this.marcada = { status: 'deletion_requested', deletedAt: agora };
    this.conta = { ...this.conta, status: 'deletion_requested' };
    return Promise.resolve({ tagsRevogadas: 3 });
  }

  override criarTokenDeVerificacao(novo: NovoTokenDeVerificacao): Promise<void> {
    this.tokens.push({
      hash: novo.tokenHash,
      proposito: novo.proposito,
      enviadoPara: novo.enviadoPara,
      expiraEm: novo.expiraEm,
      consumidoEm: null,
    });
    return Promise.resolve();
  }

  override conferirTokenDeVerificacao(
    hash: TokenHash,
    proposito: PropositoDoToken,
    agora: Instant,
  ): Promise<TokenConsumido | undefined> {
    const linha = this.tokens.find(
      (t) =>
        t.hash.equals(hash) &&
        t.proposito === proposito &&
        t.consumidoEm === null &&
        t.expiraEm > agora,
    );
    return Promise.resolve(
      linha === undefined ? undefined : { userId: TUTORA, enviadoPara: linha.enviadoPara },
    );
  }

  override consumirTokenDeVerificacao(
    hash: TokenHash,
    proposito: PropositoDoToken,
    agora: Instant,
  ): Promise<TokenConsumido | undefined> {
    const linha = this.tokens.find(
      (t) =>
        t.hash.equals(hash) &&
        t.proposito === proposito &&
        t.consumidoEm === null &&
        t.expiraEm > agora,
    );
    if (linha === undefined) return Promise.resolve(undefined);
    linha.consumidoEm = agora;
    return Promise.resolve({ userId: TUTORA, enviadoPara: linha.enviadoPara });
  }

  override invalidarTokensPendentes(userId: UserId, agora: Instant): Promise<number> {
    this.tokensInvalidados += 1;
    let n = 0;
    if (userId === TUTORA) {
      for (const t of this.tokens) {
        if (t.consumidoEm === null) {
          t.consumidoEm = agora;
          n += 1;
        }
      }
    }
    return Promise.resolve(n);
  }
  buscarCredencialLocalPorUsuario(): never {
    throw new Error('buscarCredencialLocalPorUsuario: nenhum caso deste arquivo deveria chegar');
  }
  expurgarConta(): never {
    throw new Error('expurgarConta: é do worker, não do serviço');
  }
}

interface CadastroDePushDeMentira {
  readonly linhas: Set<string>;
  readonly removerPushDaConta: () => Promise<number>;
}

function cadastroDePush(): CadastroDePushDeMentira {
  const linhas = new Set<string>(['aparelho-levado', 'aparelho-de-casa']);
  return {
    linhas,
    removerPushDaConta: () => {
      const quantas = linhas.size;
      linhas.clear();
      return Promise.resolve(quantas);
    },
  };
}

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly repo: BancoDeMentira;
  readonly push: CadastroDePushDeMentira;
  readonly mensagens: Mensagem[];
  readonly eventos: AuditEvent[];
  readonly registros: { dados: Record<string, unknown>; mensagem: string }[];
  derrubarOMailer: () => void;
}

function montar(): Bancada {
  const repo = new BancoDeMentira();
  const push = cadastroDePush();
  const mensagens: Mensagem[] = [];
  const eventos: AuditEvent[] = [];
  const registros: { dados: Record<string, unknown>; mensagem: string }[] = [];
  let mailerCaido = false;

  const mailer: Mailer = {
    enviar(mensagem) {
      if (mailerCaido) return Promise.reject(new Error('SMTP fora do ar'));
      mensagens.push(mensagem);
      return Promise.resolve();
    },
  };

  const trilha: AuditLog = {
    record(evento) {
      eventos.push(evento);
      return Promise.resolve();
    },
  };

  const clock: Clock = { now: () => INSTANTE_FIXO };

  const ids: IdGenerator = {
    uuidv7: () => 'id-0001',
    opaqueToken: () => 'tok-0001' as OpaqueToken,
    random128: () => new Uint8Array(16),
    random80: () => new Uint8Array(10),
  };

  const assinador: TokenSigner = {
    emitir: () => ({ token: 'acesso', expiresInSeconds: 900, expiresAt: INSTANTE_FIXO }),
    verificar: () => ({ ok: false, motivo: 'invalido' }),
    jwks: () => ({ keys: [] }),
  } as unknown as TokenSigner;

  const servico = criarAuthService({
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
    apagarLocalizacaoDaSessao: () => Promise.resolve(0),
    repositorio: repo,
    assinador,
    trilha,
    ids,
    clock,
    janelas: {
      idleTtlSeconds: 30 * 24 * 60 * 60,
      staySignedInIdleTtlSeconds: 180 * 24 * 60 * 60,
      absoluteTtlSeconds: 180 * 24 * 60 * 60,
    },
    hmacDeIp: () => null,
    avisarTitular: () => Promise.resolve(),
    mailer,
    registrarOcorrencia: (dados, mensagem) => {
      registros.push({ dados, mensagem });
    },
    removerPushDaConta: push.removerPushDaConta,
    baseDaWeb: 'https://bichu.exemplo.invalid' as AbsoluteUrl,
  });

  return {
    servico,
    repo,
    push,
    mensagens,
    eventos,
    registros,
    derrubarOMailer: () => {
      mailerCaido = true;
    },
  };
}

function autenticada(repo: BancoDeMentira): Autenticado {
  return { conta: repo.conta, jti: 'jti-1' };
}

async function capturar(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
    return undefined;
  } catch (erro: unknown) {
    return erro;
  }
}

function darUmLinkValido(repo: BancoDeMentira): void {
  repo.tokens.push({
    hash: hashDe(LINK_EM_CLARO),
    proposito: 'session_disavow',
    enviadoPara: EMAIL,
    expiraEm: (INSTANTE_FIXO + 7 * 24 * 60 * 60 * 1000) as Instant,
    consumidoEm: null,
  });
}

void describe('exclusão de conta (BICHUS-215, critério 3 — gatilho 3 do SEC-006)', () => {
  void it('derruba TODAS as famílias com `account_deleted`, que é o produtor que faltava', async () => {
    const bancada = montar();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    assert.deepEqual(
      bancada.repo.refresh.map((l) => l.revokedReason),
      ['account_deleted', 'account_deleted'],
    );
  });

  void it('empurra a barreira: o token de acesso já emitido morre em menos de 1 s (SEC-006)', async () => {
    const bancada = montar();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    assert.ok(
      bancada.repo.conta.sessionsInvalidBefore >= INSTANTE_FIXO,
      'a barreira não foi empurrada; o JWT já emitido sobrevive até o exp',
    );
  });

  void it('marca a conta como excluída, e NÃO apaga linha nenhuma', async () => {
    const bancada = montar();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    assert.deepEqual(bancada.repo.marcada, {
      status: 'deletion_requested',
      deletedAt: INSTANTE_FIXO,
    });
  });

  void it('ISCA DA ORDEM: revogação que falha não deixa conta marcada com sessão viva', async () => {
    const bancada = montar();
    bancada.repo.quebrar = 'revogarTodasAsFamilias';

    const erro = await capturar(
      bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO),
    );

    assert.ok(erro instanceof BancoCaiu, 'a falha da revogação precisa subir, não ser engolida');
    assert.equal(bancada.repo.marcada, undefined);
    assert.deepEqual(
      bancada.repo.refresh.map((l) => l.revokedAt),
      [null, null],
    );
  });

  void it('invalida token pendente: o link de redefinição é a porta de volta', async () => {
    const bancada = montar();
    darUmLinkValido(bancada.repo);

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    assert.equal(bancada.repo.tokens[0]?.consumidoEm, INSTANTE_FIXO);
  });

  void it('grava a trilha sem e-mail, sem nome e sem coordenada', async () => {
    const bancada = montar();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    const pedido = bancada.eventos.find((e) => e.action === 'privacy.account_deletion_requested');
    assert.ok(pedido !== undefined, 'sem este evento o prazo de 30 dias não é verificável');
    assert.deepEqual(pedido.metadata, {
      tags_revoked: 3,
      already_requested: false,
      purge_after: comoIso((INSTANTE_FIXO + PRAZO_DE_EXPURGO_EM_MS) as Instant),
    });
    assert.ok(!JSON.stringify(pedido).includes(EMAIL));
  });

  void it('avisa por e-mail, e o aviso diz que as tags pararam de responder', async () => {
    const bancada = montar();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    assert.equal(bancada.mensagens.length, 1);
    const mensagem = bancada.mensagens[0]!;
    assert.equal(mensagem.para, EMAIL);
    assert.match(mensagem.corpo, /plaquinhas/i);
    assert.doesNotMatch(mensagem.corpo, /30 dias/);
    assert.match(mensagem.corpo, /guardados e inacessiveis/i);
    assert.match(mensagem.corpo, /apagamento definitivo/i);
    assert.match(mensagem.corpo, /se nao foi voce/i);
  });

  void it('ISCA DO AVISO: mailer que estoura não desfaz nem esconde a exclusão', async () => {
    const bancada = montar();
    bancada.derrubarOMailer();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    assert.notEqual(bancada.repo.marcada, undefined);
    assert.deepEqual(
      bancada.repo.refresh.map((l) => l.revokedReason),
      ['account_deleted', 'account_deleted'],
    );
    const falha = bancada.registros.find((r) => r.dados['enviado'] === false);
    assert.ok(falha !== undefined, 'o não envio precisa deixar rastro');
    assert.equal(falha.dados['evento'], 'account.deletion_requested');
  });

  void it('idempotente: pedir de novo não estoura e a trilha registra que já havia pedido', async () => {
    const bancada = montar();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);
    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    const pedidos = bancada.eventos.filter(
      (e) => e.action === 'privacy.account_deletion_requested',
    );
    assert.equal(pedidos.length, 2, 'o evento é do PEDIDO, não do efeito');
    assert.equal(pedidos[1]?.metadata?.['already_requested'], true);
    assert.equal(bancada.repo.marcada?.deletedAt, INSTANTE_FIXO);
  });
});

void describe('"Não fui eu" (BICHUS-215, critério 4 — gatilho 4 do SEC-006)', () => {
  void it('derruba todas as sessões com `not_me`, SEM senha e SEM conta', async () => {
    const bancada = montar();
    darUmLinkValido(bancada.repo);

    await bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO);

    assert.deepEqual(
      bancada.repo.refresh.map((l) => l.revokedReason),
      ['not_me', 'not_me'],
    );
    assert.ok(bancada.repo.conta.sessionsInvalidBefore >= INSTANTE_FIXO);
  });

  void it('`not_me` e não `logout_all`: a trilha precisa distinguir os dois verbos', async () => {
    const bancada = montar();
    darUmLinkValido(bancada.repo);

    await bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO);

    const revogacao = bancada.eventos.find((e) => e.action === 'auth.sessions_revoked');
    assert.equal(revogacao?.metadata?.['reason'], 'not_me');
  });

  void it('registra a PROVENIÊNCIA: quem agiu provou a caixa de entrada, não a titularidade', async () => {
    const bancada = montar();
    darUmLinkValido(bancada.repo);

    await bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO);

    const gesto = bancada.eventos.find((e) => e.action === 'auth.session_disavowed');
    assert.ok(gesto !== undefined, 'sem este evento a revogação parece ter vindo de dentro');
    assert.equal(gesto.actorKind, 'anonymous');
    assert.equal(gesto.resourceId, TUTORA);
  });

  void it('consome o link: a segunda tentativa responde 410', async () => {
    const bancada = montar();
    darUmLinkValido(bancada.repo);

    await bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO);
    const erro = await capturar(bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO));

    assert.ok(erro instanceof AppError);
    assert.equal(erro.status, 410);
  });

  void it('ISCA DA ORDEM: revogação que falha NÃO queima o link', async () => {
    const bancada = montar();
    darUmLinkValido(bancada.repo);
    bancada.repo.quebrar = 'revogarTodasAsFamilias';

    const erro = await capturar(bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO));

    assert.ok(erro instanceof BancoCaiu);
    assert.equal(bancada.repo.tokens[0]?.consumidoEm, null, 'o link precisa continuar valendo');
  });

  void it('link inexistente, vencido e já usado respondem a MESMA coisa', async () => {
    const inexistente = montar();
    const vencido = montar();
    vencido.repo.tokens.push({
      hash: hashDe(LINK_EM_CLARO),
      proposito: 'session_disavow',
      enviadoPara: EMAIL,
      expiraEm: (INSTANTE_FIXO - 1) as Instant,
      consumidoEm: null,
    });

    const a = await capturar(inexistente.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO));
    const b = await capturar(vencido.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO));

    assert.ok(a instanceof AppError);
    assert.ok(b instanceof AppError);
    assert.equal(a.status, 410);
    assert.equal(b.status, 410);
    assert.equal(a.problemType, b.problemType);
    assert.deepEqual(
      vencido.repo.refresh.map((l) => l.revokedAt),
      [null, null],
    );
  });

  void it('um link de OUTRO propósito não serve: redefinição não derruba sessão', async () => {
    const bancada = montar();
    bancada.repo.tokens.push({
      hash: hashDe(LINK_EM_CLARO),
      proposito: 'password_reset',
      enviadoPara: EMAIL,
      expiraEm: (INSTANTE_FIXO + 60_000) as Instant,
      consumidoEm: null,
    });

    const erro = await capturar(bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO));

    assert.ok(erro instanceof AppError);
    assert.equal(erro.status, 410);
  });

  void it('NÃO troca a senha, e convida a trocar pelo fluxo que exige a caixa de entrada', async () => {
    const bancada = montar();
    darUmLinkValido(bancada.repo);

    await bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO);

    assert.equal(bancada.mensagens.length, 1);
    assert.match(bancada.mensagens[0]!.corpo, /escolha uma senha nova/i);
    assert.match(bancada.mensagens[0]!.corpo, /esqueci minha senha/i);
  });

  void it('ISCA DO AVISO: mailer que estoura não desfaz a revogação', async () => {
    const bancada = montar();
    darUmLinkValido(bancada.repo);
    bancada.derrubarOMailer();

    await bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO);

    assert.deepEqual(
      bancada.repo.refresh.map((l) => l.revokedReason),
      ['not_me', 'not_me'],
    );
    const falha = bancada.registros.find((r) => r.dados['enviado'] === false);
    assert.equal(falha?.dados['evento'], 'session.disavowed');
  });
});

const AINDA_RECEBE_APOS =
  'o aparelho continuaria recebendo alerta de pet perdido: a sessão caiu e a linha de ' +
  '`user_devices` ficou, com o token e a permissão intactos. É o SEC-019.';

const APAGOU_O_QUE_DEVIA_RETER =
  'a exclusão de conta APAGOU a linha de `user_devices`. Desde 17/10 nada é apagado: a ' +
  'conta é desabilitada e o aparelho para de receber pela cláusula `u.deleted_at IS NULL` ' +
  'da consulta de alcance, não por ausência de linha.';

void describe('SEC-019 depois de 17/10: "não fui eu" apaga o push, a exclusão retém', () => {
  void it('ISCA: a exclusão da conta NÃO apaga `user_devices` -- a conta é desabilitada', async () => {
    const bancada = montar();
    const antes = bancada.push.linhas.size;
    assert.ok(antes > 0, 'a bancada precisa começar com aparelho, senão o caso não mede nada');

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    assert.equal(bancada.push.linhas.size, antes, APAGOU_O_QUE_DEVIA_RETER);
  });

  void it('"não fui eu" tira os aparelhos do push', async () => {
    const bancada = montar();
    darUmLinkValido(bancada.repo);

    await bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO);
    assert.equal(bancada.push.linhas.size, 0, AINDA_RECEBE_APOS);
  });
});
