import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type {
  ConviteResolvido,
  NovaTransferencia,
  ResultadoDaAbertura,
  ResultadoDaConsumacao,
  ResultadoDoAceite,
  TransferId,
  TransferRepository,
  TransferenciaGravada,
  TransferenciaPorTokenDeCancelamento,
} from '../../ports/transfer-repository.js';
import type {
  MotivoDoCancelamento,
  StatusDaTransferencia,
} from '../../domain/janela-da-transferencia.js';
import type { Instant, PetId, UserId } from '../../../../shared/types/brands.js';

/**
 * Os dois estados que ocupam a vaga do indice parcial
 * `pet_transfers_uma_viva_por_pet`.
 */
export const ESTADOS_VIVOS = ['pending_acceptance', 'accepted'] as const;

const RESUMO_QUEIMADO = Buffer.alloc(32);

const COLUNAS = [
  'pet_transfers.id',
  'pet_transfers.pet_id',
  'pet_transfers.from_user_id',
  'pet_transfers.to_user_id',
  'pet_transfers.recipient_email',
  'pet_transfers.status',
  'pet_transfers.invite_expires_at',
  'pet_transfers.accepted_at',
  'pet_transfers.effective_at',
  'pet_transfers.cancelled_at',
  'pet_transfers.cancellation_reason',
] as const;

const COLUNAS_DE_RETORNO = [
  'id',
  'pet_id',
  'from_user_id',
  'to_user_id',
  'recipient_email',
  'status',
  'invite_expires_at',
  'accepted_at',
  'effective_at',
  'cancelled_at',
  'cancellation_reason',
] as const;

interface Linha {
  id: string;
  pet_id: string;
  from_user_id: string;
  to_user_id: string | null;
  recipient_email: string;
  status: StatusDaTransferencia;
  invite_expires_at: Date;
  accepted_at: Date | null;
  effective_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: MotivoDoCancelamento | null;
}

function comoDominio(linha: Linha): TransferenciaGravada {
  return {
    id: linha.id as TransferId,
    petId: linha.pet_id as PetId,
    fromUserId: linha.from_user_id as UserId,
    toUserId: linha.to_user_id === null ? null : (linha.to_user_id as UserId),
    recipientEmail: linha.recipient_email,
    status: linha.status,
    inviteExpiresAt: linha.invite_expires_at,
    acceptedAt: linha.accepted_at,
    effectiveAt: linha.effective_at,
    cancelledAt: linha.cancelled_at,
    cancellationReason: linha.cancellation_reason,
  };
}

/** A busca vinculada da transferencia: `id` E `from_user_id`, juntos. */
export function construtorDaBuscaDoTutor(db: DbExecutor, t: string, dono: string) {
  return db
    .selectFrom('pet_transfers')
    .select([...COLUNAS])
    .where('pet_transfers.id', '=', t)
    .where('pet_transfers.from_user_id', '=', dono);
}

/** A conferencia do pet antes de abrir: `id` E `owner_user_id`, juntos. */
export function construtorDoPetDoTutor(db: DbExecutor, pet: string, dono: string) {
  return db
    .selectFrom('pets')
    .select('pets.id')
    .where('pets.id', '=', pet)
    .where('pets.owner_user_id', '=', dono)
    .where('pets.deleted_at', 'is', null);
}

/** O aceite, com as DUAS condicoes de estado no `WHERE`. */
export function construtorDoAceite(
  db: DbExecutor,
  entrada: {
    readonly transferencia: string;
    readonly toUserId: string;
    readonly cancelTokenHash: Uint8Array;
    readonly acceptedAt: Instant;
    readonly effectiveAt: Instant;
  },
) {
  return db
    .updateTable('pet_transfers')
    .set({
      to_user_id: entrada.toUserId,
      cancel_token_hash: Buffer.from(entrada.cancelTokenHash),
      status: 'accepted',
      accepted_at: new Date(entrada.acceptedAt),
      effective_at: new Date(entrada.effectiveAt),
      invite_token_hash: RESUMO_QUEIMADO,
    })
    .where('id', '=', entrada.transferencia)
    .where('status', '=', 'pending_acceptance')
    .where('invite_expires_at', '>', new Date(entrada.acceptedAt))
    .returning([...COLUNAS_DE_RETORNO]);
}

/** O cancelamento, condicionado a linha ainda estar viva. */
export function construtorDoCancelamento(
  db: DbExecutor,
  entrada: {
    readonly transferencia: string;
    readonly motivo: MotivoDoCancelamento;
    readonly quando: Instant;
    readonly consumirTokenDeCancelamento: boolean;
  },
) {
  return db
    .updateTable('pet_transfers')
    .set({
      status: 'cancelled',
      cancelled_at: new Date(entrada.quando),
      cancellation_reason: entrada.motivo,
      ...(entrada.consumirTokenDeCancelamento ? { cancel_token_hash: null } : {}),
    })
    .where('id', '=', entrada.transferencia)
    .where('status', 'in', [...ESTADOS_VIVOS])
    .returning([...COLUNAS_DE_RETORNO]);
}

/** A troca de dono, condicionada a o pet ainda ser de quem iniciou. */
export function construtorDaTrocaDeDono(
  db: DbExecutor,
  pet: string,
  deQuem: string,
  paraQuem: string,
  agora: Instant,
) {
  return db
    .updateTable('pets')
    .set({ owner_user_id: paraQuem, updated_at: new Date(agora) })
    .where('id', '=', pet)
    .where('owner_user_id', '=', deQuem)
    .where('deleted_at', 'is', null);
}

/** A revogacao de TODAS as tags ativas do pet, com `pet_transferred`. */
export function construtorDaRevogacaoDasTags(db: DbExecutor, pet: string, agora: Instant) {
  return db
    .updateTable('pet_tags')
    .set({
      status: 'revoked',
      revoked_at: new Date(agora),
      revocation_reason: 'pet_transferred',
      code_ciphertext: null,
    })
    .where('pet_id', '=', pet)
    .where('status', '=', 'active');
}

async function temCasoAberto(trx: DbExecutor, pet: string): Promise<boolean> {
  const caso = await trx
    .selectFrom('lost_cases')
    .select('lost_cases.id')
    .where('lost_cases.pet_id', '=', pet)
    .where('lost_cases.status', '=', 'open')
    .executeTakeFirst();
  return caso !== undefined;
}

export function criarTransferRepository(db: Db): TransferRepository {
  return {
    async abrir(nova: NovaTransferencia, agora: Instant): Promise<ResultadoDaAbertura> {
      return db.transaction().execute(async (trx): Promise<ResultadoDaAbertura> => {
        const pet = await construtorDoPetDoTutor(trx, nova.petId, nova.fromUserId)
          .forUpdate()
          .executeTakeFirst();
        if (pet === undefined) return { tipo: 'pet_nao_e_deste_tutor' };

        if (await temCasoAberto(trx, nova.petId)) return { tipo: 'caso_aberto' };

        const viva = await trx
          .selectFrom('pet_transfers')
          .select('pet_transfers.id')
          .where('pet_transfers.pet_id', '=', nova.petId)
          .where('pet_transfers.status', 'in', [...ESTADOS_VIVOS])
          .executeTakeFirst();
        if (viva !== undefined) return { tipo: 'ja_em_andamento' };

        const linha = await trx
          .insertInto('pet_transfers')
          .values({
            id: nova.id,
            pet_id: nova.petId,
            from_user_id: nova.fromUserId,
            recipient_email: nova.recipientEmail,
            invite_token_hash: Buffer.from(nova.inviteTokenHash),
            status: 'pending_acceptance',
            invite_expires_at: new Date(nova.inviteExpiresAt),
            created_at: new Date(agora),
          })
          .returning([...COLUNAS_DE_RETORNO])
          .executeTakeFirstOrThrow();

        return { tipo: 'aberta', transferencia: comoDominio(linha) };
      });
    },

    async buscarDoTutor(transferencia: TransferId, dono: UserId) {
      const linha = (await construtorDaBuscaDoTutor(
        db,
        transferencia,
        dono,
      ).executeTakeFirst()) as Linha | undefined;
      return linha === undefined ? undefined : comoDominio(linha);
    },

    async buscarPorTokenDeConvite(hash: Uint8Array): Promise<ConviteResolvido | undefined> {
      const linha = await db
        .selectFrom('pet_transfers')
        .select([
          'pet_transfers.id',
          'pet_transfers.pet_id',
          'pet_transfers.from_user_id',
          'pet_transfers.recipient_email',
          'pet_transfers.status',
          'pet_transfers.invite_expires_at',
        ])
        .where('pet_transfers.invite_token_hash', '=', Buffer.from(hash))
        .executeTakeFirst();
      if (linha === undefined) return undefined;
      return {
        id: linha.id as TransferId,
        petId: linha.pet_id as PetId,
        fromUserId: linha.from_user_id as UserId,
        recipientEmail: linha.recipient_email,
        status: linha.status,
        inviteExpiresAt: linha.invite_expires_at,
      };
    },

    async buscarPorTokenDeCancelamento(
      hash: Uint8Array,
    ): Promise<TransferenciaPorTokenDeCancelamento | undefined> {
      const linha = await db
        .selectFrom('pet_transfers')
        .innerJoin('pets', 'pets.id', 'pet_transfers.pet_id')
        .select([
          'pet_transfers.id',
          'pets.name as pet_name',
          'pet_transfers.status',
          'pet_transfers.effective_at',
          'pet_transfers.created_at',
        ])
        .where('pet_transfers.cancel_token_hash', '=', Buffer.from(hash))
        .executeTakeFirst();
      if (linha === undefined) return undefined;
      return {
        id: linha.id as TransferId,
        petDisplayName: linha.pet_name,
        status: linha.status,
        effectiveAt: linha.effective_at,
        requestedAt: linha.created_at,
      };
    },

    async registrarAceite(entrada): Promise<ResultadoDoAceite> {
      const linha = (await construtorDoAceite(db, entrada).executeTakeFirst()) as
        | Linha
        | undefined;
      if (linha === undefined) return { tipo: 'estado_mudou' };
      return { tipo: 'aceita', transferencia: comoDominio(linha) };
    },

    async cancelar(entrada): Promise<TransferenciaGravada | undefined> {
      const linha = (await construtorDoCancelamento(db, entrada).executeTakeFirst()) as
        | Linha
        | undefined;
      return linha === undefined ? undefined : comoDominio(linha);
    },

    async cancelarVivaDoPet(entrada): Promise<TransferenciaGravada | undefined> {
      const linha = (await db
        .updateTable('pet_transfers')
        .set({
          status: 'cancelled',
          cancelled_at: new Date(entrada.quando),
          cancellation_reason: entrada.motivo,
          cancel_token_hash: null,
        })
        .where('pet_id', '=', entrada.pet)
        .where('status', 'in', [...ESTADOS_VIVOS])
        .returning([...COLUNAS_DE_RETORNO])
        .executeTakeFirst()) as unknown as Linha | undefined;
      return linha === undefined ? undefined : comoDominio(linha);
    },

    async expirar(transferencia: TransferId, quando: Instant): Promise<boolean> {
      const r = await db
        .updateTable('pet_transfers')
        .set({ status: 'expired', cancel_token_hash: null })
        .where('id', '=', transferencia)
        .where('status', '=', 'pending_acceptance')
        .where('invite_expires_at', '<=', new Date(quando))
        .executeTakeFirst();
      return Number(r.numUpdatedRows) > 0;
    },

    async consumar(transferencia: TransferId, agora: Instant): Promise<ResultadoDaConsumacao> {
      return db.transaction().execute(async (trx): Promise<ResultadoDaConsumacao> => {
        const linha = (await trx
          .selectFrom('pet_transfers')
          .select([...COLUNAS])
          .where('pet_transfers.id', '=', transferencia)
          .forUpdate()
          .executeTakeFirst()) as Linha | undefined;

        if (linha === undefined) return { tipo: 'ja_resolvida' };
        if (linha.status !== 'accepted') return { tipo: 'ja_resolvida' };
        if (linha.effective_at === null) return { tipo: 'ja_resolvida' };
        if (agora < linha.effective_at.getTime()) {
          return { tipo: 'ainda_na_janela', effectiveAt: linha.effective_at };
        }

        if (await temCasoAberto(trx, linha.pet_id)) return { tipo: 'caso_aberto' };

        if (linha.to_user_id === null) return { tipo: 'destinatario_sumiu' };
        const novoDono = linha.to_user_id;

        const trocou = await construtorDaTrocaDeDono(
          trx,
          linha.pet_id,
          linha.from_user_id,
          novoDono,
          agora,
        ).executeTakeFirst();
        if (Number(trocou.numUpdatedRows) === 0) return { tipo: 'ja_resolvida' };

        const revogadas = await construtorDaRevogacaoDasTags(
          trx,
          linha.pet_id,
          agora,
        ).executeTakeFirst();

        const atualizada = await trx
          .updateTable('pet_transfers')
          .set({ status: 'effective', cancel_token_hash: null })
          .where('id', '=', transferencia)
          .where('status', '=', 'accepted')
          .returning([...COLUNAS_DE_RETORNO])
          .executeTakeFirstOrThrow();

        return {
          tipo: 'consumada',
          transferencia: comoDominio(atualizada),
          tagsRevogadas: Number(revogadas.numUpdatedRows),
        };
      });
    },
  };
}

/**
 * As transferencias que o worker precisa olhar: as vencidas por falta de aceite e
 * as que passaram do instante de consumacao.
 */
export async function transferenciasVencidas(
  db: Db,
  agora: Instant,
  limite: number,
): Promise<{ aExpirar: TransferId[]; aConsumar: TransferId[] }> {
  const quando = new Date(agora);
  const aExpirar = await db
    .selectFrom('pet_transfers')
    .select('id')
    .where('status', '=', 'pending_acceptance')
    .where('invite_expires_at', '<=', quando)
    .limit(limite)
    .execute();
  const aConsumar = await db
    .selectFrom('pet_transfers')
    .select('id')
    .where('status', '=', 'accepted')
    .where('effective_at', '<=', quando)
    .limit(limite)
    .execute();
  return {
    aExpirar: aExpirar.map((l) => l.id as TransferId),
    aConsumar: aConsumar.map((l) => l.id as TransferId),
  };
}
