/**
 * A projeção do perfil público do pet (`PublicPetProfile`).
 *
 * **Texto do tutor é redigido na saída.** `pets.distinctive_marks`, o nome e a
 * raça digitada não passam pela redação do canal mediado ao gravar (só
 * `care_notes` passa), e o perfil público é indexável por natureza. A regra
 * "resposta pública nunca expõe telefone" não tem exceção por campo (ADR-0021),
 * então a superfície pública redige o que a gravação deixou passar. A redação é
 * idempotente: texto já redigido sai igual.
 *
 * `care_notes` NÃO está aqui porque o contrato não o declara em
 * `PublicPetProfile`. Propriedade a mais passa por qualquer comparador de
 * contrato, e é por isso que esta função monta campo a campo.
 */
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
