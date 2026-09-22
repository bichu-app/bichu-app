/**
 * O serviço da conversa mediada.
 *
 * ## A ordem de `enviar`, que é a regra inteira em quatro linhas
 *
 *   1. ler a conversa **com o chamador no `WHERE`** — 404 se não for dele;
 *   2. recusar se ela não aceita mensagem (encerrada ou bloqueada);
 *   3. **redigir**, e só então gravar;
 *   4. contar, e reter para revisão quando for o caso.
 *
 * O passo 3 acontece antes do 4 de propósito: a mensagem que estoura o teto de
 * retenção **é gravada**, redigida, e a conversa é marcada. `hold_for_review`
 * não é recusa — recusar avisaria o remetente de que ele foi marcado, que é
 * ajudar o golpe a se corrigir (critérios 10 e 11).
 *
 * ## Por que a redação roda aqui e não na borda
 *
 * Porque ela precisa valer para **os dois sentidos** (critério 13), e um dos
 * dois sentidos não passa por rota nenhuma hoje: a mensagem de abertura carrega
 * o recado que o achador digitou no formulário do aviso, e esse texto está
 * gravado em claro em `found_reports.notes`, coluna que nasceu antes desta
 * história. Redigir na borda protegeria o caminho que já tem tela e deixaria
 * passar justamente o primeiro recado, que é o mais provável de conter um
 * telefone — a pessoa está com o animal na mão e quer resolver.
 */
import { problemas } from '../../../shared/http/errors.js';
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import { comoData } from '../../../shared/time/clock.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type {
  ConversaDoChamador,
  ConversationRepository,
  MensagemGravada,
  Pagina,
} from '../ports/conversation-repository.js';
import {
  aceitaMensagem,
  estadoDaConversa,
  participantesVisiveis,
  type EstadoDaConversa,
  type ParticipanteVisivel,
} from '../domain/conversa-mediada.js';
import { retencaoDestaMensagem } from '../domain/retencao-para-revisao.js';
import { codificarCursor } from '../domain/paginacao.js';
import {
  primeiraMensagemDoSistema,
  AVISO_DE_DADO_RETIRADO,
  type DadosDoAviso,
} from '../domain/primeira-mensagem.js';
import type {
  ConversationId,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../../shared/types/brands.js';

const VINTE_E_QUATRO_HORAS_EM_MS = 24 * 60 * 60 * 1000;

export interface Chamador {
  readonly userId: UserId;
  readonly correlationId?: string | undefined;
  readonly ip?: string | undefined;
}

/** A conversa como as rotas autenticadas a devolvem. Montada campo a campo. */
export interface ConversaVisivel {
  readonly id: ConversationId;
  readonly caseId: string | null;
  readonly petDisplayName: string;
  readonly status: EstadoDaConversa;
  readonly participants: readonly ParticipanteVisivel[];
  readonly messages: readonly MensagemGravada[];
  readonly nextCursor: string | null;
}

/** A página de `GET /v1/conversations`, com o cursor da próxima. */
export interface PaginaDeConversas {
  readonly items: readonly ConversaVisivel[];
  readonly nextCursor: string | null;
}

/** O que o aviso entrega ao abrir a conversa. */
export interface AvisoRegistrado {
  readonly foundReportId: FoundReportId;
  readonly petId: PetId;
  readonly nomeDoPet: string;
  readonly escaneadoEm: Instant;
  readonly rotuloDaArea: string | null;
  readonly recado: string | null;
  readonly achadorComConta: UserId | null;
  /**
   * O aviso anterior do mesmo achador, quando este foi agrupado. Presente,
   * a conversa daquele aviso recebe a mensagem nova em vez de nascer outra:
   * agrupar e abrir a segunda conversa são a mesma informação repartida em dois
   * lugares, e o tutor veria duas linhas para a mesma pessoa.
   */
  readonly avisoAnteriorId: FoundReportId | null;
}

export interface DependenciasDaConversa {
  readonly repositorio: ConversationRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

export class ConversationService {
  constructor(private readonly deps: DependenciasDaConversa) {}

  /**
   * Abre a conversa a partir de um aviso, ou anexa o aviso à que já existe.
   *
   * **É o único caminho de criação de conversa no sistema.** Não há rota que
   * crie uma, e o contrato não declara nenhuma: quem abre é sempre um
   * escaneamento de plaquinha, isto é, alguém que está com o animal na mão. Um
   * `POST /conversations` transformaria o produto em mensagem direta entre
   * desconhecidos, que é o que a própria história declara fora de escopo.
   */
  async abrirPorAviso(aviso: AvisoRegistrado): Promise<ConversationId | undefined> {
    const agora = this.deps.clock.now();
    const anterior =
      aviso.avisoAnteriorId === null
        ? undefined
        : await this.deps.repositorio.porAviso(aviso.avisoAnteriorId);

    let conversa: ConversationId;
    if (anterior === undefined) {
      const id = this.deps.ids.uuidv7() as ConversationId;
      await this.deps.repositorio.abrirPorAviso({
        id,
        foundReportId: aviso.foundReportId,
        petId: aviso.petId,
        achadorComConta: aviso.achadorComConta,
      });
      const gravada = await this.deps.repositorio.porAviso(aviso.foundReportId);
      // `undefined` aqui significa que o pet sumiu entre o aviso e a abertura
      // (exclusão lógica). Não é erro do chamador, e inventar uma conversa sem
      // pet seria gravar uma linha que nenhuma tela consegue abrir.
      if (gravada === undefined) return undefined;
      conversa = gravada;
      await this.deps.trilha.record({
        actorKind: aviso.achadorComConta === null ? 'anonymous' : 'user',
        ...(aviso.achadorComConta === null ? {} : { actorUserId: aviso.achadorComConta }),
        action: 'conversation.opened',
        resourceKind: 'conversation',
        resourceId: conversa,
      });
    } else {
      conversa = anterior;
    }

    await this.gravarAbertura(conversa, aviso, agora);
    return conversa;
  }

  /**
   * `GET /v1/conversations` — as conversas de quem chamou, dos dois lados.
   *
   * **Cada item vem com `messages: []`**, e isso precisa estar dito em voz alta
   * em vez de descoberto na tela: a lista carrega cabeçalho, e trazer as
   * mensagens de cada linha seria N+1 na tela que o tutor abre com o telefone
   * tocando. Quem precisa da prévia da última mensagem abre a conversa. O
   * contrato exige o campo presente, e `[]` é o valor verdadeiro para esta
   * vista — não "esta conversa está vazia", e sim "esta vista não as carrega".
   */
  async listar(chamador: Chamador, pagina: Pagina): Promise<PaginaDeConversas> {
    const conversas = await this.deps.repositorio.listarDoChamador(chamador.userId, pagina);
    return {
      items: conversas.map((c) => this.comoVisivel(c, [], null)),
      nextCursor: proximoDaLista(conversas, pagina.limit),
    };
  }

  /** `GET /v1/conversations/{id}` — a conversa e as mensagens. */
  async buscar(
    conversa: ConversationId,
    chamador: Chamador,
    pagina: Pagina,
  ): Promise<ConversaVisivel> {
    const encontrada = await this.exigirDoChamador(conversa, chamador);
    const mensagens = await this.deps.repositorio.mensagens(conversa, chamador.userId, pagina);
    return this.comoVisivel(encontrada, mensagens, proximoCursor(mensagens, pagina.limit));
  }

  /**
   * `POST /v1/conversations/{id}/messages`.
   *
   * Devolve a mensagem **já redigida**, com `redactions` preenchido, para a
   * interface explicar o que saiu em vez de o remetente achar que o texto sumiu
   * sozinho. O critério 16 acrescenta o aviso do sistema quando o próprio tutor
   * escreve o endereço dele: proteger só um lado deixa a casa do tutor exposta
   * por iniciativa dele mesmo.
   */
  async enviar(
    conversa: ConversationId,
    texto: string,
    chamador: Chamador,
  ): Promise<MensagemGravada> {
    const encontrada = await this.exigirDoChamador(conversa, chamador);
    if (!aceitaMensagem(estadoDaConversa(sinaisDe(encontrada)))) {
      throw problemas.conversaEncerrada();
    }

    const redigido = redigirCanalMediado(texto);
    const gravada = await this.deps.repositorio.gravarMensagem({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa,
      senderRole: encontrada.papelDoChamador,
      senderUserId: chamador.userId,
      body: redigido.texto,
      redactions: redigido.retirados,
    });

    if (redigido.retirados.length > 0) {
      await this.deps.repositorio.gravarMensagemDeSistema({
        id: this.deps.ids.uuidv7(),
        conversationId: conversa,
        body: AVISO_DE_DADO_RETIRADO,
        redactions: [],
      });
    }

    await this.avaliarRetencao(conversa, encontrada, chamador);
    return gravada;
  }

  /** A conversa do chamador, ou 404. Nunca 403 (ADR-0021). */
  private async exigirDoChamador(
    conversa: ConversationId,
    chamador: Chamador,
  ): Promise<ConversaDoChamador> {
    const encontrada = await this.deps.repositorio.buscarDoChamador(conversa, chamador.userId);
    if (encontrada === undefined) throw problemas.naoEncontrado();
    return encontrada;
  }

  /** A mensagem de abertura, com o recado já redigido (critério 2). */
  private async gravarAbertura(
    conversa: ConversationId,
    aviso: AvisoRegistrado,
    agora: Instant,
  ): Promise<void> {
    const dados: DadosDoAviso = {
      nomeDoPet: aviso.nomeDoPet,
      escaneadoEm: comoData(aviso.escaneadoEm),
      agora: comoData(agora),
      rotuloDaArea: aviso.rotuloDaArea,
      recado: aviso.recado,
    };
    const mensagem = primeiraMensagemDoSistema(dados);
    await this.deps.repositorio.gravarMensagemDeSistema({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa,
      body: mensagem.texto,
      redactions: mensagem.retirados,
    });
  }

  /**
   * Os dois tetos de `hold_for_review`, que a borda declara não aplicar.
   *
   * Ela está certa em não aplicar: `hold_for_review` não é recusa, e
   * `counts: distinct_cases` conta casos, que a porta `RateLimitStore` não sabe
   * contar. O que ela não pode é ficar calada, e não fica —
   * `inventariarNaoAplicaveis` devolve as duas entradas com o motivo e a subida
   * imprime a lista. É este método que as torna verdade.
   */
  private async avaliarRetencao(
    conversa: ConversationId,
    encontrada: ConversaDoChamador,
    chamador: Chamador,
  ): Promise<void> {
    const agora = this.deps.clock.now();
    const desde = (agora - VINTE_E_QUATRO_HORAS_EM_MS) as Instant;

    const [mensagens, casos] = await Promise.all([
      this.deps.repositorio.contarMensagensDoParticipante(
        conversa,
        encontrada.papelDoChamador,
        desde,
      ),
      this.deps.repositorio.contarCasosDistintosDaConta(chamador.userId, desde),
    ]);

    const motivo = retencaoDestaMensagem({
      mensagensDoParticipante: mensagens,
      casosDistintosDaConta: casos,
    });
    if (motivo === null) return;

    await this.deps.repositorio.reterParaRevisao(conversa, motivo, agora);
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      ...(chamador.correlationId === undefined
        ? {}
        : { correlationId: chamador.correlationId }),
      ...(chamador.ip === undefined ? {} : { actorIp: chamador.ip }),
      action: 'conversation.held_for_review',
      resourceKind: 'conversation',
      resourceId: conversa,
      // O motivo, nunca o texto. A trilha sobrevive à exclusão da conta.
      metadata: { reason: motivo },
    });
  }

  /**
   * A conversa na forma que sai do servidor, campo a campo.
   *
   * Lista explícita e não espalhamento do objeto do repositório: `tutor_user_id`
   * e `held_for_review_at` existem do lado de dentro, e um `...conversa` os
   * publicaria por omissão — o primeiro fere o item 6 do ADR-0010, o segundo
   * avisa o golpista de que ele foi marcado.
   */
  private comoVisivel(
    conversa: ConversaDoChamador,
    mensagens: readonly MensagemGravada[],
    nextCursor: string | null,
  ): ConversaVisivel {
    return {
      id: conversa.id,
      caseId: conversa.caseId,
      petDisplayName: conversa.petDisplayName,
      status: estadoDaConversa(sinaisDe(conversa)),
      participants: participantesVisiveis({
        nomeDoTutor: conversa.nomeDoTutor,
        nomeDoAchador: conversa.nomeDoAchador,
      }),
      messages: mensagens,
      nextCursor,
    };
  }
}

function sinaisDe(conversa: ConversaDoChamador): {
  encerradaEm: Date | null;
  bloqueadaEm: Date | null;
  casoEncerrado: boolean;
} {
  return {
    encerradaEm: conversa.encerradaEm,
    bloqueadaEm: conversa.bloqueadaEm,
    casoEncerrado: conversa.casoEncerrado,
  };
}

/** O cursor da lista sai de `opened_at`, que é por onde ela ordena. */
function proximoDaLista(
  conversas: readonly ConversaDoChamador[],
  limite: number,
): string | null {
  if (conversas.length < limite) return null;
  const ultima = conversas[conversas.length - 1];
  if (ultima === undefined) return null;
  return codificarCursor({ criadaEm: ultima.abertaEm, id: ultima.id });
}

/** Só há próxima página quando a atual encheu. Página curta é o fim da lista. */
function proximoCursor(mensagens: readonly MensagemGravada[], limite: number): string | null {
  if (mensagens.length < limite) return null;
  const ultima = mensagens[mensagens.length - 1];
  if (ultima === undefined) return null;
  return codificarCursor({ criadaEm: ultima.createdAt, id: ultima.id });
}
