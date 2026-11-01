import { rotuloDaArea as rotuloDeAreaCompartilhado } from '../../../shared/lugar/rotulo-de-area.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { Especie, Porte, Sexo } from './cruzamento.js';

/**
 * 30 dias. ADR-0010 ("dados do achador: vida do caso mais 30 dias") e a história
 * "Achado sem correspondência guardado por 30 dias", que esta destrava.
 */
export const RETENCAO_EM_DIAS = 30;

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

const FOLGA_DE_RELOGIO_EM_MILISSEGUNDOS = 60_000;

export interface OndeFoiAchado {
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly city?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly state?: string | undefined;
}

export interface AchadoAvulso {
  readonly especie: Especie;
  readonly porte: Porte;
  readonly sexo?: Sexo;
  readonly racaCodigo?: string;
  readonly racaTextoLivre?: string;
  readonly versaoDosDadosDeReferencia?: string;
  readonly corPrimariaCodigo?: string;
  readonly achadoEm: Instant;
  readonly onde: OndeFoiAchado;
  readonly observacao?: string;
  readonly shareToken?: string;
}

export interface ProblemaDeCampo {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

export const FAIXA_DE_LATITUDE = { min: -34, max: 6 } as const;
export const FAIXA_DE_LONGITUDE = { min: -74, max: -32 } as const;

export function temCoordenada(onde: OndeFoiAchado): boolean {
  return typeof onde.lat === 'number' && typeof onde.lon === 'number';
}

/** Tem o mínimo para registrar: coordenada **ou** cidade. */
export function temOndeSuficiente(onde: OndeFoiAchado): boolean {
  return temCoordenada(onde) || (onde.city !== undefined && onde.city.trim() !== '');
}

/** Tudo que recusa o registro, numa lista só. */
export function recusasDoRegistro(achado: AchadoAvulso, agora: Instant): readonly ProblemaDeCampo[] {
  const recusas: ProblemaDeCampo[] = [];

  if (!temOndeSuficiente(achado.onde)) {
    recusas.push({
      field: 'area',
      code: 'required',
      message: 'Diga onde você achou: marque no mapa ou escreva o bairro e a cidade.',
    });
  }

  const { lat, lon } = achado.onde;
  if ((lat === undefined) !== (lon === undefined)) {
    recusas.push({
      field: lat === undefined ? 'location.lat' : 'location.lon',
      code: 'required',
      message: 'Latitude e longitude vão juntas.',
    });
  }
  if (lat !== undefined && (lat < FAIXA_DE_LATITUDE.min || lat > FAIXA_DE_LATITUDE.max)) {
    recusas.push({
      field: 'location.lat',
      code: 'out_of_range',
      message: 'Essa posição não parece ser do Brasil.',
    });
  }
  if (lon !== undefined && (lon < FAIXA_DE_LONGITUDE.min || lon > FAIXA_DE_LONGITUDE.max)) {
    recusas.push({
      field: 'location.lon',
      code: 'out_of_range',
      message: 'Essa posição não parece ser do Brasil.',
    });
  }

  if (Number(achado.achadoEm) > Number(agora) + FOLGA_DE_RELOGIO_EM_MILISSEGUNDOS) {
    recusas.push({
      field: 'found_at',
      code: 'in_future',
      message: 'Essa data ainda não chegou.',
    });
  }

  if (
    achado.racaTextoLivre !== undefined &&
    achado.racaTextoLivre.trim() !== '' &&
    (achado.racaCodigo === undefined || achado.racaCodigo.trim() === '')
  ) {
    recusas.push({
      field: 'breed_free_text',
      code: 'requires_breed_code',
      message: 'Escolha a raça na lista para poder escrever a descrição.',
    });
  }

  return recusas;
}

/** Quando esta linha para de existir, se ela não virar correspondência. */
export function retencaoAPartirDe(criadoEm: Instant): Instant {
  return (Number(criadoEm) + RETENCAO_EM_DIAS * MILISSEGUNDOS_POR_DIA) as Instant;
}

/** O rótulo de área que sai na resposta. */
export function rotuloDaArea(onde: OndeFoiAchado): string | null {
  return rotuloDeAreaCompartilhado(onde);
}

/**
 * O que sai numa resposta de achado — e a lista é fechada aqui, campo a campo,
 * pelo que o `FoundReport` do contrato declara.
 */
export interface AchadoGravado {
  readonly id: string;
  readonly origin: 'tag_scan' | 'stray_report';
  readonly status: 'open' | 'matched' | 'closed';
  readonly especie: Especie | null;
  readonly porte: Porte | null;
  readonly cidade: string | null;
  readonly bairro: string | null;
  readonly achadoEm: Date;
  readonly temFoto: boolean;
  readonly observacao: string | null;
  readonly criadoEm: Date;
  /**
   * O pet que este achado JÁ identificou — e `null` quando o único vínculo possível
   * seria um **palpite** do cruzamento.
   */
  readonly petCorrespondente: PetCorrespondente | null;
}

/**
 * O pet já identificado de um achado: o que a tela desenha, e nada que a enderece
 * no banco.
 */
export interface PetCorrespondente {
  readonly nome: string;
  readonly chaveDaFoto: string | null;
}

/** `FoundReport.matched_pet`, campo a campo como o contrato o declara — ou `null`. */
export function matchedPetDaResposta(
  pet: PetCorrespondente | null,
  baseDeMidia: string,
): { readonly display_name: string; readonly photo_url: string | null } | null {
  if (pet === null) return null;
  return {
    display_name: pet.nome,
    photo_url:
      pet.chaveDaFoto === null ? null : `${baseDeMidia.replace(/\/$/, '')}/${pet.chaveDaFoto}`,
  };
}
