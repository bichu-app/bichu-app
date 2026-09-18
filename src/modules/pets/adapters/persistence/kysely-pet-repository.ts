/**
 * Persistência do cadastro do pet.
 *
 * **A autorização mora na cláusula `WHERE`**, e não num `if` depois da busca.
 * Todo método que toca um pet específico traz `owner_user_id = :dono` junto de
 * `id = :pet`, e é por isso que a porta exige o dono como argumento: a consulta
 * que devolveria o pet de outro tutor não existe neste arquivo.
 *
 * `deleted_at IS NULL` acompanha todas elas. A exclusão é lógica porque um pet
 * apagado de verdade levaria junto a trilha de auditoria, os avisos do achador
 * e o histórico do caso — e a `FOREIGN KEY ... ON DELETE CASCADE` faria isso em
 * silêncio, no meio de uma transação que ninguém está olhando.
 *
 * `breed_label` é resolvido aqui, no `LEFT JOIN` com `ref_breeds`, e não na
 * aplicação: é o que impede a ficha, o cartaz e o perfil público de repetirem a
 * mesma escolha de três formas ligeiramente diferentes.
 */
import type { Db } from '../../../../shared/db/pool.js';
import { rotuloDaRaca } from '../../domain/breed.js';
import type {
  CodigosConhecidos,
  DadosDoPet,
  PetGravado,
  PetRepository,
  StatusDoPet,
} from '../../ports/pet-repository.js';
import type { Instant, PetId, UserId } from '../../../../shared/types/brands.js';
import type { TrechoRedigido } from '../../../../shared/redaction/redigir.js';

/** As colunas da leitura do dono, num lugar só: três consultas usam a mesma lista. */
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
  active_tag_count: number | string;
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
    // `date` do Postgres não tem fuso; recortar os 10 primeiros caracteres do
    // ISO é o que mantém "01/03/2020" sendo 01/03/2020 em São Paulo e em UTC.
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
    // O caso de perdido chega com o módulo `lostfound`. Nulo é o valor
    // verdadeiro hoje; inventar um identificador aqui seria pior que ausência.
    openCaseId: null,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  };
}

export function criarPetRepository(db: Db): PetRepository {
  /** A leitura do dono, com o rótulo da raça e a contagem de tags ativas. */
  const leituraDoDono = (dono: UserId) =>
    db
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
      ])
      .where('pets.owner_user_id', '=', dono)
      .where('pets.deleted_at', 'is', null);

  return {
    async contarDoTutor(dono) {
      const linha = await db
        .selectFrom('pets')
        .select(({ fn }) => fn.countAll<string>().as('n'))
        .where('owner_user_id', '=', dono)
        .where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow();
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
              // A espécie entra na conferência: `ref_breeds` tem chave composta,
              // e "raça que existe, mas de outro animal" é o erro que a FK
              // composta do banco recusaria com um 500.
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

      // Campo ausente é campo válido: `undefined` por não ter sido consultado e
      // `undefined` por não ter sido achado se distinguem pelo valor de entrada.
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
      const resultado = await db
        .updateTable('pets')
        .set({
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
          updated_at: new Date(),
        })
        .where('id', '=', pet)
        .where('owner_user_id', '=', dono)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      if (Number(resultado.numUpdatedRows) === 0) return null;
      return this.buscarDoTutor(pet, dono);
    },

    async excluir(pet: PetId, dono: UserId, quando: Instant) {
      const resultado = await db
        .updateTable('pets')
        .set({ deleted_at: new Date(Number(quando)) })
        .where('id', '=', pet)
        .where('owner_user_id', '=', dono)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      return Number(resultado.numUpdatedRows) > 0;
    },
  };
}
