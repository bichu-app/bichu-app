/**
 * Persistência da mídia.
 *
 * Duas coisas aqui não são detalhe de implementação:
 *
 * **A autorização mora na cláusula `WHERE`**, como nas tags e no cadastro. Toda
 * leitura de foto passa por `pets.owner_user_id = :dono`, e a consulta que
 * devolveria a foto de outro tutor não existe neste arquivo.
 *
 * **A confirmação é uma transação de quatro escritas**, e as quatro precisam
 * acontecer juntas: marcar a intenção como confirmada, criar a foto, tirar a
 * principal anterior e enfileirar o trabalho. Qualquer subconjunto é um estado
 * quebrado que ninguém consegue diagnosticar depois — foto sem trabalho fica
 * `processing` para sempre; trabalho sem foto falha em laço procurando uma linha
 * que não existe; duas principais violam o índice e derrubam a próxima escrita.
 */
import type { Db } from '../../../../shared/db/pool.js';
import type {
  FotoDoPet,
  IntencaoDeEnvio,
  MediaRepository,
  NovaIntencao,
  StatusDaFoto,
} from '../../ports/media-repository.js';
import type { Instant, ObjectKey, PetId, UserId } from '../../../../shared/types/brands.js';

/** O nome do trabalho na fila. O worker casa por este valor. */
export const TRABALHO_DE_PROCESSAR_FOTO = 'media.process_pet_photo';

interface LinhaDaFoto {
  id: string;
  status: StatusDaFoto;
  is_primary: boolean;
  original_key: string;
  thumb_key: string | null;
  card_key: string | null;
  created_at: Date;
}

function comoFoto(l: LinhaDaFoto): FotoDoPet {
  return {
    id: l.id,
    status: l.status,
    isPrimary: l.is_primary,
    originalKey: l.original_key as ObjectKey,
    thumbKey: l.thumb_key as ObjectKey | null,
    cardKey: l.card_key as ObjectKey | null,
    createdAt: l.created_at,
  };
}

const COLUNAS_DA_FOTO = [
  'pet_photos.id',
  'pet_photos.status',
  'pet_photos.is_primary',
  'pet_photos.original_key',
  'pet_photos.thumb_key',
  'pet_photos.card_key',
  'pet_photos.created_at',
] as const;

export function criarMediaRepository(db: Db): MediaRepository {
  return {
    async petEhDoTutor(pet: PetId, dono: UserId): Promise<boolean> {
      const linha = await db
        .selectFrom('pets')
        .select('id')
        .where('id', '=', pet)
        .where('owner_user_id', '=', dono)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      return linha !== undefined;
    },

    async registrarIntencao(nova: NovaIntencao): Promise<void> {
      await db
        .insertInto('upload_intents')
        .values({
          id: nova.id,
          user_id: nova.userId,
          pet_id: nova.petId,
          kind: 'pet_photo',
          object_key: nova.objectKey,
          declared_type: nova.declaredType,
          max_bytes: nova.maxBytes,
          expires_at: nova.expiresAt,
        })
        .execute();
    },

    async buscarIntencaoAberta(
      id: string,
      dono: UserId,
      agora: Instant,
    ): Promise<IntencaoDeEnvio | null> {
      const linha = await db
        .selectFrom('upload_intents')
        .selectAll()
        .where('id', '=', id)
        // As três condições valem juntas: dono errado, vencida e já confirmada
        // saem todas como `null`, e é o serviço que as transforma na MESMA
        // resposta — distinguir contaria a um estranho qual delas aconteceu.
        .where('user_id', '=', dono)
        .where('expires_at', '>', new Date(Number(agora)))
        .where('confirmed_at', 'is', null)
        .executeTakeFirst();

      if (linha === undefined) return null;
      return {
        id: linha.id,
        userId: linha.user_id as UserId,
        petId: linha.pet_id as PetId | null,
        objectKey: linha.object_key as ObjectKey,
        declaredType: linha.declared_type,
        maxBytes: linha.max_bytes,
        expiresAt: linha.expires_at,
        confirmedAt: linha.confirmed_at,
      };
    },

    async confirmarEnvio(entrada): Promise<FotoDoPet> {
      const quando = new Date(Number(entrada.agora));

      return db.transaction().execute(async (trx) => {
        await trx
          .updateTable('upload_intents')
          .set({ confirmed_at: quando })
          .where('id', '=', entrada.intencaoId)
          .execute();

        if (entrada.definirComoPrincipal) {
          // Precisa vir ANTES da inserção: o índice único parcial não aceita
          // duas principais nem por um instante dentro da transação.
          await trx
            .updateTable('pet_photos')
            .set({ is_primary: false })
            .where('pet_id', '=', entrada.petId)
            .where('is_primary', '=', true)
            .where('deleted_at', 'is', null)
            .execute();
        }

        const criada = await trx
          .insertInto('pet_photos')
          .values({
            id: entrada.fotoId,
            pet_id: entrada.petId,
            upload_intent_id: entrada.intencaoId,
            original_key: entrada.objectKey,
            is_primary: entrada.definirComoPrincipal,
          })
          .returning([
            'id',
            'status',
            'is_primary',
            'original_key',
            'thumb_key',
            'card_key',
            'created_at',
          ])
          .executeTakeFirstOrThrow();

        await trx
          .insertInto('jobs')
          .values({
            id: entrada.trabalhoId,
            kind: TRABALHO_DE_PROCESSAR_FOTO,
            payload: JSON.stringify({ photo_id: entrada.fotoId, pet_id: entrada.petId }),
          })
          .execute();

        return comoFoto(criada);
      });
    },

    async listarDoPet(pet: PetId, dono: UserId): Promise<readonly FotoDoPet[]> {
      const linhas = await db
        .selectFrom('pet_photos')
        .innerJoin('pets', 'pets.id', 'pet_photos.pet_id')
        .select(COLUNAS_DA_FOTO)
        .where('pet_photos.pet_id', '=', pet)
        .where('pets.owner_user_id', '=', dono)
        .where('pet_photos.deleted_at', 'is', null)
        .orderBy('pet_photos.is_primary', 'desc')
        .orderBy('pet_photos.created_at', 'desc')
        .execute();
      return linhas.map((l) => comoFoto(l));
    },

    async buscarFoto(pet: PetId, foto: string, dono: UserId): Promise<FotoDoPet | null> {
      const linha = await db
        .selectFrom('pet_photos')
        .innerJoin('pets', 'pets.id', 'pet_photos.pet_id')
        .select(COLUNAS_DA_FOTO)
        .where('pet_photos.id', '=', foto)
        .where('pet_photos.pet_id', '=', pet)
        .where('pets.owner_user_id', '=', dono)
        .where('pet_photos.deleted_at', 'is', null)
        .executeTakeFirst();
      return linha === undefined ? null : comoFoto(linha);
    },

    async excluirFoto(pet: PetId, foto: string, dono: UserId, agora: Instant): Promise<boolean> {
      // O subconsulta do dono está aqui, e não num `if` antes, pelo mesmo motivo
      // de sempre: o arranjo que apagaria a foto de outro tutor não existe.
      const resultado = await db
        .updateTable('pet_photos')
        .set({ deleted_at: new Date(Number(agora)), is_primary: false })
        .where('id', '=', foto)
        .where('pet_id', '=', pet)
        .where('deleted_at', 'is', null)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom('pets')
              .select('pets.id')
              .whereRef('pets.id', '=', 'pet_photos.pet_id')
              .where('pets.owner_user_id', '=', dono),
          ),
        )
        .executeTakeFirst();
      return Number(resultado.numUpdatedRows) > 0;
    },
  };
}
