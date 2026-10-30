/** A conversa de quem achou o pet e não tem conta (BICHUS-41). */
import { problemas } from '../../../shared/http/errors.js';
import { hashDeToken, iguaisEmTempoConstante } from '../../../shared/crypto/digest.js';
import { redigirCanalMediado, type TrechoRedigido } from '../../../shared/redaction/redigir.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type { Instant } from '../../../shared/types/brands.js';
import type {
  ConversaDoAchador,
  ConversationRepository,
  MensagemGravada,
  MotivoDaDenuncia,
} from '../ports/conversation-repository.js';
import {
  aceitaMensagem,
  estadoDaConversa,
  participantesVisiveis,
  type EstadoDaConversa,
  type ParticipanteVisivel,
} from '../domain/conversa-mediada.js';
import {
  codificarCursorDoAchador,
  tokenBemFormado,
  tokenDoAchadorVale,
} from '../domain/acesso-do-achador.js';
import { retencaoDestaMensagem } from '../domain/retencao-para-revisao.js';
import { AVISO_DE_DADO_RETIRADO } from '../domain/primeira-mensagem.js';
import { chaveHigienizadaOuRecusa } from '../domain/foto-anexada.js';
import type { FotoDaConversa } from '../ports/foto-da-conversa.js';

const VINTE_E_QUATRO_HORAS_EM_MS = 24 * 60 * 60 * 1000;

/** De onde veio o pedido, para a trilha. */
export interface OrigemDoPedido {
  readonly correlationId?: string | undefined;
  readonly ip?: string | undefined;
}

/** A conversa na forma que o achador vê. */
export interface ConversaParaOAchador {
  readonly petDisplayName: string;
  readonly status: EstadoDaConversa;
  readonly participants: readonly ParticipanteVisivel[];
  readonly messages: readonly MensagemParaOAchador[];
  readonly nextCursor: string | null;
}

/** `FinderMessage`: sem `id`, e sem a chave de objeto da foto. */
export interface MensagemParaOAchador {
  readonly senderRole: MensagemGravada['senderRole'];
  readonly body: string;
  readonly redactions: readonly TrechoRedigido[];
  /** A chave HIGIENIZADA da foto, ou `null`. */
  readonly photoObjectKey: string | null;
  readonly createdAt: Date;
}

/** O que o módulo `found` pede à conversa, sem enxergar o domínio dela. */
export type AcessoDoAchador =
  | { readonly situacao: 'recusado' }
  | { readonly situacao: 'vencido' }
  | { readonly situacao: 'valido'; readonly aceitaMensagem: boolean };

export interface DependenciasDaConversaDoAchador {
  readonly repositorio: ConversationRepository;
  readonly fotos: FotoDaConversa;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

interface Resolvida {
  readonly conversa: ConversaDoAchador;
  readonly resumo: Buffer;
}

export class ConversaDoAchadorService {
  constructor(private readonly deps: DependenciasDaConversaDoAchador) {}

  /** `GET /v1/finder/conversation`. */
  async ler(
    token: string,
    pagina: { readonly limit: number; readonly deslocamento: number },
  ): Promise<ConversaParaOAchador> {
    const { conversa, resumo } = await this.resolverValida(token);
    const mensagens = await this.deps.repositorio.mensagensPeloTokenDoAchador(resumo, pagina);
    return {
      petDisplayName: conversa.petDisplayName,
      status: estadoDe(conversa),
      participants: participantesVisiveis({
        nomeDoTutor: conversa.nomeDoTutor,
        nomeDoAchador: conversa.nomeDoAchador,
        tutorDesabilitado: conversa.tutorDesabilitado,
        achadorDesabilitado: conversa.achadorDesabilitado,
        papelDoChamador: 'finder',
        apelidoDoOutro: null,
        chaveDaFotoDoOutro: null,
      }),
      messages: mensagens.map(paraOAchador),
      nextCursor:
        mensagens.length < pagina.limit
          ? null
          : codificarCursorDoAchador(pagina.deslocamento + mensagens.length),
    };
  }

  /** `POST /v1/finder/conversation/messages`. */
  async enviar(
    token: string,
    texto: string,
    origem: OrigemDoPedido,
    /** O `photo_upload_ref` OPACO do corpo, quando o achador anexou foto. */
    fotoUploadRef?: string,
  ): Promise<MensagemParaOAchador> {
    const { conversa, resumo } = await this.resolverValida(token);
    if (!aceitaMensagem(estadoDe(conversa))) throw problemas.conversaEncerrada();

    const chaveDaFoto =
      fotoUploadRef === undefined
        ? null
        : chaveHigienizadaOuRecusa(
            await this.deps.fotos.pelaReferenciaDoAchador(resumo, fotoUploadRef),
            'photo_upload_ref',
          );

    const redigido = redigirCanalMediado(texto);
    const gravada = await this.deps.repositorio.gravarMensagem({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa.id,
      senderRole: 'finder',
      senderUserId: null,
      body: redigido.texto,
      redactions: redigido.retirados,
      photoObjectKey: chaveDaFoto,
    });

    if (redigido.retirados.length > 0) {
      await this.deps.repositorio.gravarMensagemDeSistema({
        id: this.deps.ids.uuidv7(),
        conversationId: conversa.id,
        body: AVISO_DE_DADO_RETIRADO,
        redactions: [],
        especie: 'redaction_warning',
      });
    }

    await this.avaliarRetencao(conversa, origem);
    return paraOAchador(gravada);
  }

  /** `POST /v1/finder/conversation/block`. */
  async bloquear(token: string, origem: OrigemDoPedido): Promise<void> {
    const { conversa, resumo } = await this.resolverValida(token);
    await this.deps.repositorio.bloquearPeloAchador(resumo, this.deps.clock.now());
    await this.deps.trilha.record({
      actorKind: 'anonymous',
      ...comoOrigem(origem),
      action: 'conversation.blocked',
      resourceKind: 'conversation',
      resourceId: conversa.id,
      metadata: { by_role: 'finder' },
    });
  }

  /** `POST /v1/finder/conversation/report`. */
  async denunciar(
    token: string,
    motivo: MotivoDaDenuncia,
    detalhe: string | undefined,
    origem: OrigemDoPedido,
  ): Promise<void> {
    const { conversa } = await this.resolverValida(token);
    await this.deps.repositorio.registrarDenuncia({
      id: this.deps.ids.uuidv7(),
      conversationId: conversa.id,
      papel: 'finder',
      motivo,
      detalhe: detalhe === undefined || detalhe.trim() === '' ? null : detalhe,
      agora: this.deps.clock.now(),
    });
    await this.deps.trilha.record({
      actorKind: 'anonymous',
      ...comoOrigem(origem),
      action: 'conversation.reported',
      resourceKind: 'conversation',
      resourceId: conversa.id,
      metadata: { reason: motivo, reporter_role: 'finder' },
    });
  }

  /**
   * O alvo da denúncia, para a dimensão `report_target` do teto: o par (conversa,
   * papel denunciado).
   */
  async alvoDaDenuncia(token: string): Promise<string | undefined> {
    try {
      const { conversa } = await this.resolverValida(token);
      return `${conversa.id}:tutor`;
    } catch {
      return undefined;
    }
  }

  /** Para o módulo `found`: a situação do token, sem lançar. */
  async acesso(token: string): Promise<AcessoDoAchador> {
    const resolvida = await this.resolver(token);
    if (resolvida === undefined) return { situacao: 'recusado' };
    if (!this.vale(resolvida.conversa)) return { situacao: 'vencido' };
    return { situacao: 'valido', aceitaMensagem: aceitaMensagem(estadoDe(resolvida.conversa)) };
  }

  /**
   * Para o módulo `found`: o recado de "Contar mais" entra na conversa como mensagem
   * do achador, redigido, pelo mesmo caminho de `enviar`.
   */
  async entregarRecado(token: string, recado: string, origem: OrigemDoPedido): Promise<string> {
    const mensagem = await this.enviar(token, recado, origem);
    return mensagem.body;
  }

  /** Passos 1 a 3 do cabeçalho. */
  private async resolver(token: string): Promise<Resolvida | undefined> {
    if (!tokenBemFormado(token)) return undefined;
    const resumo = hashDeToken(token);
    const conversa = await this.deps.repositorio.buscarPeloTokenDoAchador(resumo);
    if (conversa === undefined) return undefined;
    if (!iguaisEmTempoConstante(Buffer.from(conversa.resumoDoToken), resumo)) return undefined;
    return { conversa, resumo };
  }

  private vale(conversa: ConversaDoAchador): boolean {
    return tokenDoAchadorVale(
      { expiraEm: conversa.tokenExpiraEm, caso: conversa.caso },
      this.deps.clock.now(),
    );
  }

  /** Os quatro passos, lançando o problema que cada um responde. */
  private async resolverValida(token: string): Promise<Resolvida> {
    const resolvida = await this.resolver(token);
    if (resolvida === undefined) throw problemas.linkDoAchadorInvalido();
    if (!this.vale(resolvida.conversa)) throw problemas.acessoDoAchadorVencido();
    return resolvida;
  }

  /**
   * O teto de 200 mensagens em 24 h, que a borda declara e não aplica
   * (`hold_for_review`).
   */
  private async avaliarRetencao(conversa: ConversaDoAchador, origem: OrigemDoPedido): Promise<void> {
    const agora = this.deps.clock.now();
    const desde = (agora - VINTE_E_QUATRO_HORAS_EM_MS) as Instant;
    const mensagens = await this.deps.repositorio.contarMensagensDoParticipante(
      conversa.id,
      'finder',
      desde,
    );
    const motivo = retencaoDestaMensagem({
      mensagensDoParticipante: mensagens,
      casosDistintosDaConta: undefined,
    });
    if (motivo === null) return;

    await this.deps.repositorio.reterParaRevisao(conversa.id, motivo, agora);
    await this.deps.trilha.record({
      actorKind: 'anonymous',
      ...comoOrigem(origem),
      action: 'conversation.held_for_review',
      resourceKind: 'conversation',
      resourceId: conversa.id,
      metadata: { reason: motivo },
    });
  }
}

function estadoDe(conversa: ConversaDoAchador): EstadoDaConversa {
  return estadoDaConversa({
    encerradaEm: conversa.encerradaEm,
    bloqueadaEm: conversa.bloqueadaEm,
    casoEncerrado: conversa.caso !== null && !conversa.caso.aberto,
    participanteDesabilitado: conversa.tutorDesabilitado || conversa.achadorDesabilitado,
  });
}

/** Campo a campo: o `id` e a chave de objeto da mensagem ficam para trás. */
function paraOAchador(mensagem: MensagemGravada): MensagemParaOAchador {
  return {
    senderRole: mensagem.senderRole,
    body: mensagem.body,
    redactions: mensagem.redactions,
    photoObjectKey: mensagem.photoObjectKey,
    createdAt: mensagem.createdAt,
  };
}

function comoOrigem(origem: OrigemDoPedido): { correlationId?: string; actorIp?: string } {
  return {
    ...(origem.correlationId === undefined ? {} : { correlationId: origem.correlationId }),
    ...(origem.ip === undefined ? {} : { actorIp: origem.ip }),
  };
}
