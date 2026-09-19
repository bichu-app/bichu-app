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
 *
 * **Toda chave que sai daqui passa por `comoObjectKey`.** Ela vinha marcada por
 * `as ObjectKey`, que não confere nada: promete ao compilador que alguém já
 * validou. Quem escreve hoje é só o domínio — mas essa garantia não está em
 * contrato nenhum, e importação, migração ou correção manual em produção
 * escrevem nesta tabela sem passar por ele. A chave daqui vai para o `pathname`
 * da URL do objeto, e o parser de URL resolve `..`: uma linha com
 * `card/../../x` lê de fora do bucket (BICHUS-134).
 */
import type { Db } from '../../../../shared/db/pool.js';
import type { JobKind } from '../../../../shared/ports/index.js';
import type {
  FotoDoPet,
  FotoParaProcessar,
  IntencaoVencida,
  IntencaoDeEnvio,
  MediaRepository,
  NovaIntencao,
  StatusDaFoto,
} from '../../ports/media-repository.js';
import type { Instant, PetId, UserId } from '../../../../shared/types/brands.js';
import { comoObjectKey } from '../../domain/chave-de-objeto.js';

/**
 * O nome do trabalho na fila, **tirado da porta** e não inventado aqui.
 *
 * `JobKind` é uma união fechada em `shared/ports/job-queue.ts`, e eu tinha
 * escrito `media.process_pet_photo` neste arquivo — um valor que a união não
 * conhece. O worker casa por este nome: um adaptador que enfileira um `kind`
 * fora da união produz trabalho que ninguém nunca pega, e a foto ficaria
 * `processing` para sempre sem nenhum erro em lugar nenhum.
 */
export const TRABALHO_DE_PROCESSAR_FOTO: JobKind = 'media.process_upload';

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
    originalKey: comoObjectKey(l.original_key),
    thumbKey: l.thumb_key === null ? null : comoObjectKey(l.thumb_key),
    cardKey: l.card_key === null ? null : comoObjectKey(l.card_key),
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
        // Só sai de `processing`. Uma foto já `ready` ou `rejected` não volta:
        // o trabalho pode ser reentregue pela fila depois de um reinício, e
        // reprocessar geraria derivadas novas com chaves novas, deixando as
        // antigas órfãs no bucket público e ainda servindo.
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
      const linhas = await db
        .selectFrom('upload_intents')
        .select(['id', 'object_key'])
        .where('confirmed_at', 'is', null)
        .where('expires_at', '<', new Date(Number(agora)))
        // Uma intenção confirmada vira `pet_photos`; esta consulta só enxerga as
        // que nunca viraram, e por isso não há risco de apagar o original de
        // uma foto viva.
        .orderBy('expires_at')
        .limit(limite)
        .execute();
      return linhas.map((l) => ({ id: l.id, objectKey: comoObjectKey(l.object_key) }));
    },

    async descartarIntencao(id: string): Promise<void> {
      await db.deleteFrom('upload_intents').where('id', '=', id).where('confirmed_at', 'is', null).execute();
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
