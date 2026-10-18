/**
 * O caso de uso da conexão entre pessoas: pedir, aceitar, encerrar, contar.
 *
 * ## A prova de que nenhuma conta arbitrária alcança um perfil arbitrário
 *
 * Ela não é uma promessa de comportamento; ela é a **forma** deste arquivo. Há
 * **uma** operação que cria aresta — `pedir` —, e a primeira coisa que ela faz é
 * pedir ao `ResolvedorDeConvite` que transforme um token num alvo. **Não existe
 * sobrecarga, parâmetro opcional nem segundo método que receba apelido, `UserId`
 * ou identificador de pessoa.** Então o alvo de um pedido só pode vir de um
 * convite, e convite é relação: caso devolvido, encontro em comum, ou código
 * lido cara a cara (plano 4-B.1).
 *
 * Com a descoberta por link morta e sem busca de pessoas, as três portas de
 * entrada da coluna do meio da tabela 4-B são as únicas, e as três já são uma
 * relação. A fiação de produção liga `nenhumConviteExiste`, então **hoje a
 * resposta de `requestConnection` é 404 para qualquer token** — o que é a forma
 * mais forte possível da mesma afirmação.
 *
 * ## Os dois níveis de teto
 *
 * As contagens são lidas aqui para produzir a **recusa legível** (`code` do
 * contrato). A contenção que vale sob concorrência está na cláusula `WHERE` do
 * `INSERT`: se ela barrar depois de este arquivo ter aprovado, o resultado é
 * `undefined` e a borda responde a mesma recusa. Dois níveis, alcances
 * diferentes, nunca duas cópias de uma regra só.
 *
 * ## O que este arquivo não tem
 *
 * Nenhuma listagem de conexões, nenhuma busca, nenhuma sugestão, nenhum
 * "seguir", nenhuma escrita em `user_blocks`. E nenhum aviso: a caixa de
 * notificações é a fatia M, e o aviso de pedido recebido entra por lá quando ela
 * descer — ligar um e-mail aqui faria a conexão prometer uma entrega que o
 * produto não tem (a permissão de push em homologação está em 403).
 */
import { problemas } from '../../../shared/http/errors.js';
import { comoIso } from '../../../shared/time/clock.js';
import type { AuditAction, AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { ArestaGuardada, ConexaoProjetada } from '../domain/conexao.js';
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
  PaginaDePedidos,
} from '../ports/connections-repository.js';
import type { LeitorDeBloqueio } from '../ports/leitor-de-bloqueio.js';
import type { ResolvedorDeConvite } from '../ports/convite-de-conexao.js';

/** As acoes de trilha desta fatia. Fechada: acao inventada nao compila. */
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
}

export interface DependenciasDaConexao {
  readonly conexoes: ConnectionsRepository;
  readonly convites: ResolvedorDeConvite;
  readonly bloqueios: LeitorDeBloqueio;
  readonly trilha: AuditLog;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** 128 bits em base64url: 22 caracteres sem preenchimento, como o `CHECK` cobra. */
function refDaAresta(ids: IdGenerator): string {
  return Buffer.from(ids.random128()).toString('base64url');
}

/** A recusa de teto, no vocabulário do contrato. `field` é fixo por operação. */
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
   * Pedir conexão. **O alvo vem do convite, e só dele.**
   *
   * Os quatro caminhos de 404 são o mesmo 404: token que não resolve, par
   * bloqueado em qualquer direção, conta desabilitada de qualquer lado, e a
   * própria conta como alvo. Distinguir qualquer um deles contaria algo.
   */
  async pedir(contexto: ContextoDoChamador, token: string): Promise<ConexaoProjetada> {
    const agora = this.deps.clock.now();
    const convite = await this.deps.convites.resolver(token, contexto.userId);
    if (convite === undefined || convite.alvo === contexto.userId) throw problemas.naoEncontrado();
    if (await this.deps.bloqueios.existeBloqueioEntre(contexto.userId, convite.alvo)) {
      throw problemas.naoEncontrado();
    }

    const existente = await this.deps.conexoes.arestaDoPar(contexto.userId, convite.alvo, agora);
    if (existente !== undefined && !arestaMorta(existente, agora)) {
      // **Idempotente, e a recusa e invisivel.** Pedir de novo sobre uma aresta
      // viva devolve o que ja existe e nao cria linha nova -- a mesma decisao de
      // `requestToJoinNetworkEvent`. Para quem pediu, a recusada ainda dentro da
      // validade se projeta como `pending_sent`, entao a resposta e identica a de
      // um pedido nao respondido.
      //
      // `connection_resting` so sobra quando a linha NAO se projeta e ainda nao
      // morreu: recusa fria dentro dos 90 dias, vista por quem PEDIU depois de a
      // validade de 30 dias passar. Ele nao conta nada que o descanso nao conte
      // sozinho, e nao distingue quem recusou de quem nunca respondeu -- a linha
      // de quem nunca respondeu ja morreu aos 30 dias e cai no caminho de cima.
      const projetada = projetarConexao(existente, agora, comoIso);
      if (projetada !== undefined) return projetada;
      recusaLegivel('connection_resting', 'invite_token');
    }

    const [deQuemPede, conexoesDoAlvo] = await Promise.all([
      this.deps.conexoes.contagens(contexto.userId, agora),
      this.deps.conexoes.contarConexoes(convite.alvo),
    ]);
    const recusa = recusaDoPedido(deQuemPede, { conexoes: conexoesDoAlvo });
    if (recusa !== undefined) recusaLegivel(recusa, 'invite_token');

    const criada = await this.deps.conexoes.pedir({
      id: this.deps.ids.uuidv7(),
      ref: refDaAresta(this.deps.ids),
      quemPede: contexto.userId,
      alvo: convite.alvo,
      origem: convite.origem,
      agora,
    });
    // `undefined` aqui e a cláusula `WHERE` tendo barrado o que este arquivo
    // aprovou -- corrida, e nao estado novo. A recusa que a pessoa le e a mesma.
    if (criada === undefined) recusaLegivel('connection_exists', 'invite_token');

    await this.registrar(contexto, 'connection.requested', criada.ref, { origin: convite.origem });
    const projetada = projetarConexao(criada, agora, comoIso);
    if (projetada === undefined) throw problemas.naoEncontrado();
    return projetada;
  }

  /**
   * Aceitar. **Sem aceite não há conexão**, e este é o único caminho que a cria.
   *
   * Só o destinatário de um pendente vivo aceita, e os dois predicados estão no
   * `WHERE` — `ref` de aresta alheia, pendente expirado, pedido já aceito e par
   * bloqueado são o mesmo 404.
   */
  async aceitar(contexto: ContextoDoChamador, ref: string): Promise<ConexaoProjetada> {
    const agora = this.deps.clock.now();
    const aresta = await this.deps.conexoes.arestaPorRef(ref, contexto.userId, agora);
    if (aresta === undefined || aresta.souQuemPediu || aresta.estado !== 'pending') {
      throw problemas.naoEncontrado();
    }

    // **So a contagem de quem aceita e lida aqui, e isso e deliberado.** O teto
    // do OUTRO lado tambem vale -- aceitar cria a conexao para os dois --, mas
    // ler a contagem dele exigiria resolver a conta dele por aqui, e o `UserId`
    // do outro lado nao atravessa esta borda em nenhuma direcao. Quem cobra o
    // teto do outro lado e a clausula `WHERE` do `UPDATE`, que ja tem as duas
    // pontas da aresta; se ela barrar, a recusa legivel vem do `undefined`
    // abaixo. Dois niveis com alcances diferentes, de novo.
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

  /**
   * Recusar, cancelar ou desfazer — **uma operação, do lado de fora**.
   *
   * A resposta é vazia (204) nos três casos, e isso é o que mantém a recusa
   * silenciosa: um corpo que dissesse "recusado" seria o "ela recusou você" que
   * o desenho recusa. O que de fato aconteceu vai para a trilha, nunca para a
   * resposta.
   */
  async encerrar(contexto: ContextoDoChamador, ref: string): Promise<void> {
    const agora = this.deps.clock.now();
    const feito = await this.deps.conexoes.encerrar(ref, contexto.userId, agora);
    if (feito === undefined) throw problemas.naoEncontrado();
    await this.registrar(contexto, `connection.${feito}`, ref, {});
  }

  /** Os pedidos de uma das duas caixas. **Nunca a lista de conexões.** */
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
   * O resumo **do próprio dono**: só números.
   *
   * É o que permite a tela dizer "você tem 12 de 150" sem existir lista. A
   * contagem não diz **quem**, e é exatamente essa diferença que a torna
   * publicável onde a lista não é.
   */
  async resumo(contexto: ContextoDoChamador): Promise<ResumoDasConexoes> {
    const agora = this.deps.clock.now();
    const contagens = await this.deps.conexoes.contagens(contexto.userId, agora);
    const recebidos = await this.deps.conexoes.pedidos(contexto.userId, {
      direcao: 'received',
      pagina: 1,
      limite: 1,
      agora,
    });
    return {
      connected_count: contagens.conexoes,
      pending_sent_count: contagens.pendentesEnviados,
      requests_received_count: recebidos.total,
      remaining_requests_today: pedidosQueAindaCabemHoje(contagens),
      connection_limit: TETO_DE_CONEXOES,
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
      // `ref` da ARESTA, nunca a conta do outro lado: a trilha e lida por gente,
      // e trilha que nomeia o outro lado de uma recusa conta a recusa.
      resourceKind: 'user_connection',
      resourceId: ref,
      correlationId: contexto.correlationId,
      ...(contexto.ip === undefined ? {} : { actorIp: contexto.ip }),
      metadata: extra,
    });
  }
}
