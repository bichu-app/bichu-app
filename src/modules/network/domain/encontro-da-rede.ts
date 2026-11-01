import type { OrigemDoEncontro } from '../../../shared/db/schema.js';
import { comoIso } from '../../../shared/time/clock.js';
import type { AbsoluteUrl, Instant } from '../../../shared/types/brands.js';

/** Os rotulos que a tela escreve, **calculados no servidor**. */
export type StatusDoEncontro = 'upcoming' | 'happening' | 'ended' | 'cancelled';

/** Os estados de publicacao que a LEITURA enxerga. */
export type PublicacaoVisivel = 'published' | 'cancelled';

/** O encontro como o repositorio o entrega. */
export interface EncontroDaRede {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly placeName: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  /** O instante absoluto. A hora de PAREDE sai de `timeZone`, e nao daqui. */
  readonly startsAt: Instant;
  /** Nulo quando o encontro nao declara fim, e a ausencia e estado normal. */
  readonly endsAt: Instant | null;
  /** O nome IANA da zona. Sem ele o instante esta certo e a hora de parede, errada. */
  readonly timeZone: string;
  readonly publicacao: PublicacaoVisivel;
  /** Quem CADASTROU: `admin` (a equipe) ou `community` (uma conta do app). */
  readonly origem: OrigemDoEncontro;
  /**
   * A data local (`AAAA-MM-DD`) no fuso do encontro, calculada pelo banco com `AT
   * TIME ZONE`.
   */
  readonly dataLocal: string;
  readonly visibilidade: 'public' | 'private';
  readonly entrada: EntradaDoEncontro;
  readonly portesAceitos: readonly string[];
  readonly idadeDosCaes: string;
  readonly vacinacaoExigida: boolean;
  readonly areaCercada: boolean;
  readonly estrutura: readonly string[];
  readonly paraLevar: readonly string[];
  readonly observacoes: string | null;
  /**
   * O endereco por extenso. Carregado aqui, mas so projetado conforme
   * `REGRA_DO_ENDERECO` -- hoje, nunca na leitura aberta.
   */
  readonly endereco: string | null;
  /** Link de ingresso, https (ADR-0027 item 22). */
  readonly linkDeIngresso: string | null;
  /** O handle do Instagram, puro. */
  readonly instagram: string | null;
  /** A URL do perfil, montada pelo repositorio com a base da configuracao. */
  readonly instagramUrl: string | null;
  /** Na ordem do painel; a primeira e a capa. */
  readonly imagens: readonly ImagemDoEncontro[];
}

/** Gratuito, ou pago com valor informativo em centavos. */
export type EntradaDoEncontro =
  | { readonly tipo: 'free' }
  | {
      readonly tipo: 'paid';
      readonly centavos: number;
      readonly moeda: 'BRL';
      readonly unidade: 'per_dog' | 'per_pet' | 'per_person' | 'per_pair' | 'per_two_people';
    };

/** Uma imagem, com as URLs ja compostas a partir das chaves publicas. */
export interface ImagemDoEncontro {
  readonly url: string;
  readonly urlDaMiniatura: string | null;
  readonly urlDoBanner: string | null;
  /**
   * **Anulavel desde 21/10/2026**: a coluna perdeu o `NOT NULL` (`20261020000013`,
   * decisao do cliente).
   */
  readonly textoAlternativo: string | null;
}

interface CamposDoEncontroProjetados {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly place: {
    readonly place_name: string;
    readonly neighborhood: string;
    readonly city: string;
    readonly state: string;
  };
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly time_zone: string;
  readonly status: StatusDoEncontro;
  readonly origin: OrigemDoEncontro;
  readonly cover_image_url: string | null;
  readonly cover_banner_url: string | null;
  readonly images: readonly {
    readonly url: string;
    readonly thumb_url: string | null;
    readonly alt_text: string;
  }[];
  readonly admission: {
    readonly kind: 'free' | 'paid';
    readonly price: {
      readonly amount: number;
      readonly currency: 'BRL';
      readonly unit: 'per_dog' | 'per_pet' | 'per_person' | 'per_pair' | 'per_two_people';
    } | null;
  };
  readonly accepted_sizes: readonly string[];
  readonly dog_age: string;
  readonly vaccination_required: boolean;
  readonly fenced_off_leash_area: boolean;
  readonly amenities: readonly string[];
  readonly bring_items: readonly string[];
  readonly notes: string | null;
  readonly ticket_url: string | null;
  readonly instagram_handle: string | null;
  readonly instagram_url: string | null;
  readonly street_address?: string | null;
}

/** O encontro publico, como a leitura publica o declara (`NetworkEventPublic`). */
export interface EncontroPublicoProjetado extends CamposDoEncontroProjetados {
  readonly visibility: 'public';
  /** O endereco da pagina publica do encontro no site. */
  readonly share_url?: string;
}

/**
 * O teaser do privado (`NetworkEventPrivateTeaser`): **exatamente** cinco
 * propriedades.
 */
export interface TeaserDoPrivado {
  readonly slug: string;
  readonly title: string;
  readonly local_date: string;
  readonly visibility: 'private';
  readonly status: StatusDoEncontro;
}

/**
 * O encontro na lista do DONO (`MyNetworkEvent`, 19/10/2026): **exatamente sete
 * propriedades**.
 */
export interface MeuEncontroProjetado {
  readonly slug: string;
  readonly title: string;
  readonly cover: CapaDoMeuEncontroProjetada | null;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly time_zone: string;
  readonly status: StatusDoEncontro;
}

/** A capa do dono (`MyNetworkEventCover`): a imagem e o que aconteceu com ela. */
export interface CapaDoMeuEncontroProjetada {
  readonly status: 'processing' | 'ready' | 'rejected';
  readonly url: string | null;
  readonly rejection_reason: string | null;
}

/** O que a agenda e o detalhe devolvem: publico inteiro ou teaser. */
export type EncontroProjetado = EncontroPublicoProjetado | TeaserDoPrivado;

/** O conteudo oculto do privado, so para aprovado (`NetworkEventPrivateDetails`). */
export type DetalhesPrivadosProjetados = CamposDoEncontroProjetados;

/** O ponto do encontro, marcado no mapa pelo administrador (`map_pin`). */
export interface PontoDoEncontro {
  readonly lat: number;
  readonly lon: number;
}

/** A resposta de `getNetworkEventLocation`: o ponto, ou nulo quando nao ha. */
export interface LocalizacaoProjetada {
  readonly point: { readonly lat: number; readonly lon: number } | null;
  readonly street_address: string | null;
}

/** ONDE O ENDERECO DO ENCONTRO SAI -- A REGRA, NUM PONTO SO. */
export type RegraDoEndereco = 'so_com_conta' | 'publico';
export const REGRA_DO_ENDERECO: RegraDoEndereco = 'so_com_conta';

/**
 * O endereco na leitura aberta (agenda, detalhe, detalhes do privado), conforme a
 * regra.
 */
export function enderecoNaLeituraAberta(
  endereco: string | null,
  regra: RegraDoEndereco = REGRA_DO_ENDERECO,
): { readonly street_address?: string | null } {
  return regra === 'publico' ? { street_address: endereco } : {};
}

function statusTemporal(
  encontro: EncontroDaRede,
  agora: Instant,
): Exclude<StatusDoEncontro, 'cancelled'> {
  if (agora < encontro.startsAt) return 'upcoming';
  if (encontro.endsAt === null) return 'ended';
  return agora <= encontro.endsAt ? 'happening' : 'ended';
}

function deslocamentoDoFuso(instante: number, timeZone: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);
  const n = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(instante / 1000) * 1000;
}

/** 23:59:59 do dia `dataLocal` (`AAAA-MM-DD`) no fuso `timeZone`, como instante. */
export function fimDoDiaLocal(dataLocal: string, timeZone: string): Instant {
  const [ano, mes, dia] = dataLocal.split('-').map(Number);
  const parede = Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, 23, 59, 59);
  let instante = parede - deslocamentoDoFuso(parede, timeZone);
  instante = parede - deslocamentoDoFuso(instante, timeZone);
  return instante as Instant;
}

/**
 * Ate quando o cancelado aparece COMO cancelado: o fim previsto, ou, sem `endsAt`,
 * 23:59:59 do dia do encontro no fuso dele (decisao de 28/09).
 */
export function fimDoCancelado(encontro: Pick<EncontroDaRede, 'endsAt' | 'dataLocal' | 'timeZone'>): Instant {
  return encontro.endsAt ?? fimDoDiaLocal(encontro.dataLocal, encontro.timeZone);
}

/** O rotulo do encontro, agora. */
export function statusDoEncontro(encontro: EncontroDaRede, agora: Instant): StatusDoEncontro {
  if (encontro.publicacao === 'cancelled') {
    return agora <= fimDoCancelado(encontro) ? 'cancelled' : 'ended';
  }
  return statusTemporal(encontro, agora);
}

function camposProjetados(encontro: EncontroDaRede, agora: Instant): CamposDoEncontroProjetados {
  const imagens = encontro.imagens.map((imagem) => ({
    url: imagem.url,
    thumb_url: imagem.urlDaMiniatura,
    alt_text: imagem.textoAlternativo ?? encontro.title,
  }));
  const capa = encontro.imagens[0];
  return {
    slug: encontro.slug,
    title: encontro.title,
    summary: encontro.summary,
    place: {
      place_name: encontro.placeName,
      neighborhood: encontro.neighborhood,
      city: encontro.city,
      state: encontro.state,
    },
    starts_at: comoIso(encontro.startsAt),
    ends_at: encontro.endsAt === null ? null : comoIso(encontro.endsAt),
    time_zone: encontro.timeZone,
    status: statusDoEncontro(encontro, agora),
    origin: encontro.origem,
    cover_image_url: capa?.url ?? null,
    cover_banner_url: capa?.urlDoBanner ?? null,
    images: imagens,
    admission:
      encontro.entrada.tipo === 'free'
        ? { kind: 'free', price: null }
        : {
            kind: 'paid',
            price: {
              amount: encontro.entrada.centavos,
              currency: encontro.entrada.moeda,
              unit: encontro.entrada.unidade,
            },
          },
    accepted_sizes: [...encontro.portesAceitos],
    dog_age: encontro.idadeDosCaes,
    vaccination_required: encontro.vacinacaoExigida,
    fenced_off_leash_area: encontro.areaCercada,
    amenities: [...encontro.estrutura],
    bring_items: [...encontro.paraLevar],
    notes: encontro.observacoes,
    ticket_url: encontro.linkDeIngresso,
    instagram_handle: encontro.instagram,
    instagram_url: encontro.instagramUrl,
    ...enderecoNaLeituraAberta(encontro.endereco),
  };
}

/** O teaser do privado, **construido** com as cinco propriedades e nenhuma outra. */
export function projetarTeaser(encontro: EncontroDaRede, agora: Instant): TeaserDoPrivado {
  return {
    slug: encontro.slug,
    title: encontro.title,
    local_date: encontro.dataLocal,
    visibility: 'private',
    status: statusDoEncontro(encontro, agora),
  };
}

/** Onde a pagina publica do encontro mora, e se ela existe de verdade. */
export interface PaginaDoEncontroNoSite {
  /** `WEB_BASE_URL`: onde o site mora. */
  readonly baseDaWeb: AbsoluteUrl;
  /** `site_page_availability` disse `true` para `network_event`? */
  readonly publicada: boolean;
}

/**
 * O endereco da pagina publica deste encontro, ou `null` -- e `null` e a resposta
 * na maioria dos dias.
 */
export function linkPublicoDoEncontro(
  encontro: EncontroDaRede,
  agora: Instant,
  pagina: PaginaDoEncontroNoSite | undefined,
): string | null {
  if (pagina === undefined || !pagina.publicada) return null;
  if (encontro.visibilidade === 'private') return null;
  const status = statusDoEncontro(encontro, agora);
  if (status === 'cancelled' || status === 'ended') return null;
  return `${pagina.baseDaWeb.replace(/\/$/, '')}/encontro/${encontro.slug}`;
}

/** Projeta o encontro para a agenda e o detalhe. */
export function projetarEncontro(
  encontro: EncontroDaRede,
  agora: Instant,
  pagina?: PaginaDoEncontroNoSite,
): EncontroProjetado {
  if (encontro.visibilidade === 'private') return projetarTeaser(encontro, agora);
  const link = linkPublicoDoEncontro(encontro, agora, pagina);
  return {
    ...camposProjetados(encontro, agora),
    visibility: 'public',
    ...(link === null ? {} : { share_url: link }),
  };
}

/** A capa como a LEITURA do dono a entrega. */
export interface CapaDaLeituraDoDono {
  readonly estado: 'processing' | 'ready' | 'rejected';
  readonly url: string | null;
  readonly motivoDaRecusa: string | null;
}

/** A projecao do DONO, **construida** com as sete propriedades e nenhuma outra. */
export function projetarMeuEncontro(
  encontro: EncontroDaRede,
  capa: CapaDaLeituraDoDono | null,
  agora: Instant,
): MeuEncontroProjetado {
  return {
    slug: encontro.slug,
    title: encontro.title,
    cover:
      capa === null
        ? null
        : {
            status: capa.estado,
            url: capa.url,
            rejection_reason: capa.motivoDaRecusa,
          },
    starts_at: comoIso(encontro.startsAt),
    ends_at: encontro.endsAt === null ? null : comoIso(encontro.endsAt),
    time_zone: encontro.timeZone,
    status: statusDoEncontro(encontro, agora),
  };
}

/** O conteudo oculto, para `getNetworkEventPrivateDetails`. */
export function projetarDetalhesPrivados(
  encontro: EncontroDaRede,
  agora: Instant,
): DetalhesPrivadosProjetados {
  return camposProjetados(encontro, agora);
}

/** Arredonda a distancia a 100 m, como `Perto`: precisao maior e localizacao. */
export function distanciaArredondada(metros: number | null): number | null {
  return metros === null ? null : Math.round(metros / 100) * 100;
}

/** O estado que o tutor ve (`JoinRequestAppState`). */
export type EstadoDoPedidoNoApp = 'requested' | 'approved' | 'withdrawn' | 'expired';

export function estadoDoPedidoNoApp(
  decisao: 'pending' | 'approved' | 'declined',
  encontro: EncontroDaRede,
  agora: Instant,
): EstadoDoPedidoNoApp {
  if (decisao === 'approved') return 'approved';
  return statusTemporal(encontro, agora) === 'ended' ? 'expired' : 'requested';
}

/** Se o encontro ja terminou, pela mesma regra do rotulo. */
export function encontroEncerrado(encontro: EncontroDaRede, agora: Instant): boolean {
  return statusTemporal(encontro, agora) === 'ended';
}

/** Projeta o ponto para `getNetworkEventLocation`. */
export function projetarLocalizacao(
  ponto: PontoDoEncontro | null,
  endereco: string | null = null,
): LocalizacaoProjetada {
  return { point: ponto === null ? null : { lat: ponto.lat, lon: ponto.lon }, street_address: endereco };
}
