/** A projeção pública do caso (`PublicLostCase`) e o cartaz (`LostCasePoster`). */
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import { rotuloDaArea } from './abertura-do-caso.js';
import type { components } from '../../../shared/types/generated/api.js';
import type { AbsoluteUrl } from '../../../shared/types/brands.js';
import type { CasoPublico } from '../ports/leitura-publica-do-caso.js';
import type { PerdidoPublico } from '../ports/listagem-publica-de-perdidos.js';

type PublicLostCase = components['schemas']['PublicLostCase'];
type LostCasePoster = components['schemas']['LostCasePoster'];
type PublicLostPet = components['schemas']['PublicLostPet'];

export interface BasesPublicas {
  /** Onde o site mora: de onde saem o link do caso e o do cartaz. */
  readonly baseDaWeb: AbsoluteUrl;
  /** Onde as derivadas públicas da foto moram. */
  readonly baseDeMidia: AbsoluteUrl;
}

export interface LinksDoCaso {
  readonly shareUrl: string;
  readonly posterUrl: string;
}

function semBarraNoFim(base: string): string {
  return base.replace(/\/$/, '');
}

export function linksDoCaso(baseDaWeb: AbsoluteUrl, shareToken: string): LinksDoCaso {
  const base = semBarraNoFim(baseDaWeb);
  return {
    shareUrl: `${base}/p/${shareToken}`,
    posterUrl: `${base}/cartaz/${shareToken}`,
  };
}

/** Texto do tutor, redigido. */
function redigido(texto: string | null): string | null {
  if (texto === null) return null;
  return redigirCanalMediado(texto).texto;
}

/** O nome é obrigatório no contrato, então a redação nunca o transforma em nulo. */
function nomeRedigido(nome: string): string {
  return redigirCanalMediado(nome).texto;
}

function urlDaFoto(caso: CasoPublico, baseDeMidia: AbsoluteUrl): string | null {
  return caso.chaveDaFoto === null ? null : `${semBarraNoFim(baseDeMidia)}/${caso.chaveDaFoto}`;
}

function rotuloPublicoDaArea(caso: CasoPublico): string | null {
  return rotuloDaArea({
    city: caso.cidade ?? undefined,
    neighborhood: caso.bairro ?? undefined,
  });
}

/** `PublicLostCase`, campo a campo como o contrato declara, e nenhum a mais. */
export function projecaoPublicaDoCaso(caso: CasoPublico, bases: BasesPublicas): PublicLostCase {
  const links = linksDoCaso(bases.baseDaWeb, caso.shareToken);
  return {
    share_token: caso.shareToken,
    pet_display_name: nomeRedigido(caso.petNome),
    species: caso.especie,
    breed_label: redigido(caso.racaRotulo),
    size: caso.porte,
    primary_color: caso.corRotulo,
    lost_since: caso.vistoPorUltimoEm.toISOString(),
    area_label: rotuloPublicoDaArea(caso),
    photo_url: urlDaFoto(caso, bases.baseDeMidia),
    share_url: links.shareUrl,
    description: redigido(caso.descricao),
    care_notes: redigido(caso.cuidados),
    can_report_sighting: !caso.doChamador,
    poster_url: links.posterUrl,
    found_by_community: false,
  };
}

/** `LostCasePoster`, campo a campo como o contrato declara. */
export function cartazDoCaso(caso: CasoPublico, bases: BasesPublicas): LostCasePoster {
  return {
    pet_display_name: nomeRedigido(caso.petNome),
    species: caso.especie,
    breed_label: redigido(caso.racaRotulo),
    size: caso.porte,
    primary_color: caso.corRotulo,
    distinctive_marks: redigido(caso.marcas),
    lost_since: caso.vistoPorUltimoEm.toISOString(),
    area_label: rotuloPublicoDaArea(caso),
    photo_url: urlDaFoto(caso, bases.baseDeMidia),
    short_url: linksDoCaso(bases.baseDaWeb, caso.shareToken).shareUrl,
  };
}

/**
 * `PublicLostPet`, campo a campo como o contrato declara — a projeção da LISTAGEM
 * pública.
 */
export function projecaoPublicaDoPerdido(
  perdido: PerdidoPublico,
  bases: BasesPublicas,
): PublicLostPet {
  return {
    share_token: perdido.shareToken,
    pet_display_name: nomeRedigido(perdido.petNome),
    species: perdido.especie,
    breed_label: redigido(perdido.racaRotulo),
    size: perdido.porte,
    primary_color: perdido.corRotulo,
    lost_since: perdido.vistoPorUltimoEm.toISOString(),
    area_label: rotuloDaArea({
      city: perdido.cidade ?? undefined,
      neighborhood: perdido.bairro ?? undefined,
    }),
    photo_url:
      perdido.chaveDaFoto === null
        ? null
        : `${semBarraNoFim(bases.baseDeMidia)}/${perdido.chaveDaFoto}`,
    share_url: linksDoCaso(bases.baseDaWeb, perdido.shareToken).shareUrl,
    found_by_community: perdido.encontradoPelaComunidade,
  };
}
