/** A projeção do perfil público do pet (`PublicPetProfile`). */
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import type { components } from '../../../shared/types/generated/api.js';
import type { AbsoluteUrl } from '../../../shared/types/brands.js';
import type { PerfilPublicoDoPet } from '../ports/perfil-publico.js';

type PublicPetProfile = components['schemas']['PublicPetProfile'];

function redigido(texto: string | null): string | null {
  return texto === null ? null : redigirCanalMediado(texto).texto;
}

export function projecaoDoPerfilPublico(
  perfil: PerfilPublicoDoPet,
  baseDeMidia: AbsoluteUrl,
): PublicPetProfile {
  return {
    slug: perfil.slug,
    display_name: redigirCanalMediado(perfil.nome).texto,
    species: perfil.especie,
    breed_label: redigido(perfil.racaRotulo),
    size: perfil.porte,
    primary_color: perfil.corRotulo,
    distinctive_marks: redigido(perfil.marcas),
    photo_url:
      perfil.chaveDaFoto === null
        ? null
        : `${baseDeMidia.replace(/\/$/, '')}/${perfil.chaveDaFoto}`,
    is_lost: perfil.estaPerdido,
  };
}
