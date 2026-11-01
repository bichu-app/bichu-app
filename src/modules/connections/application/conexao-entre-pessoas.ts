import { problemas } from '../../../shared/http/errors.js';
import { comoIso } from '../../../shared/time/clock.js';
import type { AuditAction, AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { ArestaGuardada, ConexaoProjetada, OrigemDoPedido } from '../domain/conexao.js';
import { arestaMorta, projetarConexao } from '../domain/conexao.js';
import {
  TETO_DE_CONEXOES,
  pedidosQueAindaCabemHoje,
  recusaDoAceite,
  recusaDoPedido,
} from '../domain/teto-de-conexoes.js';
import type {
  ConnectionsRepository,
  DirecaoDoPedido,
  PaginaDeConexoes,
  PaginaDePedidos,
} from '../ports/connections-repository.js';
import type { LeitorDeBloqueio } from '../ports/leitor-de-bloqueio.js';
import type { ResolvedorDeApelido, ResolvedorDeConvite } from '../ports/convite-de-conexao.js';

type AcaoDaConexao = Extract<AuditAction, `connection.${string}`>;

/** Quem chama, e o contexto que a trilha guarda. */
export interface ContextoDoChamador {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip: string | undefined;
}

export interface ResumoDasConexoes {
  readonly connected_count: number;
  readonly pending_sent_count: number;
  readonly requests_received_count: number;
  readonly remaining_requests_today: number;
  readonly connection_limit: number;
  /** Quantos tutores entraram pelo convite desta conta e viraram conexão aceita. */
  readonly invited_joined_count: number;
}

export interface DependenciasDaConexao {
  readonly conexoes: ConnectionsRepository;
  readonly convites: ResolvedorDeConvite;
  /** O caminho por apelido, aberto pela decisão do cliente de 20/10/2026. */
  readonly apelidos: ResolvedorDeApelido;
  readonly bloqueios: LeitorDeBloqueio;
  readonly trilha: AuditLog;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

function refDaAresta(ids: IdGenerator): string {
  return Buffer.from(ids.random128()).toString('base64url');
}

function recusaLegivel(code: string, field: string): never {
  const mensagens: Record<string, string> = {
    connection_limit_reached: `Você chegou ao limite de ${String(TETO_DE_CONEXOES)} conexões.`,
    addressee_connection_limit_reached: 'Essa pessoa não pode receber novas conexões agora.',
    pending_limit_reached: 'Você tem muitos pedidos esperando resposta. Espere um deles ser respondido.',
    daily_limit_reached: 'Você já enviou os pedidos de hoje. Tente amanhã.',
    connection_resting: 'Esse pedido foi feito há pouco tempo. Espere um pouco antes de pedir de novo.',
    connection_exists: 'Vocês já têm uma conexão ou um pedido em andamento.',
  };
  throw problemas.validacao([{ field, code, message: mensagens[code] ?? 'Não foi possível agora.' }]);
}

export class ConexaoEntrePessoas {
  constructor(private readonly deps: DependenciasDaConexao) {}

  /**
   * Pedir conexão **a partir de um convite** (o link ou o QR — os dois carregam o
   * mesmo token).
   */
  async pedir(contexto: ContextoDoChamador, token: string): Promise<ConexaoProjetada> {
    const convite = await this.deps.convites.resolver(token, contexto.userId);
    if (convite === undefined) throw problemas.naoEncontrado();
    return this.criarPedido(contexto, convite.alvo, convite.origem, 'invite_token');
  }

  /** Pedir conexão **por apelido** — o caminho que a busca abriu em 20/10/2026. */
  async pedirPorApelido(
    contexto: ContextoDoChamador,
    apelido: string,
  ): Promise<ConexaoProjetada> {
    const alvo = await this.deps.apelidos.resolver(apelido, contexto.userId);
    if (alvo === undefined) throw problemas.naoEncontrado();
    return this.criarPedido(contexto, alvo, 'people_search', 'handle');
  }

  /**
   * **O pedido, depois de o alvo já estar resolvido.** É o tronco comum dos dois
   * caminhos, e é por ele existir que *"pedir por convite"* e *"pedir por apelido"*
   * não podem divergir em nada além da credencial e de `origin`.
   */
  private async criarPedido(
    contexto: ContextoDoChamador,
    alvo: UserId,
    origem: OrigemDoPedido,
    campo: string,
  ): Promise<ConexaoProjetada> {
    const agora = this.deps.clock.now();
    if (alvo === contexto.userId) throw problemas.naoEncontrado();
    if (await this.deps.bloqueios.existeBloqueioEntre(contexto.userId, alvo)) {
      throw problemas.naoEncontrado();
    }

    const existente = await this.deps.conexoes.arestaDoPar(contexto.userId, alvo, agora);
    if (existente !== undefined && !arestaMorta(existente, agora)) {
      const projetada = projetarConexao(existente, agora, comoIso);
      if (projetada !== undefined) return projetada;
      recusaLegivel('connection_resting', campo);
    }

    const [deQuemPede, conexoesDoAlvo] = await Promise.all([
      this.deps.conexoes.contagens(contexto.userId, agora),
      this.deps.conexoes.contarConexoes(alvo),
    ]);
    const recusa = recusaDoPedido(deQuemPede, { conexoes: conexoesDoAlvo });
    if (recusa !== undefined) recusaLegivel(recusa, campo);

    const criada = await this.deps.conexoes.pedir({
      id: this.deps.ids.uuidv7(),
      ref: refDaAresta(this.deps.ids),
      quemPede: contexto.userId,
      alvo,
      origem,
      agora,
    });
    if (criada === undefined) recusaLegivel('connection_exists', campo);

    await this.registrar(contexto, 'connection.requested', criada.ref, { origin: origem });
    const projetada = projetarConexao(criada, agora, comoIso);
    if (projetada === undefined) throw problemas.naoEncontrado();
    return projetada;
  }

  /** Aceitar. **Sem aceite não há conexão**, e este é o único caminho que a cria. */
  async aceitar(contexto: ContextoDoChamador, ref: string): Promise<ConexaoProjetada> {
    const agora = this.deps.clock.now();
    const aresta = await this.deps.conexoes.arestaPorRef(ref, contexto.userId, agora);
    if (aresta === undefined || aresta.souQuemPediu || aresta.estado !== 'pending') {
      throw problemas.naoEncontrado();
    }

    const deQuemAceita = await this.deps.conexoes.contagens(contexto.userId, agora);
    const recusa = recusaDoAceite(deQuemAceita, { conexoes: 0 });
    if (recusa !== undefined) recusaLegivel(recusa, 'connectionRef');

    const aceita = await this.deps.conexoes.aceitar(ref, contexto.userId, agora);
    if (aceita === undefined) recusaLegivel('connection_limit_reached', 'connectionRef');

    await this.registrar(contexto, 'connection.accepted', ref, {});
    const projetada = projetarConexao(aceita, agora, comoIso);
    if (projetada === undefined) throw problemas.naoEncontrado();
    return projetada;
  }

  /** Recusar, cancelar ou desfazer — **uma operação, do lado de fora**. */
  async encerrar(contexto: ContextoDoChamador, ref: string): Promise<void> {
    const agora = this.deps.clock.now();
    const feito = await this.deps.conexoes.encerrar(ref, contexto.userId, agora);
    if (feito === undefined) throw problemas.naoEncontrado();
    await this.registrar(contexto, `connection.${feito}`, ref, {});
  }

  /** Os pedidos de uma das duas caixas. */
  async pedidos(
    contexto: ContextoDoChamador,
    direcao: DirecaoDoPedido,
    pagina: number,
    limite: number,
  ): Promise<{ readonly itens: readonly ConexaoProjetada[]; readonly total: number }> {
    const agora = this.deps.clock.now();
    const encontrados: PaginaDePedidos = await this.deps.conexoes.pedidos(contexto.userId, {
      direcao,
      pagina,
      limite,
      agora,
    });
    const itens = encontrados.itens
      .map((aresta: ArestaGuardada) => projetarConexao(aresta, agora, comoIso))
      .filter((p): p is ConexaoProjetada => p !== undefined);
    return { itens, total: encontrados.total };
  }

  /**
   * **As PRÓPRIAS conexões aceitas** (cliente, 22/10/2026: *"o usuário pode abrir a
   * lista de usuários que é sua conexão"*).
   */
  async conexoes(
    contexto: ContextoDoChamador,
    pagina: number,
    limite: number,
  ): Promise<PaginaDeConexoes> {
    return this.deps.conexoes.conexoes(contexto.userId, { pagina, limite });
  }

  /** O resumo **do próprio dono**: só números. */
  async resumo(contexto: ContextoDoChamador): Promise<ResumoDasConexoes> {
    const agora = this.deps.clock.now();
    const contagens = await this.deps.conexoes.contagens(contexto.userId, agora);
    const recebidos = await this.deps.conexoes.pedidos(contexto.userId, {
      direcao: 'received',
      pagina: 1,
      limite: 1,
      agora,
    });
    const convidados = await this.deps.conexoes.contarConvidadosQueEntraram(contexto.userId);
    return {
      connected_count: contagens.conexoes,
      pending_sent_count: contagens.pendentesEnviados,
      requests_received_count: recebidos.total,
      remaining_requests_today: pedidosQueAindaCabemHoje(contagens),
      connection_limit: TETO_DE_CONEXOES,
      invited_joined_count: convidados,
    };
  }

  private async registrar(
    contexto: ContextoDoChamador,
    acao: AcaoDaConexao,
    ref: string,
    extra: Record<string, string>,
  ): Promise<void> {
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: contexto.userId,
      action: acao,
      resourceKind: 'user_connection',
      resourceId: ref,
      correlationId: contexto.correlationId,
      ...(contexto.ip === undefined ? {} : { actorIp: contexto.ip }),
      metadata: extra,
    });
  }
}
