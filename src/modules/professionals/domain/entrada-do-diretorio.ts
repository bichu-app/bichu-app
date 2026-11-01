import {
  projetarPontuacao,
  type PontuacaoDoLocal,
  type PontuacaoPublica,
} from './avaliacao-do-local.js';
import {
  evidenciasAprovadas,
  nivelDerivado,
  type NivelDeVerificacao,
  type TipoDeEvidencia,
  type VerificacaoDaEntidade,
} from './nivel-de-verificacao.js';

/** A lista fechada de `professionals.kinds`: a ATIVIDADE, o que se contrata. */
export type TipoDeProfissional =
  | 'vet'
  | 'groomer'
  | 'walker'
  | 'sitter'
  | 'trainer'
  | 'clinic'
  | 'store'
  | 'hospital'
  | 'boarding'
  | 'daycare';

/** A lista fechada de `professionals.entity_kind`: o QUE a entrada e. */
export type TipoDeEntidade = 'professional' | 'organization';

/** A grade em que o produto quantiza a localizacao do usuario (ADR-0006). */
export const GRADE_EM_METROS = 100;

/** A entrada como o repositorio a entrega. */
export interface EntradaDoDiretorio {
  readonly slug: string;
  /** AS ATIVIDADES, de 1 a 6 (cliente, 21/10/2026). */
  readonly kinds: readonly TipoDeProfissional[];
  readonly entityKind: TipoDeEntidade;
  readonly displayName: string;
  readonly about: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  readonly phoneE164: string | null;
  /** O SITE (cliente, 21/10/2026). */
  readonly siteUrl: string | null;
  readonly verificacoes: readonly VerificacaoDaEntidade[];
  /** Metros cruas, como o banco as calculou. */
  readonly distanciaEmMetros: number | null;
  /** A LOGO, liberada para o aplicativo pelo cliente em 18/10/2026. */
  readonly logoPublicKey: string | null;
  /** A PONTUACAO AGREGADA do local -- media, contagem e histograma. */
  readonly pontuacao: PontuacaoDoLocal;
}

export interface VerificacaoPublica {
  readonly level: NivelDeVerificacao;
  readonly evidence_kinds: readonly TipoDeEvidencia[];
}

/** `DirectoryEntrySummary` do contrato. */
export interface EntradaPublica {
  readonly slug: string;
  /** A PRIMEIRA atividade, **e ela existe para compatibilidade**. */
  readonly kind: TipoDeProfissional;
  readonly kinds: readonly TipoDeProfissional[];
  readonly entity_kind: TipoDeEntidade;
  readonly display_name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  readonly about: string | null;
  readonly phone_e164: string | null;
  readonly site_url: string | null;
  readonly verification: VerificacaoPublica;
  readonly distance_m: number | null;
  readonly logo_url: string | null;
  /** `DirectoryRating`: a media (NULA sem avaliacao), a quantidade e o histograma. */
  readonly rating: PontuacaoPublica;
}

/** `PublicDirectoryEntrySummary` do contrato: o cartao de quem NAO tem conta. */
export type EntradaPublicaSemConta = Omit<
  EntradaPublica,
  'phone_e164' | 'site_url' | 'distance_m' | 'about'
>;

/** Metros para a grade de 100 m, **sem nunca virar zero para quem esta longe**. */
export function distanciaNaGrade(metros: number | null): number | null {
  if (metros === null || !Number.isFinite(metros)) return null;
  return Math.max(GRADE_EM_METROS, Math.round(metros / GRADE_EM_METROS) * GRADE_EM_METROS);
}

const FORMA_DA_DERIVADA = /^[a-z-]+\/(?:thumb|card|banner)\/[A-Za-z0-9_-]+\.[a-z]+$/;

export function urlDaDerivada(
  chave: string | null,
  urlDeMidia: (chave: string) => string,
): string | null {
  if (chave === null || !FORMA_DA_DERIVADA.test(chave)) return null;
  return urlDeMidia(chave);
}

/** A ATIVIDADE PRINCIPAL: o primeiro item de `kinds`. */
export function atividadePrincipal(kinds: readonly TipoDeProfissional[]): TipoDeProfissional {
  return kinds[0] ?? 'vet';
}

/** O ENDERECO COMERCIAL da entrada, como as quatro colunas o guardam. */
export interface EnderecoComercial {
  readonly postalCode: string | null;
  readonly street: string | null;
  readonly streetNumber: string | null;
  readonly complement: string | null;
}

/** Os quatro campos de endereco de `DirectoryEntryDetail`. */
export interface EnderecoComercialPublico {
  readonly postal_code: string | null;
  readonly street: string | null;
  readonly street_number: string | null;
  readonly complement: string | null;
}

/**
 * As quatro colunas viram os quatro campos do detalhe, **sem compor e sem
 * normalizar**.
 */
export function projetarEnderecoComercial(
  endereco: EnderecoComercial,
): EnderecoComercialPublico {
  return {
    postal_code: endereco.postalCode,
    street: endereco.street,
    street_number: endereco.streetNumber,
    complement: endereco.complement,
  };
}

export function projetarEntrada(
  entrada: EntradaDoDiretorio,
  urlDeMidia: (chave: string) => string,
): EntradaPublica {
  return {
    slug: entrada.slug,
    kind: atividadePrincipal(entrada.kinds),
    kinds: [...entrada.kinds],
    entity_kind: entrada.entityKind,
    display_name: entrada.displayName,
    city: entrada.city,
    state: entrada.state,
    neighborhood: entrada.neighborhood,
    about: entrada.about,
    phone_e164: entrada.phoneE164,
    site_url: entrada.siteUrl,
    verification: {
      level: nivelDerivado(entrada.verificacoes),
      evidence_kinds: evidenciasAprovadas(entrada.verificacoes),
    },
    distance_m: distanciaNaGrade(entrada.distanciaEmMetros),
    logo_url: urlDaDerivada(entrada.logoPublicKey, urlDeMidia),
    rating: projetarPontuacao(entrada.pontuacao),
  };
}

/** A projecao SEM CONTA, **derivada da de conta e nao paralela a ela**. */
export function projetarEntradaSemConta(
  entrada: EntradaDoDiretorio,
  urlDeMidia: (chave: string) => string,
): EntradaPublicaSemConta {
  const cheia = projetarEntrada(entrada, urlDeMidia);
  return {
    slug: cheia.slug,
    kind: cheia.kind,
    kinds: cheia.kinds,
    entity_kind: cheia.entity_kind,
    display_name: cheia.display_name,
    city: cheia.city,
    state: cheia.state,
    neighborhood: cheia.neighborhood,
    verification: cheia.verification,
    logo_url: cheia.logo_url,
    rating: cheia.rating,
  };
}
