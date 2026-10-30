/** Persistência da mídia. */
import { sql } from 'kysely';

import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { JobKind } from '../../../../shared/ports/index.js';
import type {
  EspecieVencida,
  FotoDoPet,
  FotoParaProcessar,
  IntencaoVencida,
  IntencaoDeEnvio,
  MediaRepository,
  NovaIntencao,
  ObjetoDaConta,
  StatusDaFoto,
} from '../../ports/media-repository.js';
import type { Instant, PetId, UserId } from '../../../../shared/types/brands.js';
import { comoObjectKey } from '../../domain/chave-de-objeto.js';
import { ESPECIES_DO_ACHADO } from '../../ports/fotos-do-achado.js';

/** O nome do trabalho na fila, **tirado da porta** e não inventado aqui. */
export const TRABALHO_DE_PROCESSAR_FOTO: JobKind = 'media.process_upload';

interface LinhaDaFoto {
  id: string;
  status: StatusDaFoto;
  rejection_reason: string | null;
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
    rejectionReason: l.rejection_reason,
    isPrimary: l.is_primary,
    originalKey: comoObjectKey(l.original_key),
    thumbKey: l.thumb_key === null ? null : comoObjectKey(l.thumb_key),
    cardKey: l.card_key === null ? null : comoObjectKey(l.card_key),
    createdAt: l.created_at,
  };
}

const COLUNAS_DA_FOTO = [
  'pet_photos.id',
  'pet_photos.status',
  'pet_photos.rejection_reason',
  'pet_photos.is_primary',
  'pet_photos.original_key',
  'pet_photos.thumb_key',
  'pet_photos.card_key',
  'pet_photos.created_at',
] as const;

/** O pet é deste tutor? É o portão de `registrarIntencao` e de `confirmarEnvio`. */
export function construtorDaConferenciaDoPet(db: DbExecutor, pet: PetId, dono: UserId) {
  return db
    .selectFrom('pets')
    .select('id')
    .where('id', '=', pet)
    .where('owner_user_id', '=', dono)
    .where('deleted_at', 'is', null);
}

/** A intenção de envio ainda aberta. */
export function construtorDaIntencaoAberta(
  db: DbExecutor,
  id: string,
  dono: UserId,
  agora: Instant,
) {
  return db
    .selectFrom('upload_intents')
    .selectAll()
    .where('id', '=', id)
    .where('user_id', '=', dono)
    .where('expires_at', '>', new Date(Number(agora)))
    .where('confirmed_at', 'is', null);
}

/** As fotos do pet, com o dono no mesmo `WHERE` que o pet. */
export function construtorDaListaDoPet(db: DbExecutor, pet: PetId, dono: UserId) {
  return db
    .selectFrom('pet_photos')
    .innerJoin('pets', 'pets.id', 'pet_photos.pet_id')
    .select(COLUNAS_DA_FOTO)
    .where('pet_photos.pet_id', '=', pet)
    .where('pets.owner_user_id', '=', dono)
    .where('pet_photos.deleted_at', 'is', null)
    .orderBy('pet_photos.is_primary', 'desc')
    .orderBy('pet_photos.created_at', 'desc');
}

/** Uma foto específica, com pet e dono irmãos do id no mesmo `WHERE`. */
export function construtorDaBuscaDeFoto(
  db: DbExecutor,
  pet: PetId,
  foto: string,
  dono: UserId,
) {
  return db
    .selectFrom('pet_photos')
    .innerJoin('pets', 'pets.id', 'pet_photos.pet_id')
    .select(COLUNAS_DA_FOTO)
    .where('pet_photos.id', '=', foto)
    .where('pet_photos.pet_id', '=', pet)
    .where('pets.owner_user_id', '=', dono)
    .where('pet_photos.deleted_at', 'is', null);
}

/** A exclusão lógica da foto. */
export function construtorDaExclusaoDeFoto(
  db: DbExecutor,
  pet: PetId,
  foto: string,
  dono: UserId,
  agora: Instant,
) {
  return db
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
    );
}

export function criarMediaRepository(db: Db): MediaRepository {
  return {
    async petEhDoTutor(pet: PetId, dono: UserId): Promise<boolean> {
      const linha = await construtorDaConferenciaDoPet(db, pet, dono).executeTakeFirst();
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
      const linha = await construtorDaIntencaoAberta(db, id, dono, agora).executeTakeFirst();

      if (linha === undefined) return null;
      return {
        id: linha.id,
        userId: linha.user_id as UserId,
        petId: linha.pet_id as PetId | null,
        objectKey: comoObjectKey(linha.object_key),
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
            'rejection_reason',
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
      const linhas = await construtorDaListaDoPet(db, pet, dono).execute();
      return linhas.map((l) => comoFoto(l));
    },

    async porPets(pets: readonly PetId[]): Promise<ReadonlyMap<string, readonly FotoDoPet[]>> {
      const mapa = new Map<string, FotoDoPet[]>();
      if (pets.length === 0) return mapa;

      const linhas = await db
        .selectFrom('pet_photos')
        .select([...COLUNAS_DA_FOTO, 'pet_photos.pet_id'])
        .where('pet_photos.pet_id', 'in', [...pets])
        .where('pet_photos.deleted_at', 'is', null)
        .orderBy('pet_photos.is_primary', 'desc')
        .orderBy('pet_photos.created_at', 'desc')
        .execute();

      for (const linha of linhas) {
        const lista = mapa.get(linha.pet_id) ?? [];
        lista.push(comoFoto(linha));
        mapa.set(linha.pet_id, lista);
      }
      return mapa;
    },

    async buscarFoto(pet: PetId, foto: string, dono: UserId): Promise<FotoDoPet | null> {
      const linha = await construtorDaBuscaDeFoto(db, pet, foto, dono).executeTakeFirst();
      return linha === undefined ? null : comoFoto(linha);
    },

    async buscarParaProcessar(foto: string): Promise<FotoParaProcessar | null> {
      const linha = await db
        .selectFrom('pet_photos')
        .select(['id', 'pet_id', 'status', 'original_key'])
        .where('id', '=', foto)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (linha === undefined) return null;
      return {
        id: linha.id,
        petId: linha.pet_id as PetId,
        status: linha.status,
        originalKey: comoObjectKey(linha.original_key),
      };
    },

    async marcarPronta(entrada): Promise<void> {
      await db
        .updateTable('pet_photos')
        .set({
          status: 'ready',
          thumb_key: entrada.thumbKey,
          card_key: entrada.cardKey,
          processed_at: new Date(Number(entrada.agora)),
        })
        .where('id', '=', entrada.fotoId)
        .where('status', '=', 'processing')
        .execute();
    },

    async marcarRecusada(foto: string, motivo: string, agora: Instant): Promise<void> {
      await db
        .updateTable('pet_photos')
        .set({ status: 'rejected', rejection_reason: motivo, processed_at: new Date(Number(agora)) })
        .where('id', '=', foto)
        .where('status', '=', 'processing')
        .execute();
    },

    async listarIntencoesVencidas(agora: Instant, limite: number): Promise<readonly IntencaoVencida[]> {
      const vencimento = new Date(Number(agora));
      const linhas = await db
        .selectFrom('upload_intents')
        .select([
          'id',
          'object_key',
          'expires_at',
          sql<EspecieVencida>`kind`.as('kind'),
        ])
        .where('confirmed_at', 'is', null)
        .where('expires_at', '<', vencimento)
        // AS DUAS ESPECIES DO ACHADO FICAM FORA. `kind` e NOT NULL, entao o
        // `not in` nao tem a armadilha do NULL que faria a linha sumir calada.
        .where('kind', 'not in', [...ESPECIES_DO_ACHADO])
        .unionAll(
          db
            .selectFrom('catalog_upload_intents')
            .select([
              'id',
              'object_key',
              'expires_at',
              sql<EspecieVencida>`'catalog_image'`.as('kind'),
            ])
            .where('confirmed_at', 'is', null)
            .where('expires_at', '<', vencimento),
        )
        .orderBy('expires_at')
        .limit(limite)
        .execute();
      return linhas.map((l) => ({
        id: l.id,
        objectKey: comoObjectKey(l.object_key),
        kind: l.kind,
      }));
    },

    /** Todas as chaves de objeto da conta, nos dois baldes (SEC-020). */
    async chavesDaConta(dono: UserId): Promise<readonly ObjetoDaConta[]> {
      const vistos = new Set<string>();
      const todos: ObjetoDaConta[] = [];
      const objetos = {
        push(objeto: ObjetoDaConta): void {
          const identidade = `${objeto.classe}|${String(objeto.chave)}`;
          if (vistos.has(identidade)) return;
          vistos.add(identidade);
          todos.push(objeto);
        },
      };

      const intencoes = await db
        .selectFrom('upload_intents')
        .select(['object_key', 'sanitized_key'])
        .where('user_id', '=', dono)
        .execute();
      for (const linha of intencoes) {
        objetos.push({ classe: 'privado', chave: comoObjectKey(linha.object_key) });
        if (linha.sanitized_key === null) continue;
        objetos.push({ classe: 'privado', chave: comoObjectKey(linha.sanitized_key) });
      }

      const fotos = await db
        .selectFrom('pet_photos')
        .innerJoin('pets', 'pets.id', 'pet_photos.pet_id')
        .select(['pet_photos.original_key', 'pet_photos.thumb_key', 'pet_photos.card_key'])
        .where('pets.owner_user_id', '=', dono)
        .execute();
      for (const linha of fotos) {
        objetos.push({ classe: 'privado', chave: comoObjectKey(linha.original_key) });
        if (linha.thumb_key !== null) {
          objetos.push({ classe: 'publico', chave: comoObjectKey(linha.thumb_key) });
        }
        if (linha.card_key !== null) {
          objetos.push({ classe: 'publico', chave: comoObjectKey(linha.card_key) });
        }
      }

      const mensagens = await db
        .selectFrom('conversation_messages')
        .select('photo_object_key')
        .where('sender_user_id', '=', dono)
        .where('photo_object_key', 'is not', null)
        .execute();
      for (const linha of mensagens) {
        if (linha.photo_object_key === null) continue;
        objetos.push({ classe: 'privado', chave: comoObjectKey(linha.photo_object_key) });
      }

      return todos;
    },

    async descartarIntencao(id: string): Promise<void> {
      await db.deleteFrom('upload_intents').where('id', '=', id).where('confirmed_at', 'is', null).execute();
      await db.deleteFrom('catalog_upload_intents').where('id', '=', id).where('confirmed_at', 'is', null).execute();
    },

    async excluirFoto(pet: PetId, foto: string, dono: UserId, agora: Instant): Promise<boolean> {
      const resultado = await construtorDaExclusaoDeFoto(
        db,
        pet,
        foto,
        dono,
        agora,
      ).executeTakeFirst();
      return Number(resultado.numUpdatedRows) > 0;
    },
  };
}
