/** O serviço da conversa mediada. */
import { problemas } from '../../../shared/http/errors.js';
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import { comoData } from '../../../shared/time/clock.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type {
  ConversaDoChamador,
  ConversationRepository,
  EspecieDoSistema,
  MensagemGravada,
  MotivoDaDenuncia,
  Pagina,
  PaginaDaLista,
} from '../ports/conversation-repository.js';
import {
  aceitaMensagem,
  estadoDaConversa,
  participantesVisiveis,
  previaDaMensagem,
  type EstadoDaConversa,
  type Papel,
  type ParticipanteVisivel,
  type SinaisDeEstado,
} from '../domain/conversa-mediada.js';
import { retencaoDestaMensagem } from '../domain/retencao-para-revisao.js';
import { chaveHigienizadaOuRecusa } from '../domain/foto-anexada.js';
import { fotoAlcancaOutroLado } from '../domain/leitura-da-foto.js';
import type { FotoDaConversa } from '../ports/foto-da-conversa.js';
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

/** A conversa como as rotas autenticadas a devolvem. */
export interface ConversaVisivel {
  readonly id: ConversationId;
  /** O aviso que abriu a conversa. */
  readonly foundReportId: string;
  /** Uma foto que ESTE chamador enviar chega a ser lida pelo outro lado? */
  readonly fotoAlcancaOutroLado: boolean;
  readonly caseId: string | null;
  readonly petDisplayName: string;
  readonly status: EstadoDaConversa;
  /** O PAPEL DE QUEM CHAMOU nesta conversa (`Conversation.viewer_role`). */
  readonly papelDoChamador: Exclude<Papel, 'system'>;
  readonly participants: readonly ParticipanteVisivel[];
  readonly messages: readonly MensagemGravada[];
  readonly nextCursor: string | null;
  /** `Conversation.unread` do contrato. */
  readonly naoLida: boolean;
  /** `Conversation.last_message_preview`, já cortado pelo domínio. */
  readonly previaDaUltima: string | null;
  readonly ultimaMensagemEm: Date | null;
}

/** A página de `GET /v1/conversations`, com o cursor da próxima. */
export interface PaginaDeConversas {
  readonly items: readonly ConversaVisivel[];
  readonly nextCursor: string | null;
  /** `ConversationPage.unread_count` do contrato: o contador do sino. */
  readonly naoLidas: number;
  /** `ConversationPage.total`: quantas conversas o RECORTE tem no servidor. */
  readonly total: number;
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
  /** O aviso anterior do mesmo achador, quando este foi agrupado. */
  readonly avisoAnteriorId: FoundReportId | null;
  /** Que AVISO é este (BICHUS-278): plaquinha lida, ou achado confirmado. */
  readonly especie: EspecieDoAviso;
}

/** As duas espécies de AVISO. */
export type EspecieDoAviso = Extract<EspecieDoSistema, 'scan_notice' | 'found_notice'>;

export interface DependenciasDaConversa {
  readonly repositorio: ConversationRepository;
  /** A resolução da foto anexada. */
  readonly fotos: FotoDaConversa;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

export class ConversationService {
  constructor(private readonly deps: DependenciasDaConversa) {}

  /** Abre a conversa a partir de um aviso, ou anexa o aviso à que já existe. */
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
      if (gravada === undefined) return undefined;
      conversa = gravada;
      await this.deps.trilha.record({
        ...(aviso.achadorComConta === null
          ? { actorKind: 'anonymous' as const }
          : { actorKind: 'user' as const, actorUserId: aviso.achadorComConta }),
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

  /** `GET /v1/conversations` — as conversas de quem chamou, dos dois lados. */
  async listar(chamador: Chamador, pagina: PaginaDaLista): Promise<PaginaDeConversas> {
    const [conversas, naoLidas, total] = await Promise.all([
      this.deps.repositorio.listarDoChamador(chamador.userId, pagina),
      this.deps.repositorio.contarParaOSino(chamador.userId),
      this.deps.repositorio.contarDoChamador(chamador.userId, pagina.termo),
    ]);
    return {
      items: conversas.map((c) => this.comoVisivel(c, [], null)),
      nextCursor: proximoDaLista(conversas, pagina.limit),
      total,
      naoLidas,
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
    if (pagina.depoisDe === undefined) {
      await this.deps.repositorio.marcarConversaLida(
        conversa,
        chamador.userId,
        this.deps.clock.now(),
      );
    }
    return this.comoVisivel(encontrada, mensagens, proximoCursor(mensagens, pagina.limit));
  }

  /** `POST /v1/conversations/{id}/messages`. */
  async enviar(
    conversa: ConversationId,
    texto: string,
    chamador: Chamador,
    /** O `photo_upload_id` do corpo, quando a pessoa anexou foto. */
    fotoUploadId?: string,
  ): Promise<MensagemGravada> {
    const encontrada = await this.exigirDoChamador(conversa, chamador);
    if (!aceitaMensagem(estadoDaConversa(sinaisDe(encontrada)))) {
      throw problemas.conversaEncerrada();
    }

    const chaveDaFoto =
      fotoUploadId === undefined
        ? null
        : chaveHigienizadaOuRecusa(
            await this.deps.fotos.porUploadId(conversa, chamador.userId, fotoUploadId),
            'photo_upload_id',
          );

    const redigido = redigirCanalMediado(texto);
    const gravada = await this.deps.repositorio.gravarMensagem({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa,
      senderRole: encontrada.papelDoChamador,
      senderUserId: chamador.userId,
      body: redigido.texto,
      redactions: redigido.retirados,
      photoObjectKey: chaveDaFoto,
    });

    if (redigido.retirados.length > 0) {
      await this.deps.repositorio.gravarMensagemDeSistema({
        id: this.deps.ids.uuidv7(),
        conversationId: conversa,
        body: AVISO_DE_DADO_RETIRADO,
        redactions: [],
        especie: 'redaction_warning',
      });
    }

    await this.avaliarRetencao(conversa, encontrada, chamador);
    return gravada;
  }

  /** `POST /v1/conversations/{id}/block` — o lado COM CONTA bloqueia a outra parte. */
  async bloquear(conversa: ConversationId, chamador: Chamador): Promise<void> {
    const encontrada = await this.exigirDoChamador(conversa, chamador);
    await this.deps.repositorio.bloquearPeloChamador(
      conversa,
      chamador.userId,
      this.deps.clock.now(),
    );
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      ...comoOrigem(chamador),
      action: 'conversation.blocked',
      resourceKind: 'conversation',
      resourceId: conversa,
      metadata: { by_role: encontrada.papelDoChamador },
    });
  }

  /** `POST /v1/conversations/{id}/report` — denúncia do lado COM CONTA. */
  async denunciar(
    conversa: ConversationId,
    motivo: MotivoDaDenuncia,
    detalhe: string | undefined,
    chamador: Chamador,
  ): Promise<void> {
    const encontrada = await this.exigirDoChamador(conversa, chamador);
    await this.deps.repositorio.registrarDenuncia({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa,
      papel: encontrada.papelDoChamador,
      motivo,
      detalhe: detalhe === undefined || detalhe.trim() === '' ? null : detalhe,
      agora: this.deps.clock.now(),
    });
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: chamador.userId,
      ...comoOrigem(chamador),
      action: 'conversation.reported',
      resourceKind: 'conversation',
      resourceId: conversa,
      metadata: { reason: motivo, reporter_role: encontrada.papelDoChamador },
    });
  }

  /**
   * O alvo da denúncia, para a dimensão `report_target` do teto: o par (conversa,
   * papel denunciado).
   */
  async alvoDaDenuncia(
    conversa: ConversationId,
    chamador: Chamador,
  ): Promise<string | undefined> {
    const encontrada = await this.deps.repositorio.buscarDoChamador(conversa, chamador.userId);
    if (encontrada === undefined) return undefined;
    return `${conversa}:${encontrada.papelDoChamador === 'tutor' ? 'finder' : 'tutor'}`;
  }

  /** A conversa do chamador, ou 404. */
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
      especie: aviso.especie,
    });
  }

  /** Os dois tetos de `hold_for_review`, que a borda declara não aplicar. */
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
      metadata: { reason: motivo },
    });
  }

  /** A conversa na forma que sai do servidor, campo a campo. */
  private comoVisivel(
    conversa: ConversaDoChamador,
    mensagens: readonly MensagemGravada[],
    nextCursor: string | null,
  ): ConversaVisivel {
    return {
      id: conversa.id,
      foundReportId: conversa.foundReportId,
      fotoAlcancaOutroLado: fotoAlcancaOutroLado(conversa),
      caseId: conversa.caseId,
      petDisplayName: conversa.petDisplayName,
      status: estadoDaConversa(sinaisDe(conversa)),
      papelDoChamador: conversa.papelDoChamador,
      participants: participantesVisiveis({
        nomeDoTutor: conversa.nomeDoTutor,
        nomeDoAchador: conversa.nomeDoAchador,
        tutorDesabilitado: conversa.tutorDesabilitado,
        achadorDesabilitado: conversa.achadorDesabilitado,
        papelDoChamador: conversa.papelDoChamador,
        apelidoDoOutro: conversa.apelidoDoOutro,
        chaveDaFotoDoOutro: conversa.chaveDaFotoDoOutro,
      }),
      messages: mensagens,
      nextCursor,
      naoLida: conversa.naoLida,
      previaDaUltima:
        conversa.corpoDaUltima === null ? null : previaDaMensagem(conversa.corpoDaUltima),
      ultimaMensagemEm: conversa.ultimaMensagemEm,
    };
  }

  /** `POST /v1/me/conversations-seen` -- a conta VIU a área de mensagens. */
  async marcarListaVista(chamador: Chamador): Promise<void> {
    await this.deps.repositorio.marcarListaVista(chamador.userId, this.deps.clock.now());
  }
}

function sinaisDe(conversa: ConversaDoChamador): SinaisDeEstado {
  return {
    encerradaEm: conversa.encerradaEm,
    bloqueadaEm: conversa.bloqueadaEm,
    casoEncerrado: conversa.casoEncerrado,
    participanteDesabilitado: conversa.tutorDesabilitado || conversa.achadorDesabilitado,
  };
}

/** O cursor da lista sai da CHAVE DA ORDEM, que é por onde ela ordena. */
function proximoDaLista(
  conversas: readonly ConversaDoChamador[],
  limite: number,
): string | null {
  if (conversas.length < limite) return null;
  const ultima = conversas[conversas.length - 1];
  if (ultima === undefined) return null;
  return codificarCursor({
    criadaEm: ultima.ultimaMensagemEm ?? ultima.abertaEm,
    id: ultima.id,
  });
}

/** Só há próxima página quando a atual encheu. */
function proximoCursor(mensagens: readonly MensagemGravada[], limite: number): string | null {
  if (mensagens.length < limite) return null;
  const ultima = mensagens[mensagens.length - 1];
  if (ultima === undefined) return null;
  return codificarCursor({ criadaEm: ultima.createdAt, id: ultima.id });
}

/** Correlação e IP, quando existem. */
function comoOrigem(chamador: Chamador): { correlationId?: string; actorIp?: string } {
  return {
    ...(chamador.correlationId === undefined ? {} : { correlationId: chamador.correlationId }),
    ...(chamador.ip === undefined ? {} : { actorIp: chamador.ip }),
  };
}
