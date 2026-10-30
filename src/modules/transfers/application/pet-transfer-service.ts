/**
 * A transferencia de pet: as quatro camadas do contrato, e a decisao que nem a
 * BICHUS-66 nem a BICHUS-21 tinham previsto.
 */
import { problemas } from '../../../shared/http/errors.js';
import { hashDeToken } from '../../../shared/crypto/digest.js';
import { comoIso } from '../../../shared/time/clock.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, JobQueue } from '../../../shared/ports/index.js';
import type { Mailer } from '../../identity/ports/mailer.js';
import {
  instanteDaConsumacao,
  instanteDoVencimentoDoConvite,
  mascararEmail,
  podeCancelar,
  type MotivoDoCancelamento,
} from '../domain/janela-da-transferencia.js';
import type {
  TransferId,
  TransferRepository,
  TransferenciaGravada,
  TransferenciaPorTokenDeCancelamento,
} from '../ports/transfer-repository.js';
import type { Instant, PetId, UserId } from '../../../shared/types/brands.js';

/** O que o servico precisa saber sobre quem chama, e nada alem. */
export interface ContextoDoChamador {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip: string | undefined;
}

/** O canal de contato **verificado** do chamador, para a camada 2. */
export interface EmailVerificadoDoChamador {
  /** `undefined` quando a conta nao tem e-mail verificado. */
  emailVerificadoDe(conta: UserId): Promise<string | undefined>;
}

/** Como o pet se chama, para o texto dos e-mails. */
export interface NomeDoPet {
  nomeDe(pet: PetId): Promise<string | undefined>;
}

export interface DependenciasDeTransferencia {
  readonly repositorio: TransferRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
  readonly mailer: Mailer;
  readonly contas: EmailVerificadoDoChamador;
  readonly pets: NomeDoPet;
  /** So para AGENDAR a consumacao. */
  readonly fila: JobQueue;
  readonly baseDaWeb: string;
}

/** Normaliza o endereco **antes** de qualquer conferencia ou comparacao. */
function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

export class PetTransferService {
  constructor(private readonly deps: DependenciasDeTransferencia) {}

  /** Camada 3: o convite sai, e o token existe so na caixa de entrada dele. */
  async iniciar(
    pet: PetId,
    emailDoDestinatario: string,
    chamador: ContextoDoChamador,
  ): Promise<TransferenciaGravada> {
    const destinatario = normalizarEmail(emailDoDestinatario);

    const meu = await this.deps.contas.emailVerificadoDe(chamador.userId);
    if (meu !== undefined && normalizarEmail(meu) === destinatario) {
      throw problemas.validacao([
        {
          field: 'recipient_email',
          code: 'conflict',
          message: 'Este e o seu proprio e-mail. Escolha para quem o pet vai.',
        },
      ]);
    }

    const agora = this.deps.clock.now();
    const tokenBruto = this.deps.ids.opaqueToken();

    const resultado = await this.deps.repositorio.abrir(
      {
        id: this.deps.ids.uuidv7() as TransferId,
        petId: pet,
        fromUserId: chamador.userId,
        recipientEmail: destinatario,
        inviteTokenHash: hashDeToken(tokenBruto),
        inviteExpiresAt: instanteDoVencimentoDoConvite(agora),
      },
      agora,
    );

    if (resultado.tipo === 'pet_nao_e_deste_tutor') throw problemas.naoEncontrado();
    if (resultado.tipo === 'ja_em_andamento') throw problemas.transferenciaEmAndamento();
    if (resultado.tipo === 'caso_aberto') throw problemas.transferenciaComCasoAberto();

    const nome = (await this.deps.pets.nomeDe(pet)) ?? 'seu pet';
    const base = this.deps.baseDaWeb.replace(/\/$/, '');

    await this.deps.mailer.enviar({
      para: destinatario,
      assunto: `Voce foi convidado a ser o tutor de ${nome} no Bichu`,
      corpo:
        `Alguem quer transferir ${nome} para voce no Bichu.\n\n` +
        `Para aceitar, abra:\n\n${base}/transferencia?token=${tokenBruto}\n\n` +
        `Se voce ainda nao tem conta, a propria pagina te leva para criar uma. ` +
        `Voce precisa confirmar este mesmo e-mail antes de aceitar.\n\n` +
        `O convite vale por 72 horas. Depois de aceitar, o tutor atual ainda ` +
        `tem 24 horas para desistir; so depois disso ${nome} passa a ser seu.\n\n` +
        `Se voce nao esperava este convite, ignore esta mensagem.`,
    });

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet_transfer.started',
      actorUserId: chamador.userId,
      resourceKind: 'pet_transfer',
      resourceId: resultado.transferencia.id,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
      metadata: { pet_id: pet, recipient_email_masked: mascararEmail(destinatario) },
    });

    return resultado.transferencia;
  }

  /** O cancelamento de dentro do app. */
  async cancelarPeloTutor(
    transferencia: TransferId,
    chamador: ContextoDoChamador,
  ): Promise<TransferenciaGravada> {
    const atual = await this.deps.repositorio.buscarDoTutor(transferencia, chamador.userId);
    if (atual === undefined) throw problemas.naoEncontrado();

    const agora = this.deps.clock.now();
    if (!podeCancelar(comoEstado(atual), agora)) throw problemas.transferenciaJaConsumada();

    const cancelada = await this.deps.repositorio.cancelar({
      transferencia,
      motivo: 'current_owner',
      quando: agora,
      consumirTokenDeCancelamento: true,
    });
    if (cancelada === undefined) throw problemas.transferenciaJaConsumada();

    await this.avisarCancelamento(cancelada, 'current_owner');
    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet_transfer.cancelled',
      actorUserId: chamador.userId,
      resourceKind: 'pet_transfer',
      resourceId: cancelada.id,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
      metadata: { reason: 'current_owner' },
    });

    return cancelada;
  }

  /**
   * Camada 2 em uma funcao: o token abre a porta, o e-mail verificado decide de quem
   * ela e.
   */
  async aceitar(tokenBruto: string, chamador: ContextoDoChamador): Promise<TransferenciaGravada> {
    const convite = await this.deps.repositorio.buscarPorTokenDeConvite(hashDeToken(tokenBruto));
    const agora = this.deps.clock.now();

    if (convite === undefined) throw problemas.tokenDeVerificacaoVencido();
    if (convite.status !== 'pending_acceptance') throw problemas.tokenDeVerificacaoVencido();
    if (agora >= (convite.inviteExpiresAt.getTime() as Instant)) {
      throw problemas.tokenDeVerificacaoVencido();
    }

    const meu = await this.deps.contas.emailVerificadoDe(chamador.userId);
    if (meu === undefined || normalizarEmail(meu) !== convite.recipientEmail) {
      throw problemas.transferenciaNaoEDestaConta();
    }

    const cancelToken = this.deps.ids.opaqueToken();
    const efetivaEm = instanteDaConsumacao(agora);

    const resultado = await this.deps.repositorio.registrarAceite({
      transferencia: convite.id,
      toUserId: chamador.userId,
      cancelTokenHash: hashDeToken(cancelToken),
      acceptedAt: agora,
      effectiveAt: efetivaEm,
    });
    if (resultado.tipo === 'estado_mudou') throw problemas.tokenDeVerificacaoVencido();

    await this.deps.fila.enqueue('case.transfer_consummate', { transferId: convite.id }, efetivaEm);

    const nome = (await this.deps.pets.nomeDe(convite.petId)) ?? 'o pet';
    const base = this.deps.baseDaWeb.replace(/\/$/, '');
    const quando = comoIso(efetivaEm);

    const tutor = await this.deps.contas.emailVerificadoDe(convite.fromUserId);
    if (tutor !== undefined) {
      await this.deps.mailer.enviar({
        para: tutor,
        assunto: `A transferencia de ${nome} foi aceita. Voce tem 24 horas para desistir`,
        corpo:
          `Quem voce convidou aceitou receber ${nome}.\n\n` +
          `A partir de ${quando} o cadastro passa para a outra pessoa e as ` +
          `plaquinhas de QR de ${nome} param de funcionar para sempre.\n\n` +
          `Se isso nao era para acontecer, desfaca aqui, sem precisar entrar na conta:\n\n` +
          `${base}/transferencia/cancelar?token=${cancelToken}\n\n` +
          `Ate esse horario nada foi desativado.`,
      });
    }

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet_transfer.accepted',
      actorUserId: chamador.userId,
      resourceKind: 'pet_transfer',
      resourceId: convite.id,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
      metadata: { pet_id: convite.petId, effective_at: quando },
    });

    return resultado.transferencia;
  }

  /** A leitura publica da tela de cancelamento. */
  async verPorTokenDeCancelamento(tokenBruto: string): Promise<TransferenciaPorTokenDeCancelamento> {
    const achada = await this.deps.repositorio.buscarPorTokenDeCancelamento(
      hashDeToken(tokenBruto),
    );
    if (achada === undefined) throw problemas.tokenDeVerificacaoVencido();
    if (!podeCancelar(comoEstado(achada), this.deps.clock.now())) {
      throw problemas.tokenDeVerificacaoVencido();
    }
    return achada;
  }

  /** O cancelamento pelo link do e-mail. */
  async cancelarPorToken(tokenBruto: string): Promise<void> {
    const achada = await this.deps.repositorio.buscarPorTokenDeCancelamento(
      hashDeToken(tokenBruto),
    );
    if (achada === undefined) throw problemas.tokenDeVerificacaoVencido();

    const agora = this.deps.clock.now();
    const cancelada = await this.deps.repositorio.cancelar({
      transferencia: achada.id,
      motivo: 'cancel_token',
      quando: agora,
      consumirTokenDeCancelamento: true,
    });
    if (cancelada === undefined) throw problemas.tokenDeVerificacaoVencido();

    await this.avisarCancelamento(cancelada, 'cancel_token');
    await this.deps.trilha.record({
      actorKind: 'anonymous',
      action: 'pet_transfer.cancelled',
      resourceKind: 'pet_transfer',
      resourceId: cancelada.id,
      metadata: { reason: 'cancel_token' },
    });
  }

  /** O pet foi marcado como perdido. */
  async cancelarPorCasoAberto(pet: PetId): Promise<void> {
    const cancelada = await this.deps.repositorio.cancelarVivaDoPet({
      pet,
      motivo: 'lost_case_opened',
      quando: this.deps.clock.now(),
    });
    if (cancelada === undefined) return;

    await this.avisarCancelamento(cancelada, 'lost_case_opened');
    await this.deps.trilha.record({
      actorKind: 'system',
      action: 'pet_transfer.cancelled',
      resourceKind: 'pet_transfer',
      resourceId: cancelada.id,
      metadata: { reason: 'lost_case_opened', pet_id: pet },
    });
  }

  /** A consumacao, chamada pelo worker quando o trabalho agendado vence. */
  async consumar(transferencia: TransferId): Promise<ResultadoDaTentativaDeConsumar> {
    const agora = this.deps.clock.now();
    const resultado = await this.deps.repositorio.consumar(transferencia, agora);

    if (resultado.tipo === 'ja_resolvida') return { tipo: 'nada_a_fazer' };
    if (resultado.tipo === 'ainda_na_janela') {
      return { tipo: 'reagendar', para: resultado.effectiveAt.getTime() as Instant };
    }

    if (resultado.tipo === 'caso_aberto' || resultado.tipo === 'destinatario_sumiu') {
      const motivo: MotivoDoCancelamento =
        resultado.tipo === 'caso_aberto' ? 'lost_case_opened' : 'recipient_gone';
      const cancelada = await this.deps.repositorio.cancelar({
        transferencia,
        motivo,
        quando: agora,
        consumirTokenDeCancelamento: true,
      });
      if (cancelada !== undefined) {
        await this.avisarCancelamento(cancelada, motivo);
        await this.deps.trilha.record({
          actorKind: 'system',
          action: 'pet_transfer.cancelled',
          resourceKind: 'pet_transfer',
          resourceId: cancelada.id,
          metadata: { reason: motivo },
        });
      }
      return { tipo: 'cancelada', motivo };
    }

    const nome = (await this.deps.pets.nomeDe(resultado.transferencia.petId)) ?? 'o pet';
    for (const [conta, assunto, corpo] of [
      [
        resultado.transferencia.fromUserId,
        `${nome} nao esta mais na sua conta`,
        `A transferencia de ${nome} se concluiu. O cadastro agora e da outra pessoa, ` +
          `e as plaquinhas de QR antigas foram desativadas e nao voltam a funcionar.`,
      ],
      [
        resultado.transferencia.toUserId,
        `${nome} agora e seu no Bichu`,
        `A transferencia se concluiu e ${nome} esta na sua conta.\n\n` +
          `As plaquinhas antigas foram desativadas: emita uma nova pelo app e ` +
          `troque a da coleira. Ate la, o QR antigo nao leva a lugar nenhum.`,
      ],
    ] as const) {
      if (conta === null) continue;
      const para = await this.deps.contas.emailVerificadoDe(conta);
      if (para === undefined) continue;
      await this.deps.mailer.enviar({ para, assunto, corpo });
    }

    await this.deps.trilha.record({
      actorKind: 'system',
      action: 'pet_transfer.consummated',
      resourceKind: 'pet_transfer',
      resourceId: resultado.transferencia.id,
      metadata: {
        pet_id: resultado.transferencia.petId,
        tags_revoked: resultado.tagsRevogadas,
      },
    });

    return { tipo: 'consumada', tagsRevogadas: resultado.tagsRevogadas };
  }

  /**
   * O aviso dos dois lados. Nunca lanca: um transporte fora do ar nao pode desfazer
   * um cancelamento que ja esta gravado.
   */
  private async avisarCancelamento(
    transferencia: TransferenciaGravada,
    motivo: MotivoDoCancelamento,
  ): Promise<void> {
    const nome = (await this.deps.pets.nomeDe(transferencia.petId)) ?? 'o pet';
    const explicacao =
      motivo === 'lost_case_opened'
        ? `${nome} foi marcado como perdido, entao a transferencia foi desfeita. ` +
          `As plaquinhas de QR continuam funcionando -- e por elas que quem ` +
          `encontrar o animal chega ao tutor. Quando o caso for encerrado, da ` +
          `para transferir de novo.`
        : motivo === 'recipient_gone'
          ? `A transferencia de ${nome} foi desfeita porque a conta que a aceitou ` +
            `deixou de existir. Nada foi desativado.`
          : `A transferencia de ${nome} foi desfeita. Nada foi desativado e as ` +
            `plaquinhas continuam funcionando.`;

    for (const conta of [transferencia.fromUserId, transferencia.toUserId]) {
      if (conta === null) continue;
      const para = await this.deps.contas.emailVerificadoDe(conta);
      if (para === undefined) continue;
      try {
        await this.deps.mailer.enviar({
          para,
          assunto: `A transferencia de ${nome} foi desfeita`,
          corpo: explicacao,
        });
      } catch {
        continue;
      }
    }
  }
}

export type ResultadoDaTentativaDeConsumar =
  | { readonly tipo: 'consumada'; readonly tagsRevogadas: number }
  | { readonly tipo: 'cancelada'; readonly motivo: MotivoDoCancelamento }
  | { readonly tipo: 'reagendar'; readonly para: Instant }
  | { readonly tipo: 'nada_a_fazer' };

function comoEstado(t: {
  readonly status: TransferenciaGravada['status'];
  readonly effectiveAt: Date | null;
}): { status: TransferenciaGravada['status']; inviteExpiresAt: Instant; effectiveAt: Instant | null } {
  return {
    status: t.status,
    inviteExpiresAt: 0 as Instant,
    effectiveAt: t.effectiveAt === null ? null : (t.effectiveAt.getTime() as Instant),
  };
}
