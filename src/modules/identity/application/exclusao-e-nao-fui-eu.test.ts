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

/**
 * O resumo do link, pela MESMA funcao que a producao usa.
 *
 * Era uma reimplementacao local (`createHash('sha256')...digest('base64')`), e
 * foi essa duplicacao que deixou o conserto de 19/10 passar por aqui sem
 * reprovar: o dublê errava junto com o adaptador. `hashDeToken` e uma forma so.
 */
function hashDe(valor: string): TokenHash {
  return hashDeToken(valor) as TokenHash;
}

function contaViva(): Conta {
  return {
    id: TUTORA,
    email: EMAIL,
    emailVerifiedAt: dataFixa(),
    displayName: 'Tutora',
    // `handle: null` e o estado NORMAL de conta sem apelido: nenhum fluxo
    // obriga a escolher (plano 4-C.8), e as 7 contas de hml estao assim.
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
  /** `TokenHash` e `Buffer` desde 19/10: a comparacao e `.equals`, nunca `===`. */
  hash: TokenHash;
  proposito: PropositoDoToken;
  enviadoPara: string;
  expiraEm: Instant;
  consumidoEm: Instant | null;
}

/**
 * A recusa deste arquivo, pelo nome da porta. Mesma mensagem que cada stub
 * carregava antes de o dublê compartilhado assumir as portas não exercitadas.
 */
function naoUsado(nome: string): never {
  throw new Error(`${nome}: nenhum caso deste arquivo deveria chegar aqui`);
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
class BancoDeMentira extends RepositorioQueRecusaTudo {
  protected recusar(nome: string): never {
    return naoUsado(nome);
  }

  /**
   * Recusa com mensagem PRÓPRIA, e não a genérica: a varredura de expurgo é do
   * worker, e um caso deste arquivo que chegasse aqui estaria exercitando outra
   * coisa. A distinção existia antes do dublê compartilhado e segue valendo.
   */
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
  /** Nome do método que deve falhar nesta rodada. É o interruptor das iscas. */
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

  override invalidarSessoes(userId: UserId, barreira: Instant): Promise<void> {
    this.conferirInterruptor('invalidarSessoes');
    if (userId !== TUTORA) return Promise.resolve();
    // `GREATEST`: a coluna só anda para a frente.
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

/**
 * O cadastro de push como um CONJUNTO de linhas, e não um espião de chamada.
 *
 * SEC-019, caminhos 4 e 5 da tabela do §19: "não fui eu" e exclusão de conta
 * passam por `derrubarTodasAsSessoes`, e até 23/09 nenhum dos dois tocava
 * `user_devices`. O que os casos leem é a linha, nunca a chamada.
 */
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
  /** Faz o próximo `mailer.enviar` estourar. */
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
    // SEC-021: quem não está medindo o apagamento do logout devolve 0, que é a
    // resposta honesta de "não havia localização gravada".
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
    // O PRAZO DE 30 DIAS NÃO PODE APARECER, e a ausência dele é a asserção.
    //
    // Era `assert.match(mensagem.corpo, /30 dias/)`, resíduo do desenho antigo.
    // Em 17/10 o cliente decidiu por escrito: *"Mantenha a foto e nao delete os
    // dados do usuario, apenas desabilite na plataforma"*. Autoridades na
    // árvore: `migrations/20261017000013_conta-desabilitada-nao-apaga-aparelho.sql`
    // (linhas 6-9, a decisão literal; a migração REVERTE o gatilho que apagava
    // `user_devices`) e
    // `src/modules/identity/application/expurgar-contas-excluidas.ts`, onde o
    // expurgo é inócuo de propósito e não há mais `DELETE FROM users` em
    // `src/`. Prometer apagamento em 30 dias num aviso ao titular, quando nada
    // é apagado, é informação falsa sobre o tratamento dos próprios dados —
    // defeito maior do que o texto antigo era útil.
    assert.doesNotMatch(mensagem.corpo, /30 dias/);
    // E o que entrou no lugar do prazo tem de estar dito: os dados ficam, e o
    // apagamento definitivo passa a ser pedido por resposta ao e-mail.
    assert.match(mensagem.corpo, /guardados e inacessiveis/i);
    assert.match(mensagem.corpo, /apagamento definitivo/i);
    // "Se não foi você" é o que dá socorro a quem teve a conta tomada e
    // excluída por outra pessoa. Sem esta frase, a desativação é um detalhe de
    // infraestrutura e não uma janela de recuperação.
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

/**
 * SEC-019 depois de 17/10: "não fui eu" apaga o cadastro de push; a EXCLUSÃO
 * DE CONTA, NÃO.
 *
 * ## O que mudou, e por que o caso virou do avesso
 *
 * Até 17/10 este bloco tinha dois casos simétricos, e o primeiro exigia que a
 * exclusão de conta apagasse `user_devices` na hora. O cliente trocou o desenho
 * no mesmo dia, por escrito:
 *
 * > *"Mantenha a foto e não delete os dados do usuário, apenas desabilite na
 * > plataforma e filtro as páginas para que esse usuário não seja mais
 * > encontrado em nenhuma pagina ou funcionalidade"*
 *
 * Então o caso foi INVERTIDO em vez de apagado, e a inversão é o registro de
 * que a troca foi deliberada: hoje ele reprova se a exclusão voltar a apagar a
 * linha.
 *
 * ## O SEC-019 continua fechado, e não é por confiança
 *
 * O risco do SEC-019 é um aparelho continuar sendo destinatário VÁLIDO de alerta
 * de pet perdido. Quem decide isso é a consulta de alcance
 * (`kysely-alcance-por-postgis.ts`), que junta `users` e exige
 * `u.deleted_at IS NULL` desde 22/09 (BICHUS-88). Conta desabilitada não entra
 * no conjunto de notificados **com ou sem** linha em `user_devices`. A linha
 * deixa de ser alcançável por propriedade da consulta, que é exatamente a troca
 * que o cliente pediu para as páginas, aplicada ao push.
 *
 * ## A assimetria é o ponto, e ela é de produto
 *
 * `logout_all`, `password_changed` e `not_me` CONTINUAM apagando, e a diferença
 * não é descuido: nesses três a conta segue **ativa**, o aparelho pode estar na
 * mão de outra pessoa, e nenhuma cláusula de consulta protege de um token de
 * push válido numa conta ativa. Ali apagar é o remédio que a pessoa pediu. Na
 * exclusão, a conta sai do conjunto por estado, e apagar seria apagar dado que
 * o cliente mandou reter.
 *
 * Isca a rodar (NÃO rodada nesta branch, por instrução do cliente): tirar o
 * `motivo === 'account_deleted' ? 0 :` de `derrubarTodasAsSessoes` deve reprovar
 * o primeiro caso; recolocar a chamada em todos os motivos deve reprovar só ele.
 */
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
    // É o caminho de quem foi avisado de reuso de refresh: alguém está com a
    // credencial dela, e a conta continua ATIVA. Derrubar a sessão e deixar o
    // push é entregar o alerta de pet perdido justamente a esse alguém.
    const bancada = montar();
    darUmLinkValido(bancada.repo);

    await bancada.servico.recusarSessaoAvisada(LINK_EM_CLARO, CONTEXTO);
    assert.equal(bancada.push.linhas.size, 0, AINDA_RECEBE_APOS);
  });
});
