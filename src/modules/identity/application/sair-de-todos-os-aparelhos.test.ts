/**
 * "Sair de todos os aparelhos" — o gatilho que a BICHUS-125 existe para
 * construir, provado pelo EFEITO e não pela chamada.
 *
 * ## Por que este arquivo não usa a bancada de `auth-service.test.ts`
 *
 * Aquela bancada tem dublês que respondem valor fixo: `buscarRefreshPorHash`
 * devolve sempre a mesma linha, `revogarFamilia` só anota. Ela serve ao que ela
 * prova — que uma porta foi tocada. Aqui isso não basta, e o motivo está escrito
 * na história: `invalidarTodasAsSessoes()` sobreviveu meses **sem nenhum
 * chamador**, e nenhuma suíte reclamou. Um caso que afirmasse
 * "`revogarTodasAsFamilias` foi chamada" ficaria verde com a função morta, que é
 * literalmente o estado de ontem.
 *
 * Então o repositório daqui é um banco de mentira que **se comporta como o
 * banco**: guarda linhas de `refresh_tokens` com `revoked_at` e `rotated_to_id`,
 * guarda `sessions_invalid_before` na conta, e responde às consultas do jeito
 * que o Postgres responderia. O que se afirma é o que a pessoa observa: **o
 * outro aparelho para de conseguir renovar.**
 *
 * ## O caso que decide o trabalho
 *
 * Dois aparelhos com sessão viva. Um pede para sair de todos. O refresh do
 * outro tem que parar de funcionar — sem ninguém ter tocado naquele aparelho.
 *
 * Ele reprova de duas formas diferentes, e as duas importam:
 *
 * - arranque `revogarTodasAsFamilias` de `derrubarTodasAsSessoes` e o refresh do
 *   aparelho B continua renovando. **É este o defeito de hoje**: a barreira de
 *   `sessions_invalid_before` não toca em `refresh_tokens`, e nesta base
 *   `renovar()` ainda nem lê a barreira (isso chega com BICHUS-77);
 * - arranque `invalidarSessoes` e o token de ACESSO do aparelho B sobrevive até
 *   o `exp`, o que o caso `a barreira também é empurrada` pega.
 *
 * ## O contrapeso, que separa portão de bloqueio geral
 *
 * Um refresh emitido **depois** do "sair de todos" continua valendo. Sem ele, a
 * implementação mais simples que passa no caso acima seria "recusar sempre", e
 * ninguém mais entraria na conta.
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
  IdentityRepository,
  MotivoDeRevogacao,
  NovoRefresh,
  RefreshArmazenado,
  TokenConsumido,
} from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { ClaimsDoAcesso, TokenSigner } from '../ports/token-signer.js';
import type { Autenticado } from './auth-service.js';
import { criarAuthService } from './auth-service.js';
import type { ContextoDaRequisicao } from './dependencies.js';

const TUTORA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const EMAIL = 'tutora@exemplo.test';
const SENHA = 'chuva-morna-no-telhado-37';

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: 'corr-1',
  ip: '203.0.113.7',
  userAgent: 'Bichu/1.0 (iPhone)',
};

/** Relógio que anda quando o caso mandar. O produto nunca lê o da máquina. */
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

/**
 * Um `refresh_tokens` de mentira que se comporta como a tabela.
 *
 * Os campos são os do esquema, e as consultas replicam as cláusulas: a
 * revogação em massa é `WHERE user_id = $1 AND revoked_at IS NULL`, e não um
 * `forEach` sobre tudo — a diferença é a idempotência, que um caso abaixo cobra.
 */
interface Linha {
  id: string;
  userId: UserId;
  familyId: string;
  tokenHash: string;
  /** BICHUS-77: `renovar()` compara este valor com a barreira da conta. */
  issuedAt: Instant;
  expiresAt: Instant;
  absoluteExpiresAt: Instant;
  staySignedIn: boolean;
  rotatedToId: string | null;
  revokedAt: Date | null;
  revokedReason: MotivoDeRevogacao | null;
}

class BancoDeMentira implements IdentityRepository {
  public readonly linhas: Linha[] = [];
  public conta: Conta;
  public readonly credencial: CredencialLocal;

  constructor(phc: string) {
    this.conta = {
      id: TUTORA,
      email: EMAIL,
      emailVerifiedAt: dataFixa(0),
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

  gravarRefresh(novo: NovoRefresh): Promise<void> {
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

  buscarRefreshPorHash(hash: TokenHash): Promise<RefreshArmazenado | undefined> {
    const l = this.linhas.find((x) => x.tokenHash === hash);
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

  rotacionar(atualId: string, sucessor: NovoRefresh, agora: Instant): Promise<boolean> {
    const atual = this.linhas.find((x) => x.id === atualId);
    // A mesma guarda do `UPDATE ... WHERE rotated_to_id IS NULL AND revoked_at
    // IS NULL` do repositório de verdade. Sem ela este dublê rotacionaria uma
    // linha revogada, e o caso central passaria por acidente.
    if (atual === undefined || atual.rotatedToId !== null || atual.revokedAt !== null) {
      return Promise.resolve(false);
    }
    atual.rotatedToId = sucessor.id;
    atual.revokedAt = dataFixa(agora);
    atual.revokedReason = 'rotation';
    void this.gravarRefresh(sucessor);
    return Promise.resolve(true);
  }

  revogarFamilia(familyId: string, motivo: MotivoDeRevogacao, agora: Instant): Promise<number> {
    const alvo = this.linhas.filter((l) => l.familyId === familyId && l.revokedAt === null);
    for (const l of alvo) {
      l.revokedAt = dataFixa(agora);
      l.revokedReason = motivo;
    }
    return Promise.resolve(alvo.length);
  }

  revogarTodasAsFamilias(
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

  invalidarSessoes(userId: UserId, agora: Instant): Promise<void> {
    if (this.conta.id === userId) {
      this.conta = { ...this.conta, sessionsInvalidBefore: agora };
    }
    return Promise.resolve();
  }

  buscarContaPorId(): Promise<Conta | undefined> {
    return Promise.resolve(this.conta);
  }
  buscarContaPorEmail(): Promise<Conta | undefined> {
    return Promise.resolve(this.conta);
  }
  buscarCredencialLocalPorEmail(): Promise<CredencialLocal | undefined> {
    return Promise.resolve(this.credencial);
  }
  registrarLogin(): Promise<void> {
    return Promise.resolve();
  }
  regravarCredencial(): Promise<void> {
    return Promise.resolve();
  }
  invalidarTokensPendentes(): Promise<number> {
    return Promise.resolve(0);
  }
  criarContaLocal(): Promise<Conta | undefined> {
    throw new Error('criarContaLocal: nenhum caso deste arquivo deveria chegar aqui');
  }
  atualizarPerfil(): Promise<Conta | undefined> {
    throw new Error('atualizarPerfil: nenhum caso deste arquivo deveria chegar aqui');
  }
  criarTokenDeVerificacao(): Promise<void> {
    throw new Error('criarTokenDeVerificacao: nenhum caso deste arquivo deveria chegar aqui');
  }
  consumirTokenDeVerificacao(): Promise<TokenConsumido | undefined> {
    throw new Error('consumirTokenDeVerificacao: nenhum caso deste arquivo deveria chegar aqui');
  }
  conferirTokenDeVerificacao(): Promise<TokenConsumido | undefined> {
    throw new Error('conferirTokenDeVerificacao: nenhum caso deste arquivo deveria chegar aqui');
  }
  criarJanelaDeReautenticacao(): Promise<void> {
    throw new Error('criarJanelaDeReautenticacao: nenhum caso deste arquivo deveria chegar aqui');
  }

  consumirJanelaDeReautenticacao(): never {
    throw new Error('consumirJanelaDeReautenticacao: nenhum caso deste arquivo deveria chegar aqui');
  }

  marcarEmailVerificado(): Promise<void> {
    throw new Error('marcarEmailVerificado: nenhum caso deste arquivo deveria chegar aqui');
  }

  registrarPedidoDeExclusao(): Promise<undefined> {
    throw new Error('registrarPedidoDeExclusao: nenhum caso deste arquivo deveria chegar aqui');
  }

  contasAExpurgar(): Promise<readonly UserId[]> {
    throw new Error('contasAExpurgar: nenhum caso deste arquivo deveria chegar aqui');
  }

  expurgarConta(): Promise<boolean> {
    throw new Error('expurgarConta: nenhum caso deste arquivo deveria chegar aqui');
  }

  registrarPedidoDeTrocaDeEmail(): Promise<void> {
    throw new Error('registrarPedidoDeTrocaDeEmail: nenhum caso deste arquivo deveria chegar aqui');
  }

  concluirTrocaDeEmail(): Promise<Conta | undefined> {
    throw new Error('concluirTrocaDeEmail: nenhum caso deste arquivo deveria chegar aqui');
  }

  cancelarTrocaDeEmailPendente(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * O cadastro de aparelhos como uma TABELA de mentira, e não um espião.
 *
 * O SEC-019 é um defeito de endereço, não de chamada, e o parecer da segurança
 * diz por extenso por quê: *"um caso que só verifique que `removerPushDaConta`
 * foi chamada fica verde com o `DELETE` errado embaixo"*. Então o que este
 * objeto guarda são LINHAS, e o que os casos afirmam é que a linha do aparelho
 * roubado **não existe mais** depois da operação.
 */
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

/** O texto da reprovação diz o RISCO, e não o número. Ver o §19 da segurança. */
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
 * `pushQuebrado` existe para UM caso: o que prova que a falha do passo 3
 * propaga em vez de virar sucesso silencioso. Ver o caso, lá embaixo.
 */
async function montar(opcoes: { pushQuebrado?: boolean } = {}): Promise<Bancada> {
  const relogio = relogioQueAnda();
  const banco = new BancoDeMentira(await gerarHashDeSenha(SENHA));
  const aparelhos = new CadastroDeAparelhosDeMentira();
  const eventos: AuditEvent[] = [];
  const mensagens: Mensagem[] = [];

  /**
   * O assinador guarda o `iat` que emitiu e o devolve na verificação, com o
   * mesmo `Math.floor` do emissor real. Sem essa volta, emissão e barreira
   * seriam dois dublês independentes e a comparação não provaria nada.
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

/**
 * Dois aparelhos no cadastro de push: o que foi levado e o que ficou.
 *
 * Dois, e não um, pelo mesmo motivo do refresh: com um só, "todos os aparelhos
 * saíram" não tem como ser medido e o caso passa por vacuidade.
 */
const APARELHO_ROUBADO = 'aparelho-roubado';
const APARELHO_DE_CASA = 'aparelho-de-casa';

function comDoisAparelhosNoPush(b: Bancada): void {
  b.aparelhos.registrar(APARELHO_ROUBADO, TUTORA, 'fcm-do-telefone-levado');
  b.aparelhos.registrar(APARELHO_DE_CASA, TUTORA, 'fcm-do-tablet-de-casa');
}

/** Entra de verdade, pelo caminho da senha. Dois destes são dois aparelhos. */
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

    // Duas famílias distintas, e as duas vivas. Sem isto o caso mediria o
    // logout de um aparelho só e passaria com a implementação errada.
    assert.equal(b.banco.vivas.length, 2, 'os dois aparelhos precisam ter sessão viva');
    const familias = new Set(b.banco.vivas.map((l) => l.familyId));
    assert.equal(familias.size, 2, 'cada aparelho abre a própria família');

    // O aparelho B renova ANTES, para que a recusa de depois não possa ser
    // atribuída a um refresh que nunca funcionou.
    b.relogio.avancar(1000);
    await b.servico.renovar(aparelhoB.refresh, CONTEXTO);
    const refreshVivoDoB = b.banco.vivas.find((l) => l.userId === TUTORA && l.revokedAt === null);
    assert.ok(refreshVivoDoB !== undefined);

    // O aparelho A pede para sair de todos.
    b.relogio.avancar(1000);
    await b.servico.sairDeTodosOsAparelhos(await autenticado(b, aparelhoA.acesso), CONTEXTO);

    // E o B, que ninguém tocou, não renova mais.
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
    // Indistinguível de um refresh inválido qualquer: o mesmo `type` que um
    // token vencido produz. Qualquer outro valor aqui viraria oráculo — diria
    // a quem apresenta um refresh que AQUELA conta pediu para sair de todos.
    assert.equal(erro.problemType, 'token-expired');
  });

  void it('a barreira também é empurrada: o token de ACESSO do outro aparelho cai', async () => {
    const b = await montar();
    const aparelhoA = await entrarNoAparelho(b);
    b.relogio.avancar(1000);
    const aparelhoB = await entrarNoAparelho(b);

    // Funcionava antes.
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

    // A pessoa entra de novo. Se "sair de todos" fosse um bloqueio geral em vez
    // de um gatilho pontual, isto aqui falharia — e ninguém mais entraria.
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
    // `devices_removed` entra no MESMO evento e não num evento próprio
    // (SEC-019): o gesto é um, e duas famílias de evento para o mesmo ato
    // fariam a trilha contar o mesmo fato duas vezes.
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

    // Senha atual errada E senha nova fraca. O erro tem de ser o da credencial.
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
    // A redefinição vive noutra bancada (ela consome token de verificação), e o
    // que este caso guarda é o acoplamento que importa: os três gatilhos chamam
    // `derrubarTodasAsSessoes`, que faz as duas metades. Se alguém separar de
    // novo, `revogarTodasAsFamilias` deixa de existir na porta e isto não
    // compila — a barreira de tipo é a prova, e ela roda no `tsc`.
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

/**
 * O SEC-019: os caminhos de revogação em massa apagam o cadastro de push.
 *
 * ## O que decide cada caso
 *
 * A LINHA, lida depois da operação. Não "`removerPushDaConta` foi chamada":
 * essa afirmação fica verde com o `DELETE` errado embaixo, e é o que o §19 do
 * documento de segurança proíbe por extenso.
 *
 * ## As iscas, rodadas e vistas reprovar em 23/09/2026
 *
 * | o que foi desligado | reprovaram, aqui |
 * |---|---|
 * | a chamada `deps.removerPushDaConta(userId)` comentada em `derrubarTodasAsSessoes` | 4 casos |
 * | `removerTodosDaConta` delegando a `revogarDoDono(dono, dono)` (o `DELETE` errado) | 4 casos |
 *
 * A segunda isca é a que justifica ler a linha em vez de contar a chamada: com
 * ela, um caso que afirmasse "a função foi chamada" continuaria verde.
 */
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
    // §19: sem vínculo entre a linha e a família de refresh, o servidor não tem
    // como saber qual linha é o telefone que está pedindo. Um parâmetro de "não
    // apague este" seria preenchido por quem está com o aparelho roubado, então
    // a escolha é derrubar todos. O requisito que paga esse preço é do app:
    // re-registrar depois de todo login (`vigia_de_aviso.dart`).
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
    // Sem `devices_removed`, o evento diz que a sessão caiu e não diz se o
    // endereço de entrega caiu junto — que é a pergunta que o SEC-019 fez e que
    // a trilha de ontem não respondia em lugar nenhum.
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
    // Contrapeso. Sem ele, a implementação mais simples que passa nos casos
    // acima poderia exigir ao menos uma linha, e o primeiro "sair de todos" de
    // quem nunca concedeu notificação viraria 500.
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
    // O §19 é explícito: o que não pode acontecer é o passo 3 falhar dentro de
    // um `catch` mudo e a resposta continuar sendo sucesso. Sem este caso, a
    // "correção" mais simples que passa em todos os de cima é envolver a
    // chamada num `try` vazio, e o defeito volta silencioso.
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
