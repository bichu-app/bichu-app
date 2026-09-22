/**
 * Os gatilhos 3 e 4 do SEC-006, provados pela ORDEM e pelo EFEITO.
 *
 * ## Por que um arquivo próprio, e por que o dublê se comporta como banco
 *
 * A lição que a BICHUS-215 registra é que `invalidarTodasAsSessoes` sobreviveu
 * meses sem chamador nenhum, e nenhuma suíte reclamou. Um caso que afirmasse
 * "`revogarTodasAsFamilias` foi chamada" fica verde com a função morta. Então o
 * repositório daqui guarda estado: linhas de refresh com `revoked_at`,
 * `sessions_invalid_before` na conta, `consumed_at` no token de verificação — e
 * o que se afirma é o que a pessoa observa.
 *
 * ## As três coisas que este arquivo existe para provar, e que nenhuma outra
 *
 * 1. **A ordem da exclusão.** Revogação antes da marcação, porque o cenário (1)
 *    do SEC-006 é "a pessoa exclui a conta e o atacante continua lendo por 15
 *    minutos". O caso desliga a revogação (falha simulada no repositório) e
 *    exige que a conta **não** fique marcada: o estado "excluída com sessão
 *    viva" não pode existir.
 * 2. **A ordem do "Não fui eu".** O token é consumido DEPOIS da revogação. O
 *    caso faz a revogação falhar e exige que o link continue válido — gastá-lo
 *    antes queimaria o único remédio de quem não consegue pedir outro, porque
 *    quem dispara o aviso é o invasor.
 * 3. **O e-mail não derruba o efeito.** Mailer que estoura, e o banco continua
 *    com tudo feito. Medido em 22/09 na forma irmã: o aviso vinha depois da
 *    revogação, a revogação abortava, e quem perdeu o aparelho ficava sem o
 *    remédio **e** sem o aviso.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
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
  IdentityRepository,
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

const TUTORA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const EMAIL = 'tutora@exemplo.test';
const LINK_EM_CLARO = 'tokenDoNaoFuiEuComTrintaEDoisBytes';

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: 'corr-215',
  ip: '203.0.113.7',
  userAgent: 'Bichu/1.0 (iPhone)',
};

function hashDe(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('base64');
}

function contaViva(): Conta {
  return {
    id: TUTORA,
    email: EMAIL,
    emailVerifiedAt: dataFixa(),
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
    createdAt: dataFixa(),
  };
}

/** Sinal de falha do banco, para as iscas de ordem. Nunca sai deste arquivo. */
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
  hash: string;
  proposito: PropositoDoToken;
  enviadoPara: string;
  expiraEm: Instant;
  consumidoEm: Instant | null;
}

/**
 * Um pedaço do banco que se comporta como o banco.
 *
 * Só o que estes casos observam: as linhas de refresh com o motivo gravado, a
 * barreira da conta, os tokens com `consumed_at`, e o estado da marcação de
 * exclusão. Tudo o mais recusa alto — método que um caso deste arquivo alcance
 * sem querer estoura nomeando, em vez de devolver `undefined` e fazer a
 * afirmação seguinte passar por acidente.
 */
class BancoDeMentira implements IdentityRepository {
  public conta: Conta = contaViva();
  public readonly refresh: LinhaDeRefresh[] = [
    { familyId: 'fam-celular', revokedAt: null, revokedReason: null },
    { familyId: 'fam-tablet', revokedAt: null, revokedReason: null },
  ];
  public readonly tokens: LinhaDeToken[] = [];
  public marcada: { status: string; deletedAt: Instant } | undefined;
  public tokensInvalidados = 0;
  /** Nome do método que deve falhar nesta rodada. É o interruptor das iscas. */
  public quebrar: string | undefined;

  private conferirInterruptor(onde: string): void {
    if (this.quebrar === onde) throw new BancoCaiu(onde);
  }

  buscarContaPorId(id: UserId): Promise<Conta | undefined> {
    return Promise.resolve(id === TUTORA ? this.conta : undefined);
  }

  revogarTodasAsFamilias(
    userId: UserId,
    motivo: MotivoDeRevogacao,
    agora: Instant,
  ): Promise<number> {
    this.conferirInterruptor('revogarTodasAsFamilias');
    let caidas = 0;
    for (const linha of this.refresh) {
      // A cláusula do banco: `WHERE user_id = $1 AND revoked_at IS NULL`. É ela
      // que torna a operação idempotente, e um `forEach` sobre tudo não seria.
      if (userId === TUTORA && linha.revokedAt === null) {
        linha.revokedAt = agora;
        linha.revokedReason = motivo;
        caidas += 1;
      }
    }
    return Promise.resolve(caidas);
  }

  invalidarSessoes(userId: UserId, barreira: Instant): Promise<void> {
    this.conferirInterruptor('invalidarSessoes');
    if (userId !== TUTORA) return Promise.resolve();
    // `GREATEST`: a coluna só anda para a frente.
    this.conta = {
      ...this.conta,
      sessionsInvalidBefore: Math.max(barreira, this.conta.sessionsInvalidBefore) as Instant,
    };
    return Promise.resolve();
  }

  registrarPedidoDeExclusao(
    userId: UserId,
    agora: Instant,
  ): Promise<ConsequenciasDaExclusao | undefined> {
    this.conferirInterruptor('registrarPedidoDeExclusao');
    if (userId !== TUTORA || this.marcada !== undefined) return Promise.resolve(undefined);
    this.marcada = { status: 'deletion_requested', deletedAt: agora };
    this.conta = { ...this.conta, status: 'deletion_requested' };
    return Promise.resolve({ tagsRevogadas: 3 });
  }

  criarTokenDeVerificacao(novo: NovoTokenDeVerificacao): Promise<void> {
    this.tokens.push({
      hash: novo.tokenHash,
      proposito: novo.proposito,
      enviadoPara: novo.enviadoPara,
      expiraEm: novo.expiraEm,
      consumidoEm: null,
    });
    return Promise.resolve();
  }

  conferirTokenDeVerificacao(
    hash: TokenHash,
    proposito: PropositoDoToken,
    agora: Instant,
  ): Promise<TokenConsumido | undefined> {
    const linha = this.tokens.find(
      (t) =>
        t.hash === (hash as string) &&
        t.proposito === proposito &&
        t.consumidoEm === null &&
        t.expiraEm > agora,
    );
    return Promise.resolve(
      linha === undefined ? undefined : { userId: TUTORA, enviadoPara: linha.enviadoPara },
    );
  }

  consumirTokenDeVerificacao(
    hash: TokenHash,
    proposito: PropositoDoToken,
    agora: Instant,
  ): Promise<TokenConsumido | undefined> {
    const linha = this.tokens.find(
      (t) =>
        t.hash === (hash as string) &&
        t.proposito === proposito &&
        t.consumidoEm === null &&
        t.expiraEm > agora,
    );
    if (linha === undefined) return Promise.resolve(undefined);
    linha.consumidoEm = agora;
    return Promise.resolve({ userId: TUTORA, enviadoPara: linha.enviadoPara });
  }

  invalidarTokensPendentes(userId: UserId, agora: Instant): Promise<number> {
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

  // O resto da porta. Recusa alto: um caso que chegue aqui está exercitando
  // outra coisa, e devolver `undefined` faria a afirmação seguinte passar por
  // acidente — que é a forma de um portão aprovar por ausência.
  criarContaLocal(): never {
    throw new Error('criarContaLocal: nenhum caso deste arquivo deveria chegar aqui');
  }
  atualizarPerfil(): never {
    throw new Error('atualizarPerfil: nenhum caso deste arquivo deveria chegar aqui');
  }
  buscarContaPorEmail(): never {
    throw new Error('buscarContaPorEmail: nenhum caso deste arquivo deveria chegar aqui');
  }
  buscarCredencialLocalPorEmail(): never {
    throw new Error('buscarCredencialLocalPorEmail: nenhum caso deste arquivo deveria chegar aqui');
  }
  buscarCredencialLocalPorUsuario(): never {
    throw new Error('buscarCredencialLocalPorUsuario: nenhum caso deste arquivo deveria chegar');
  }
  regravarCredencial(): never {
    throw new Error('regravarCredencial: nenhum caso deste arquivo deveria chegar aqui');
  }
  gravarRefresh(): never {
    throw new Error('gravarRefresh: nenhum caso deste arquivo deveria chegar aqui');
  }
  buscarRefreshPorHash(): never {
    throw new Error('buscarRefreshPorHash: nenhum caso deste arquivo deveria chegar aqui');
  }
  rotacionar(): never {
    throw new Error('rotacionar: nenhum caso deste arquivo deveria chegar aqui');
  }
  registrarLogin(): never {
    throw new Error('registrarLogin: nenhum caso deste arquivo deveria chegar aqui');
  }
  revogarFamilia(): never {
    throw new Error('revogarFamilia: nenhum caso deste arquivo deveria chegar aqui');
  }
  marcarEmailVerificado(): never {
    throw new Error('marcarEmailVerificado: nenhum caso deste arquivo deveria chegar aqui');
  }
  contasAExpurgar(): never {
    throw new Error('contasAExpurgar: é do worker, não do serviço');
  }
  expurgarConta(): never {
    throw new Error('expurgarConta: é do worker, não do serviço');
  }
}

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly repo: BancoDeMentira;
  readonly mensagens: Mensagem[];
  readonly eventos: AuditEvent[];
  readonly registros: { dados: Record<string, unknown>; mensagem: string }[];
  /** Faz o próximo `mailer.enviar` estourar. */
  derrubarOMailer: () => void;
}

function montar(): Bancada {
  const repo = new BancoDeMentira();
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
    baseDaWeb: 'https://bichu.exemplo.invalid' as AbsoluteUrl,
  });

  return {
    servico,
    repo,
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

    // O rastro que a issue registra: `account_deleted` estava no tipo e na
    // restrição do banco desde 17/09 e nunca teve quem o emitisse. Esta é a
    // afirmação que passa a exigir o produtor.
    assert.deepEqual(
      bancada.repo.refresh.map((l) => l.revokedReason),
      ['account_deleted', 'account_deleted'],
    );
  });

  void it('empurra a barreira: o token de acesso já emitido morre em menos de 1 s (SEC-006)', async () => {
    const bancada = montar();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    // Sem esta metade, o cenário (1) do SEC-006 acontece literalmente: "a
    // pessoa exclui a conta e o atacante que tomou a sessão continua lendo
    // conversas e exportando dados por mais 15 minutos".
    assert.ok(
      bancada.repo.conta.sessionsInvalidBefore >= INSTANTE_FIXO,
      'a barreira não foi empurrada; o JWT já emitido sobrevive até o exp',
    );
  });

  void it('marca a conta como excluída, e NÃO apaga linha nenhuma', async () => {
    const bancada = montar();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    // O contrato diz "exclusão lógica imediata, expurgo definitivo em 30 dias".
    // Quem apaga é o worker. Trocar isto por um `DELETE` aqui tiraria a janela
    // de socorro de quem clicou errado ou de quem teve a conta tomada.
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
    // Este é o estado que a ordem existe para impedir, e é o pior possível:
    // conta marcada como excluída, com refresh vivo dentro dela. Inverta a
    // ordem em `excluirMinhaConta` e este caso reprova.
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
    // A trilha sobrevive ao expurgo de propósito (24 meses, ADR-0010). O que
    // sobrevive não pode reconstituir o perfil que a exclusão apagou.
    assert.ok(!JSON.stringify(pedido).includes(EMAIL));
  });

  void it('avisa por e-mail, e o aviso diz que as tags pararam de responder', async () => {
    const bancada = montar();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    assert.equal(bancada.mensagens.length, 1);
    const mensagem = bancada.mensagens[0]!;
    assert.equal(mensagem.para, EMAIL);
    assert.match(mensagem.corpo, /plaquinhas/i);
    assert.match(mensagem.corpo, /30 dias/);
    // "Se não foi você" é o que dá socorro a quem teve a conta tomada e
    // excluída por outra pessoa. Sem esta frase, o prazo de 30 dias é um
    // detalhe de infraestrutura e não uma janela de recuperação.
    assert.match(mensagem.corpo, /se nao foi voce/i);
  });

  void it('ISCA DO AVISO: mailer que estoura não desfaz nem esconde a exclusão', async () => {
    const bancada = montar();
    bancada.derrubarOMailer();

    await bancada.servico.excluirMinhaConta(autenticada(bancada.repo), CONTEXTO);

    // Medido em 22/09 na forma irmã: a pessoa ficava sem o remédio E sem o
    // aviso. O remédio está feito e gravado; o que falhou foi o anúncio.
    assert.notEqual(bancada.repo.marcada, undefined);
    assert.deepEqual(
      bancada.repo.refresh.map((l) => l.revokedReason),
      ['account_deleted', 'account_deleted'],
    );
    // E o silêncio é proibido: sem este registro, um SMTP fora do ar vira uma
    // exclusão que ninguém soube que aconteceu.
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

    // O critério 4 é literal: "todas as sessões caem, sem precisar lembrar a
    // senha". Nenhuma credencial entrou nesta chamada além do link.
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

    // `logout_all` é o titular arrumando a casa. `not_me` é alguém declarando
    // que a conta está com outra pessoa. Quem investigar um incidente seis
    // meses depois precisa dessa diferença, e ela só existe se estiver gravada
    // no momento em que aconteceu — é o mesmo argumento que separou `logout` de
    // `logout_all` na emenda 1 do ADR-0002.
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
    // Esta é a afirmação que decide a ordem. Consuma o token antes da revogação
    // e uma indisponibilidade passageira do banco gasta o único remédio de quem
    // não consegue pedir outro link: quem dispara o aviso é o invasor.
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

    // Distinguir contaria a um estranho que aquele token existiu, e esta rota é
    // pública: é o mesmo raciocínio de `sessaoExpirada()` em `renovar()`.
    assert.ok(a instanceof AppError);
    assert.ok(b instanceof AppError);
    assert.equal(a.status, 410);
    assert.equal(b.status, 410);
    assert.equal(a.problemType, b.problemType);
    // E nada aconteceu no banco.
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

    // O propósito vai na cláusula, e não num `if` depois da busca: sem ele, um
    // token de verificação de e-mail viraria uma revogação em massa.
    assert.ok(erro instanceof AppError);
    assert.equal(erro.status, 410);
  });

  void it('NÃO troca a senha, e convida a trocar pelo fluxo que exige a caixa de entrada', async () => {
    const bancada = montar();
    darUmLinkValido(bancada.repo);

    await bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO);

    // Quem tem o link não provou ser o titular. Trocar a senha a partir daqui
    // trancaria o titular para fora usando exatamente o link que existe para
    // protegê-lo — e `regravarCredencial` deste dublê estoura se alguém tentar.
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
