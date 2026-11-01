import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  errosDeTexto,
  normalizarParaConferencia,
  temContatoOuPagamento,
  temContatoOuPagamentoSemEndereco,
  type Lugar,
} from './escrita-do-encontro.js';

/**
 * Quantos encontros ATIVOS (publicados e nao encerrados) uma conta pode ter ao
 * mesmo tempo.
 */
export const TETO_DE_ENCONTROS_ATIVOS = 3;

/** O bloqueio, no vocabulario que a tela sabe explicar. */
export type BloqueioParaCriarEncontro = 'contact_channel_unverified';

/**
 * O estado da conta para a criacao, lido numa consulta so, com a autorizacao na
 * clausula `WHERE` (ADR-0021).
 */
export interface EstadoParaCriarEncontro {
  /** E-mail OU telefone verificado. */
  readonly temCanalVerificado: boolean;
  /** Quantos encontros desta conta estao publicados e ainda nao terminaram. */
  readonly encontrosAtivos: number;
}

export function bloqueiosParaCriarEncontro(
  estado: EstadoParaCriarEncontro,
): BloqueioParaCriarEncontro[] {
  return estado.temCanalVerificado ? [] : ['contact_channel_unverified'];
}

export function atingiuTetoDeEncontros(estado: EstadoParaCriarEncontro): boolean {
  return estado.encontrosAtivos >= TETO_DE_ENCONTROS_ATIVOS;
}

const CEP = /(?<!\d)\d{5}-?\d{3}(?!\d)/;

const LOGRADOURO =
  /\b(?:rua|r|avenida|av|alameda|al|travessa|tv|estrada|est|rodovia|rod|via|viela|ladeira|servidao|marginal|anel|largo|rotula)\b/;

const NUMERO_NO_NOME_DO_LOGRADOURO =
  /\b(?:rua|r|avenida|av|alameda|al|travessa|tv|estrada|est|rodovia|rod|via|viela|ladeira|servidao|marginal|anel|largo|rotula)\.?\s+\d{1,4}\b/g;

const QUILOMETRO = /\bkm\s*\.?\s*\d/;

const NUMERO_DE_PORTA = /(?:,\s*|\s-\s*|\bn\.?o?\.?\s*|\bnu?m?(?:ero)?\.?\s*|#\s*)\d{1,6}\b/;

const SEM_NUMERO = /\bs\s*[/.]\s*n(?:o|\u00ba)?(?![a-z])|\bsem\s+numero\b/;

const NUMERO_LONGO = /(?<!\d)\d{4,}(?!\d)/;

const COMPLEMENTO = /\b(?:apto|apartamento|bloco|bl|casa|cs|fundos|sobrado|conjunto|cj|andar|sala)\b\s*\d|\bcond(?:ominio)?\b/;

/**
 * O nome do lugar: 2 a 80, sem controle bidirecional, **sem endereco dentro** e
 * sem contato nem pagamento.
 */
export function errosDoNomeDoLugar(campo: string, valor: string): ProblemFieldError[] {
  const tamanho = errosDeTexto(campo, valor, 2, 80);
  if (tamanho.length > 0) return tamanho;
  if (temContatoOuPagamentoSemEndereco(valor)) return [erroDeContato(campo)];
  const { base, letras } = normalizarParaConferencia(valor.normalize('NFKC'));
  const semNumeroDoNome = base.replace(NUMERO_NO_NOME_DO_LOGRADOURO, ' logradouro ');
  const comLogradouro = LOGRADOURO.test(base) || LOGRADOURO.test(letras);
  const endereco =
    CEP.test(base) ||
    QUILOMETRO.test(base) ||
    SEM_NUMERO.test(base) ||
    NUMERO_LONGO.test(semNumeroDoNome) ||
    NUMERO_DE_PORTA.test(semNumeroDoNome) ||
    COMPLEMENTO.test(base) ||
    (comLogradouro && /\d/.test(semNumeroDoNome));
  if (endereco) {
    return [
      {
        field: campo,
        code: 'address_in_place_name',
        message:
          'Escreva só o nome do lugar, como as pessoas o chamam. Endereço, número e CEP não entram aqui.',
      },
    ];
  }
  return [];
}

function erroDeContato(campo: string): ProblemFieldError {
  return {
    field: campo,
    code: 'contact_or_payment_detected',
    message:
      'Este texto não pode ter telefone, e-mail, link, perfil, chave PIX nem dados de pagamento.',
  };
}

/** Tamanho e **D59 juntos**, para todo texto que a comunidade escreve. */
export function errosDeTextoDeUsuario(
  campo: string,
  valor: string,
  minimo: number,
  maximo: number,
): ProblemFieldError[] {
  const tamanho = errosDeTexto(campo, valor, minimo, maximo);
  if (tamanho.length > 0) return tamanho;
  if (!temContatoOuPagamento(valor)) return [];
  return [erroDeContato(campo)];
}

/** O lugar, como a comunidade o descreve: **tres rotulos e nada mais**. */
export interface LugarDaComunidade {
  readonly place_name: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
}

/** A capa, pelo `upload_id` de `createNetworkEventCoverUploadIntent`. */
export interface CapaDoCorpo {
  readonly upload_id: string;
  readonly alt_text?: string;
}

/** O corpo de `createNetworkEvent`, como o contrato o declara. */
export interface CorpoDoEncontroDaComunidade {
  readonly title: string;
  readonly summary: string;
  readonly place: LugarDaComunidade;
  readonly starts_at: string;
  readonly ends_at?: string;
  readonly time_zone?: string;
  readonly accepted_sizes?: readonly string[];
  readonly dog_age?: string;
  readonly vaccination_required?: boolean;
  readonly fenced_off_leash_area?: boolean;
  readonly amenities?: readonly string[];
  readonly bring_items?: readonly string[];
  readonly notes?: string;
  readonly cover_image?: CapaDoCorpo;
  /**
   * Ate QUATRO imagens do encontro, **na ordem em que o autor as colocou**
   * (cliente, 29/10/2026: *"nas indicacoes de estabelecimento e eventos so esta
   * sendo possivel enviar uma imagem no app, devemos deixar enviar ate 4
   * imagens"*). A **primeira e a capa**, pela `position` e nao por um campo.
   *
   * **A rota de autorizacao e a QUE JA EXISTE**
   * (`createNetworkEventCoverUploadIntent`): o proposito e `network_event` nas
   * quatro, a minima e 600 x 600 nas quatro e a derivada e `DERIVADAS_DO_ENCONTRO`
   * nas quatro. Nao ha nada que distinga a segunda imagem da primeira no ENVIO.
   *
   * **SE EXCLUI com `cover_image`:** os dois no mesmo corpo sao `400`
   * (`code: cover_and_images_both_sent`). `cover_image` fica porque o APK
   * publicado so manda ele -- tira-lo seria `request-property-removed`.
   *
   * **Nao ha migracao nesta ponta:** `network_event_images.position` tem
   * `CHECK (position BETWEEN 0 AND 7)` desde a `20260928000004`, e o aplicativo
   * passa a ocupar quatro das oito posicoes que a tabela ja tinha.
   */
  readonly image_upload_ids?: readonly string[];
}

/** O corpo de `updateNetworkEvent` (`CommunityNetworkEventPatch`). */
export interface PatchDoEncontroDaComunidade {
  readonly title?: string;
  readonly summary?: string;
  readonly place?: LugarDaComunidade;
  readonly starts_at?: string;
  readonly ends_at?: string | null;
  readonly time_zone?: string;
  readonly accepted_sizes?: readonly string[];
  readonly dog_age?: string;
  readonly vaccination_required?: boolean;
  readonly fenced_off_leash_area?: boolean;
  readonly amenities?: readonly string[];
  readonly bring_items?: readonly string[];
  readonly notes?: string | null;
  readonly cover_image?: CapaDoCorpo | null;
}

export interface CorpoDoCancelamentoDaComunidade {
  readonly note: string;
}

/** O que o repositorio grava na criacao. */
export interface NovoEncontroDaComunidade {
  readonly id: string;
  readonly autor: string;
  readonly title: string;
  readonly summary: string;
  readonly lugar: Lugar;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly timeZone: string;
  readonly idadeDosCaes: string;
  readonly vacinacaoExigida: boolean;
  readonly areaCercada: boolean;
  readonly observacoes: string | null;
  readonly portes: readonly string[];
  readonly estrutura: readonly string[];
  readonly paraLevar: readonly string[];
  readonly capa: { readonly uploadId: string; readonly altText: string | null } | null;
  readonly agora: Instant;
}

/** O que a edicao grava. Campo ausente nao muda. */
export interface MudancaDoEncontroDaComunidade {
  readonly title?: string;
  readonly summary?: string;
  readonly lugar?: Lugar;
  readonly startsAt?: Date;
  readonly endsAt?: Date | null;
  readonly timeZone?: string;
  readonly idadeDosCaes?: string;
  readonly vacinacaoExigida?: boolean;
  readonly areaCercada?: boolean;
  readonly observacoes?: string | null;
}
