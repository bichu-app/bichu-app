/** Persistência das tags. */
import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { Instant, PetId, TagId, UserId } from '../../../../shared/types/brands.js';
import type {
  AvisoRecente,
  ContextoDoDono,
  MotivoDeRevogacao,
  NovaTag,
  NovoAviso,
  NovoScan,
  ResultadoDaEmissao,
  StatusDaTag,
  TagDoTutor,
  TagParaReimpressao,
  TagRepository,
  TagResolvida,
} from '../../ports/tag-repository.js';

/** Teto de tags ativas por pet (ADR-0004). */
const TETO_DE_TAGS_ATIVAS = 5;

/** Teto de emissões por pet em 24 h. */
const TETO_DE_EMISSOES_POR_DIA = 10;

const JANELA_DE_EMISSAO_EM_MS = 24 * 3600 * 1000;

/** O pet está fora de cena para a rota pública. */
const STATUS_INDISPONIVEIS = ['deceased', 'archived'];

interface LinhaDeTagDoTutor {
  id: string;
  status: string;
  code_suffix: string;
  label: string | null;
  scan_count: number;
  last_scanned_at: Date | null;
  revoked_at: Date | null;
  revocation_reason: string | null;
  created_at: Date;
}

function comoTagDoTutor(linha: LinhaDeTagDoTutor): TagDoTutor {
  return {
    id: linha.id as TagId,
    status: linha.status as StatusDaTag,
    codeSuffix: linha.code_suffix.trim(),
    label: linha.label,
    scanCount: linha.scan_count,
    lastScannedAt: linha.last_scanned_at,
    revokedAt: linha.revoked_at,
    revocationReason: linha.revocation_reason as MotivoDeRevogacao | null,
    createdAt: linha.created_at,
  };
}

/**
 * **A busca vinculada do ADR-0021.** Os dois predicados são irmãos no mesmo
 * `WHERE`, e o `status` ativo está junto deles pelo mesmo motivo: a tag revogada
 * do próprio tutor também é 404 aqui, e quem chama não recebe nada com que pudesse
 * distinguir os casos.
 */
export function construtorDoContextoDoDono(db: DbExecutor, codeHash: Uint8Array, dono: UserId) {
  return db
    .selectFrom('pet_tags')
    .innerJoin('pets', 'pets.id', 'pet_tags.pet_id')
    .select(['pet_tags.id as tag_id', 'pets.id as pet_id'])
    .where('pet_tags.code_hash', '=', Buffer.from(codeHash))
    .where('pets.owner_user_id', '=', dono)
    .where('pet_tags.status', '=', 'active')
    .where('pets.deleted_at', 'is', null);
}

/**
 * O pet é deste tutor? É a consulta que impede listar e emitir plaquinha de pet
 * alheio a partir de um id adivinhado.
 */
export function construtorDaConferenciaDoPet(db: DbExecutor, petId: PetId, dono: UserId) {
  return db
    .selectFrom('pets')
    .select('id')
    .where('id', '=', petId)
    .where('owner_user_id', '=', dono)
    .where('deleted_at', 'is', null);
}

/** A contagem da janela de emissão, com a emissão mais antiga dentro dela. */
export function construtorDaJanelaDeEmissao(
  db: DbExecutor,
  petId: PetId,
  inicioDaJanela: Date,
) {
  return db
    .selectFrom('pet_tags')
    .select(({ fn }) => fn.countAll<string>().as('total'))
    .select(({ fn }) => fn.min<Date | null>('created_at').as('mais_antiga'))
    .where('pet_id', '=', petId)
    .where('created_at', '>=', inicioDaJanela);
}

/** As tags do pet, com o dono no mesmo `WHERE` que o pet. */
export function construtorDaListaDeTags(db: DbExecutor, petId: PetId, dono: UserId) {
  return db
    .selectFrom('pet_tags')
    .innerJoin('pets', 'pets.id', 'pet_tags.pet_id')
    .select([
      'pet_tags.id as id',
      'pet_tags.status as status',
      'pet_tags.code_suffix as code_suffix',
      'pet_tags.label as label',
      'pet_tags.scan_count as scan_count',
      'pet_tags.last_scanned_at as last_scanned_at',
      'pet_tags.revoked_at as revoked_at',
      'pet_tags.revocation_reason as revocation_reason',
      'pet_tags.created_at as created_at',
    ])
    .where('pet_tags.pet_id', '=', petId)
    .where('pets.owner_user_id', '=', dono)
    .orderBy('pet_tags.created_at', 'desc');
}

/** O cifrado para reimprimir o QR. */
export function construtorDaBuscaParaReimpressao(
  db: DbExecutor,
  petId: PetId,
  tagId: TagId,
  dono: UserId,
) {
  return db
    .selectFrom('pet_tags')
    .innerJoin('pets', 'pets.id', 'pet_tags.pet_id')
    .select(['pet_tags.status as status', 'pet_tags.code_ciphertext as code_ciphertext'])
    .where('pet_tags.id', '=', tagId)
    .where('pet_tags.pet_id', '=', petId)
    .where('pets.owner_user_id', '=', dono)
    .where('pets.deleted_at', 'is', null);
}

export function criarTagRepository(db: Db): TagRepository {
  return {
    async resolverPorCodigo(codeHash): Promise<TagResolvida | undefined> {
      const linha = await db
        .selectFrom('pet_tags')
        .innerJoin('pets', 'pets.id', 'pet_tags.pet_id')
        .leftJoin('ref_breeds', 'ref_breeds.code', 'pets.breed_code')
        .leftJoin('ref_colors', 'ref_colors.code', 'pets.primary_color_code')
        .leftJoin('pet_photos', (juncao) =>
          juncao
            .onRef('pet_photos.pet_id', '=', 'pets.id')
            .on('pet_photos.is_primary', '=', true)
            .on('pet_photos.status', '=', 'ready')
            .on('pet_photos.deleted_at', 'is', null),
        )
        .select([
          'pet_tags.id as tag_id',
          'pet_tags.status as tag_status',
          'pets.id as pet_id',
          'pets.owner_user_id',
          'pets.name',
          'pets.species_code',
          'pets.size_code',
          'pets.breed_free_text',
          'pets.distinctive_marks',
          'pets.care_notes',
          'pets.status as pet_status',
          'pets.deleted_at',
          'ref_breeds.label as breed_label',
          'ref_colors.label as color_label',
          'pet_photos.card_key as card_key',
        ])
        .where('pet_tags.code_hash', '=', Buffer.from(codeHash))
        .executeTakeFirst();

      if (linha === undefined) return undefined;

      return {
        tagId: linha.tag_id as TagId,
        petId: linha.pet_id as PetId,
        ownerUserId: linha.owner_user_id as UserId,
        status: linha.tag_status,
        petIndisponivel:
          linha.deleted_at !== null || STATUS_INDISPONIVEIS.includes(linha.pet_status),
        pet: {
          displayName: linha.name,
          species: linha.species_code,
          breedLabel: linha.breed_label ?? linha.breed_free_text,
          size: linha.size_code,
          primaryColor: linha.color_label,
          distinctiveMarks: linha.distinctive_marks,
          careNotes: linha.care_notes,
          isLost: linha.pet_status === 'lost',
          photoKey: linha.card_key,
        },
      };
    },

    async buscarContextoDoDono(codeHash, dono): Promise<ContextoDoDono | undefined> {
      const linha = await construtorDoContextoDoDono(db, codeHash, dono).executeTakeFirst();

      if (linha === undefined) return undefined;
      return { petId: linha.pet_id as PetId, tagId: linha.tag_id as TagId };
    },

    async listarTagsDoPet(petId, dono): Promise<readonly TagDoTutor[] | undefined> {
      const pet = await construtorDaConferenciaDoPet(db, petId, dono).executeTakeFirst();
      if (pet === undefined) return undefined;

      const linhas = await construtorDaListaDeTags(db, petId, dono).execute();
      return linhas.map(comoTagDoTutor);
    },

    async buscarParaReimpressao(petId, tagId, dono): Promise<TagParaReimpressao | undefined> {
      const linha = await construtorDaBuscaParaReimpressao(
        db,
        petId,
        tagId,
        dono,
      ).executeTakeFirst();

      if (linha === undefined) return undefined;
      return {
        status: linha.status,
        codeCiphertext:
          linha.code_ciphertext === null ? null : Uint8Array.from(linha.code_ciphertext),
      };
    },

    /**
     * Emissão e tetos na **mesma transação**, e os dois `count` com `FOR UPDATE` sobre
     * a linha do pet.
     */
    async emitir(nova: NovaTag, dono: UserId, agora: Instant): Promise<ResultadoDaEmissao> {
      return db.transaction().execute(async (trx) => {
        const pet = await construtorDaConferenciaDoPet(trx, nova.petId, dono)
          .forUpdate()
          .executeTakeFirst();
        if (pet === undefined) return { tipo: 'pet_nao_e_deste_tutor' };

        const ativas = await trx
          .selectFrom('pet_tags')
          .select(({ fn }) => fn.countAll<string>().as('total'))
          .where('pet_id', '=', nova.petId)
          .where('status', '=', 'active')
          .executeTakeFirstOrThrow();
        if (Number(ativas.total) >= TETO_DE_TAGS_ATIVAS) return { tipo: 'teto_de_ativas' };

        const inicioDaJanela = new Date(agora - JANELA_DE_EMISSAO_EM_MS);
        const doDia = await construtorDaJanelaDeEmissao(
          trx,
          nova.petId,
          inicioDaJanela,
        ).executeTakeFirstOrThrow();
        if (Number(doDia.total) >= TETO_DE_EMISSOES_POR_DIA) {
          const maisAntiga = doDia.mais_antiga;
          const liberaEm =
            maisAntiga === null || maisAntiga === undefined
              ? agora + JANELA_DE_EMISSAO_EM_MS
              : new Date(maisAntiga).getTime() + JANELA_DE_EMISSAO_EM_MS;
          return {
            tipo: 'teto_diario',
            retryAfterSeconds: Math.max(1, Math.ceil((liberaEm - agora) / 1000)),
          };
        }

        const linha = await trx
          .insertInto('pet_tags')
          .values({
            id: nova.id,
            pet_id: nova.petId,
            code_hash: Buffer.from(nova.codeHash),
            code_ciphertext: Buffer.from(nova.codeCiphertext),
            code_suffix: nova.codeSuffix,
            label: nova.label,
          })
          .returning([
            'id',
            'status',
            'code_suffix',
            'label',
            'scan_count',
            'last_scanned_at',
            'revoked_at',
            'revocation_reason',
            'created_at',
          ])
          .executeTakeFirstOrThrow();

        return { tipo: 'emitida', tag: comoTagDoTutor(linha) };
      });
    },

    /** O scan e o contador andam juntos. */
    async registrarScan(scan: NovoScan): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('tag_scans')
          .values({
            id: scan.id,
            tag_id: scan.tagId,
            ip_hmac: scan.ipHmac === null ? null : Buffer.from(scan.ipHmac),
            user_agent_hash:
              scan.userAgentHash === null ? null : Buffer.from(scan.userAgentHash),
            resulted_in_found_report: scan.resultouEmAviso,
          })
          .execute();

        await trx
          .updateTable('pet_tags')
          .set({
            scan_count: sql<number>`pet_tags.scan_count + 1`,
            last_scanned_at: sql<Date>`now()`,
          })
          .where('id', '=', scan.tagId)
          .execute();
      });
    },

    async registrarAviso(aviso: NovoAviso): Promise<void> {
      await db
        .insertInto('found_reports')
        .values({
          id: aviso.id,
          origin: 'tag_scan',
          tag_id: aviso.tagId,
          pet_id: aviso.petId,
          reporter_user_id: aviso.reporterUserId,
          finder_identity_hash:
            aviso.finderIdentityHash === null ? null : Buffer.from(aviso.finderIdentityHash),
          finder_token_hash: Buffer.from(aviso.finderTokenHash),
          finder_token_expires_at: new Date(aviso.finderTokenExpiresAt),
          found_at: new Date(aviso.foundAt),
          notes: aviso.notes,
        })
        .execute();
    },

    async avisoRecenteDoMesmoAchador(
      tagId,
      finderIdentityHash,
      desde,
    ): Promise<AvisoRecente | undefined> {
      if (finderIdentityHash === null) return undefined;

      const linha = await db
        .selectFrom('found_reports')
        .select(['id', 'created_at'])
        .where('tag_id', '=', tagId)
        .where('finder_identity_hash', '=', Buffer.from(finderIdentityHash))
        .where('created_at', '>=', new Date(desde))
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      if (linha === undefined) return undefined;
      return { id: linha.id, criadoEm: linha.created_at };
    },

    async jaAvisouRecentemente(tagId, finderIdentityHash, desde): Promise<boolean> {
      if (finderIdentityHash === null) return false;
      const linha = await db
        .selectFrom('found_reports')
        .select('id')
        .where('tag_id', '=', tagId)
        .where('finder_identity_hash', '=', Buffer.from(finderIdentityHash))
        .where('created_at', '>=', new Date(desde))
        .executeTakeFirst();
      return linha !== undefined;
    },
  };
}
