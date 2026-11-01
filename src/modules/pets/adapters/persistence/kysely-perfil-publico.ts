import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { LeituraDoPerfilPublico, PerfilPublicoDoPet } from '../../ports/perfil-publico.js';

const STATUS_SEM_PERFIL_PUBLICO = ['deceased', 'archived'] as const;

export function construtorDoPerfilPublico(db: DbExecutor, slug: string) {
  return db
    .selectFrom('pets')
    .leftJoin('ref_breeds', 'ref_breeds.code', 'pets.breed_code')
    .leftJoin('ref_colors', 'ref_colors.code', 'pets.primary_color_code')
    .leftJoin('pet_photos', (juncao) =>
      juncao
        .onRef('pet_photos.pet_id', '=', 'pets.id')
        .on('pet_photos.is_primary', '=', true)
        .on('pet_photos.status', '=', 'ready')
        .on('pet_photos.deleted_at', 'is', null),
    )
    .select((eb) => [
      'pets.slug as slug',
      'pets.name as name',
      'pets.species_code as species_code',
      'pets.size_code as size_code',
      'pets.breed_free_text as breed_free_text',
      'pets.distinctive_marks as distinctive_marks',
      'ref_breeds.label as breed_label',
      'ref_colors.label as color_label',
      'pet_photos.card_key as card_key',
      eb
        .exists(
          eb
            .selectFrom('lost_cases')
            .select('lost_cases.status')
            .whereRef('lost_cases.pet_id', '=', 'pets.id')
            .where('lost_cases.status', '=', 'open'),
        )
        .as('esta_perdido'),
    ])
    .where('pets.slug', '=', slug)
    .where('pets.public_profile_enabled', '=', true)
    .where('pets.deleted_at', 'is', null)
    .where('pets.status', 'not in', STATUS_SEM_PERFIL_PUBLICO);
}

export function criarLeituraDoPerfilPublico(db: Db): LeituraDoPerfilPublico {
  return {
    async porSlug(slug): Promise<PerfilPublicoDoPet | undefined> {
      const linha = await construtorDoPerfilPublico(db, slug).executeTakeFirst();
      if (linha === undefined || linha.slug === null) return undefined;
      return {
        slug: linha.slug,
        nome: linha.name,
        especie: linha.species_code,
        porte: linha.size_code,
        racaRotulo: linha.breed_label ?? linha.breed_free_text,
        corRotulo: linha.color_label,
        marcas: linha.distinctive_marks,
        chaveDaFoto: linha.card_key,
        estaPerdido: linha.esta_perdido === true,
      };
    },
  };
}
