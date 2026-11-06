import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import { TRABALHO_DE_IMAGEM_DE_CATALOGO } from '../../../media/ports/imagem-de-catalogo.js';
import { rotuloDaRaca } from '../../domain/breed.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type {
  CodigosConhecidos,
  DadosDoPet,
  PetGravado,
  PetRepository,
  StatusDoPet,
} from '../../ports/pet-repository.js';
import type { Instant, PetId, UserId } from '../../../../shared/types/brands.js';
import type { TrechoRedigido } from '../../../../shared/redaction/redigir.js';

const COLUNAS = [
  'pets.id',
  'pets.name',
  'pets.species_code',
  'pets.breed_code',
  'pets.breed_free_text',
  'pets.ref_data_version',
  'pets.size_code',
  'pets.primary_color_code',
  'pets.secondary_color_code',
  'pets.sex',
  'pets.neutered',
  'pets.birth_date_approx',
  'pets.distinctive_marks',
  'pets.care_notes',
  'pets.care_notes_redactions',
  'pets.microchip_number',
  'pets.sinpatinhas_id',
  'pets.status',
  'pets.slug',
  'pets.public_profile_enabled',
  'pets.created_at',
  'pets.updated_at',
] as const;

interface LinhaDoPet {
  id: string;
  name: string;
  species_code: 'dog' | 'cat' | 'other';
  breed_code: string | null;
  breed_free_text: string | null;
  ref_data_version: string | null;
  size_code: 'P' | 'M' | 'G' | 'GG';
  primary_color_code: string | null;
  secondary_color_code: string | null;
  sex: 'male' | 'female' | 'unknown' | null;
  neutered: boolean | null;
  birth_date_approx: Date | null;
  distinctive_marks: string | null;
  care_notes: string | null;
  care_notes_redactions: TrechoRedigido[];
  microchip_number: string | null;
  sinpatinhas_id: string | null;
  status: StatusDoPet;
  slug: string | null;
  public_profile_enabled: boolean;
  created_at: Date;
  updated_at: Date;
  breed_list_label: string | null;
  /** `catalog_images.banner_key`, e **so** com `status = 'ready'`. */
  cover_banner_key: string | null;
  active_tag_count: number | string;
  open_case_id: string | null;
}

function comoPet(linha: LinhaDoPet): PetGravado {
  const raca = { breedCode: linha.breed_code, breedFreeText: linha.breed_free_text };
  return {
    id: linha.id as PetId,
    name: linha.name,
    species: linha.species_code,
    breedCode: linha.breed_code,
    breedFreeText: linha.breed_free_text,
    breedLabel: rotuloDaRaca(raca, linha.breed_list_label),
    refDataVersion: linha.ref_data_version,
    size: linha.size_code,
    primaryColorCode: linha.primary_color_code,
    secondaryColorCode: linha.secondary_color_code,
    sex: linha.sex,
    neutered: linha.neutered,
    birthDateApprox:
      linha.birth_date_approx === null
        ? null
        : new Date(linha.birth_date_approx).toISOString().slice(0, 10),
    distinctiveMarks: linha.distinctive_marks,
    careNotes: linha.care_notes,
    careNotesRedactions: linha.care_notes_redactions,
    microchipNumber: linha.microchip_number,
    sinpatinhasId: linha.sinpatinhas_id,
    status: linha.status,
    slug: linha.slug,
    publicProfileEnabled: linha.public_profile_enabled,
    activeTagCount: Number(linha.active_tag_count),
    openCaseId: linha.open_case_id,
    coverBannerKey: linha.cover_banner_key,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  };
}

/**
 * Os valores que a edição grava, **derivados do próprio helper** e não escritos à
 * mão: a primeira versão deste tipo repetia as colunas e já divergiu do schema em
 * `sex` e `neutered`.
 */
export type ValoresDaAtualizacao = ReturnType<typeof valoresDaAtualizacao>;

/** Os valores da edição, na forma de coluna do banco. */
export function valoresDaAtualizacao(dados: DadosDoPet, quando: Date) {
  return {
    name: dados.name,
    species_code: dados.species,
    breed_code: dados.breedCode,
    breed_free_text: dados.breedFreeText,
    ref_data_version: dados.refDataVersion,
    size_code: dados.size,
    primary_color_code: dados.primaryColorCode,
    secondary_color_code: dados.secondaryColorCode,
    sex: dados.sex,
    neutered: dados.neutered,
    birth_date_approx: dados.birthDateApprox === null ? null : new Date(dados.birthDateApprox),
    distinctive_marks: dados.distinctiveMarks,
    care_notes: dados.careNotes,
    care_notes_redactions: JSON.stringify(dados.careNotesRedactions),
    microchip_number: dados.microchipNumber,
    sinpatinhas_id: dados.sinpatinhasId,
    updated_at: quando,
  };
}

/**
 * **A leitura do dono.** Base de `buscarDoTutor`, `listarDoTutor` e da releitura
 * que `criar` faz — três caminhos, um predicado só, de propósito: três cópias
 * seriam três chances de uma delas divergir sem ninguém acusar.
 */
export function construtorDaLeituraDoDono(db: DbExecutor, dono: UserId) {
  return db
    .selectFrom('pets')
    .leftJoin('ref_breeds', (j) =>
      j
        .onRef('ref_breeds.code', '=', 'pets.breed_code')
        .onRef('ref_breeds.species_code', '=', 'pets.species_code'),
    )
    .select((eb) => [
      ...COLUNAS,
      'ref_breeds.label as breed_list_label',
      eb
        .selectFrom('pet_tags')
        .whereRef('pet_tags.pet_id', '=', 'pets.id')
        .where('pet_tags.status', '=', 'active')
        .select(({ fn }) => fn.countAll().as('n'))
        .as('active_tag_count'),
      eb
        .selectFrom('lost_cases')
        .whereRef('lost_cases.pet_id', '=', 'pets.id')
        .where('lost_cases.status', '=', 'open')
        .select('lost_cases.id')
        .as('open_case_id'),
      // A CAPA, so quando ela esta PRONTA. O `status = 'ready'` esta aqui e nao
      // numa conferencia depois de propósito: `banner_key` existe antes de a
      // imagem ser declarada pronta em nenhum caminho, mas a leitura nao pode
      // DEPENDER disso -- a mesma razao do `IS NOT NULL` que a fila do painel
      // usa, e o que impede servir derivada antes de o balde ter o arquivo.
      eb
        .selectFrom('catalog_images')
        .whereRef('catalog_images.id', '=', 'pets.cover_image_id')
        .where('catalog_images.status', '=', 'ready')
        .select('catalog_images.banner_key')
        .as('cover_banner_key'),
    ])
    .where('pets.owner_user_id', '=', dono)
    .where('pets.deleted_at', 'is', null);
}

/** A contagem do tutor, que decide o teto de pets por conta. */
export function construtorDaContagemDoTutor(db: DbExecutor, dono: UserId) {
  return db
    .selectFrom('pets')
    .select(({ fn }) => fn.countAll<string>().as('n'))
    .where('owner_user_id', '=', dono)
    .where('deleted_at', 'is', null);
}

/**
 * A edição da ficha. O dono é irmão do `id` no mesmo `WHERE`, e não um `if` antes:
 * o `UPDATE` que gravaria na ficha de outro tutor não existe aqui.
 */
export function construtorDaAtualizacao(
  db: DbExecutor,
  pet: PetId,
  dono: UserId,
  valores: ValoresDaAtualizacao,
) {
  return db
    .updateTable('pets')
    .set(valores)
    .where('id', '=', pet)
    .where('owner_user_id', '=', dono)
    .where('deleted_at', 'is', null);
}

/** A exclusão lógica, com o dono no mesmo `WHERE` pelo mesmo motivo. */
export function construtorDaExclusao(db: DbExecutor, pet: PetId, dono: UserId, quando: Instant) {
  return db
    .updateTable('pets')
    .set({ deleted_at: new Date(Number(quando)) })
    .where('id', '=', pet)
    .where('owner_user_id', '=', dono)
    .where('deleted_at', 'is', null);
}

export function criarPetRepository(db: Db, ids: IdGenerator): PetRepository {
  const leituraDoDono = (dono: UserId) => construtorDaLeituraDoDono(db, dono);

  return {
    async contarDoTutor(dono) {
      const linha = await construtorDaContagemDoTutor(db, dono).executeTakeFirstOrThrow();
      return Number(linha.n);
    },

    async conferirCodigos(dados: DadosDoPet): Promise<CodigosConhecidos> {
      const [especie, porte, raca, cor1, cor2, versao] = await Promise.all([
        db.selectFrom('ref_species').select('code').where('code', '=', dados.species).executeTakeFirst(),
        db.selectFrom('ref_sizes').select('code').where('code', '=', dados.size).executeTakeFirst(),
        dados.breedCode === null
          ? Promise.resolve(undefined)
          : db
              .selectFrom('ref_breeds')
              .select('code')
              .where('code', '=', dados.breedCode)
              .where('species_code', '=', dados.species)
              .executeTakeFirst(),
        dados.primaryColorCode === null
          ? Promise.resolve(undefined)
          : db.selectFrom('ref_colors').select('code').where('code', '=', dados.primaryColorCode).executeTakeFirst(),
        dados.secondaryColorCode === null
          ? Promise.resolve(undefined)
          : db.selectFrom('ref_colors').select('code').where('code', '=', dados.secondaryColorCode).executeTakeFirst(),
        dados.refDataVersion === null
          ? Promise.resolve(undefined)
          : db
              .selectFrom('ref_data_versions')
              .select('version')
              .where('version', '=', dados.refDataVersion)
              .executeTakeFirst(),
      ]);

      return {
        especieExiste: especie !== undefined,
        porteExiste: porte !== undefined,
        racaExisteNaEspecie: dados.breedCode === null || raca !== undefined,
        corPrimariaExiste: dados.primaryColorCode === null || cor1 !== undefined,
        corSecundariaExiste: dados.secondaryColorCode === null || cor2 !== undefined,
        versaoExiste: dados.refDataVersion === null || versao !== undefined,
      };
    },

    async criar(id, dono, dados) {
      await db
        .insertInto('pets')
        .values({
          id,
          owner_user_id: dono,
          name: dados.name,
          species_code: dados.species,
          breed_code: dados.breedCode,
          breed_free_text: dados.breedFreeText,
          ref_data_version: dados.refDataVersion,
          size_code: dados.size,
          primary_color_code: dados.primaryColorCode,
          secondary_color_code: dados.secondaryColorCode,
          sex: dados.sex,
          neutered: dados.neutered,
          birth_date_approx: dados.birthDateApprox === null ? null : new Date(dados.birthDateApprox),
          distinctive_marks: dados.distinctiveMarks,
          care_notes: dados.careNotes,
          care_notes_redactions: JSON.stringify(dados.careNotesRedactions),
          microchip_number: dados.microchipNumber,
          sinpatinhas_id: dados.sinpatinhasId,
        })
        .execute();

      const criado = await leituraDoDono(dono).where('pets.id', '=', id).executeTakeFirstOrThrow();
      return comoPet(criado as unknown as LinhaDoPet);
    },

    async listarDoTutor(dono) {
      const linhas = await leituraDoDono(dono).orderBy('pets.created_at', 'desc').execute();
      return linhas.map((l) => comoPet(l as unknown as LinhaDoPet));
    },

    async buscarDoTutor(pet, dono) {
      const linha = await leituraDoDono(dono).where('pets.id', '=', pet).executeTakeFirst();
      return linha === undefined ? null : comoPet(linha as unknown as LinhaDoPet);
    },

    async atualizar(pet, dono, dados) {
      const resultado = await construtorDaAtualizacao(
        db,
        pet,
        dono,
        valoresDaAtualizacao(dados, new Date()),
      ).executeTakeFirst();

      if (Number(resultado.numUpdatedRows) === 0) return null;
      return this.buscarDoTutor(pet, dono);
    },

    async excluir(pet: PetId, dono: UserId, quando: Instant) {
      const resultado = await construtorDaExclusao(db, pet, dono, quando).executeTakeFirst();
      return Number(resultado.numUpdatedRows) > 0;
    },

    /**
     * A CAPA DO PET (cliente, 06/11/2026), nos quatro passos de
     * `capaDoEnvio` do encontro, numa transacao so.
     *
     * **A transacao desfaz-se LANCANDO, e nunca com `return`** -- Kysely so
     * reverte quando a funcao lanca, e `return` dentro dela COMITA o que ja
     * foi escrito. E por isso que os desfechos de recusa saem de dentro como
     * valor de retorno do `transaction`, e nao por caminho de erro: nao ha
     * nada escrito a desfazer nos dois casos de recusa, porque as escritas vem
     * todas DEPOIS das duas conferencias.
     */
    async definirCapa(pet: PetId, dono: UserId, uploadId: string, agora: Instant) {
      const desfecho = await db.transaction().execute(async (trx) => {
        // 1. O PET E DO CHAMADOR? O dono esta no `WHERE`, com trava de linha:
        // duas confirmacoes simultaneas nao podem as duas achar o pet livre.
        const alvo = await trx
          .selectFrom('pets')
          .select(['pets.id', 'pets.cover_image_id'])
          .where('pets.id', '=', pet)
          .where('pets.owner_user_id', '=', dono)
          .where('pets.deleted_at', 'is', null)
          .forUpdate()
          .executeTakeFirst();
        if (alvo === undefined) return 'pet_inexistente' as const;

        // 2. O ENVIO SERVE? Conta, proposito e prazo no MESMO `WHERE`, e o
        // `FOR UPDATE OF u` impede duas confirmacoes de criarem duas imagens
        // do mesmo envio.
        //
        // **`sql` cru e nao o construtor, por uma razao do Postgres**:
        // `FOR UPDATE` recusa a ser aplicado ao lado anulavel de um `LEFT
        // JOIN`, e o construtor do Kysely nao expoe `OF <tabela>` para
        // restringir a trava a `u`. E a mesma consulta, com as mesmas
        // clausulas, que `capaDoEnvio` do encontro escreve.
        const linhasDoEnvio = await sql<{
          id: string;
          expires_at: Date;
          confirmed_at: Date | null;
          catalog_image_id: string | null;
        }>`
          SELECT u.id, u.expires_at, u.confirmed_at, c.id AS catalog_image_id
            FROM catalog_upload_intents u
            LEFT JOIN catalog_images c ON c.upload_intent_id = u.id
           WHERE u.id = ${uploadId}::uuid
             AND u.user_id = ${dono}::uuid
             AND u.purpose = 'pet_cover'
           FOR UPDATE OF u
        `.execute(trx);
        const envio = linhasDoEnvio.rows[0];
        if (envio === undefined) return 'envio_inservivel' as const;

        // JA CONFIRMADO: idempotente **so para o mesmo pet**. A imagem que ja
        // e capa de outro pet nao serve, pela mesma regra do encontro -- e e
        // `envio_inservivel` e nao um 409, porque dizer "essa imagem e de
        // outro pet" contaria sobre uma ficha que quem pergunta pode nao ter.
        if (envio.confirmed_at !== null) {
          const imagemId = envio.catalog_image_id;
          if (imagemId === null) return 'envio_inservivel' as const;
          const dono2 = await trx
            .selectFrom('pets')
            .select('pets.id')
            .where('pets.cover_image_id', '=', imagemId)
            .executeTakeFirst();
          if (dono2 !== undefined && dono2.id !== pet) return 'envio_inservivel' as const;
          if (alvo.cover_image_id !== imagemId) {
            await trx
              .updateTable('pets')
              .set({ cover_image_id: imagemId, updated_at: comoData(agora) })
              .where('id', '=', pet)
              .execute();
          }
          return 'pronto' as const;
        }

        if (envio.expires_at.getTime() <= Number(agora)) return 'envio_inservivel' as const;

        // 3. AS ESCRITAS, as quatro juntas: o envio fecha, a imagem nasce em
        // `processing`, o trabalho entra na fila e o pet passa a apontar.
        const imagemId = ids.uuidv7();
        await trx
          .updateTable('catalog_upload_intents')
          .set({ confirmed_at: comoData(agora) })
          .where('id', '=', envio.id)
          .where('confirmed_at', 'is', null)
          .execute();
        await trx
          .insertInto('catalog_images')
          .values({
            id: imagemId,
            upload_intent_id: envio.id,
            purpose: 'pet_cover',
            public_key: null,
            rejection_reason: null,
          })
          .execute();
        await trx
          .insertInto('jobs')
          .values({
            id: ids.uuidv7(),
            kind: TRABALHO_DE_IMAGEM_DE_CATALOGO,
            payload: JSON.stringify({ catalog_image_id: imagemId }),
          })
          .execute();
        await trx
          .updateTable('pets')
          .set({ cover_image_id: imagemId, updated_at: comoData(agora) })
          .where('id', '=', pet)
          .execute();
        return 'pronto' as const;
      });

      if (desfecho !== 'pronto') return desfecho;
      // A releitura e FORA da transacao de propósito: `cover_banner_key` sai
      // nula aqui, porque o worker ainda nao rodou, e e isso que a resposta 202
      // promete. Lê-la dentro nao mudaria nada e manteria a transacao aberta.
      const atual = await this.buscarDoTutor(pet, dono);
      return atual === null ? 'pet_inexistente' : atual;
    },
  };
}
