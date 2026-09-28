/**
 * A projecao de um encontro da secao `Rede`, a regra de `status` e o ponto.
 *
 * ## O que NAO sai daqui, e cada ausencia e uma decisao
 *
 * - **Ninguem.** Nao existe campo com pessoas em forma nenhuma. Check-in e
 *   galeria sairam desta versao por decisao do cliente (23/09/2026, ADR-0027
 *   12.4); quando voltarem, voltam pelas decisoes 1 a 3 do ADR-0025: presenca
 *   como numero e nunca como lista, foto sem autor.
 * - **Nenhum UUID.** `network_events` tem `id uuid` (ADR-0024) e ele nao chega
 *   ate aqui: o repositorio nao o seleciona para leitura.
 * - **Coordenada, na agenda e no detalhe.** As duas leituras sao alcancaveis
 *   sem conta, e o ponto do encontro so sai em resposta autenticada, numa
 *   operacao propria (ADR-0027 12.5, emenda 1 do ADR-0010). Por isso o ponto
 *   nao e campo de `EncontroDaRede`: ele tem tipo e projecao separados,
 *   `PontoDoEncontro` e `projetarLocalizacao`, e nao ha como uma projecao
 *   publica o levar junto por espalhamento.
 * - **`publication_status`.** Chega ate aqui so o que e visivel. O filtro mora
 *   na clausula `WHERE` (ADR-0021), e nao num `if` desta funcao. O que a
 *   projecao sabe da publicacao e so se o encontro foi CANCELADO, porque isso
 *   muda o rotulo.
 *
 * ## `status` e calculado no SERVIDOR, e e por isso que ele mora aqui
 *
 * Mesma razao do vencimento do preco da `Loja` (ADR-0025 secao 6): se a regra
 * morasse no aplicativo, um aparelho com relogio errado ou com build antiga
 * chamaria de `upcoming` um encontro de tres semanas atras, e nao haveria como
 * corrigir isso sem passar pela loja de aplicativos.
 *
 * O instante vem do `Clock`, injetado. `Date.now()` e `new Date()` sao
 * proibidos nesta camada (`src/architecture.rules.mjs`).
 */

import { comoIso } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

/**
 * Os rotulos que a tela escreve, **calculados no servidor**.
 *
 * Espelham o `enum` de `NetworkEventStatus` no contrato. `cancelled` entrou com
 * a emenda (ADR-0027 12.6) e prevalece sobre o estado temporal enquanto o
 * encontro nao terminou; depois do fim, o cancelado segue a regra do
 * encerrado (decisao do cliente de 23/09/2026).
 */
export type StatusDoEncontro = 'upcoming' | 'happening' | 'ended' | 'cancelled';

/**
 * Os estados de publicacao que a LEITURA enxerga. `pending_review` e `removed`
 * nao estao aqui porque nunca saem da consulta: o tipo diz o que a clausula
 * `WHERE` ja garantiu.
 */
export type PublicacaoVisivel = 'published' | 'cancelled';

/** O encontro como o repositorio o entrega. Sem UUID e sem ponto. */
export interface EncontroDaRede {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly placeName: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  /**
   * O instante absoluto. A hora de PAREDE sai de `timeZone`, e nao daqui. E um
   * `Instant` -- a mesma marca que o `Clock` produz -- porque ele so existe
   * para ser comparado com `agora`.
   */
  readonly startsAt: Instant;
  /** Nulo quando o encontro nao declara fim, e a ausencia e estado normal. */
  readonly endsAt: Instant | null;
  /** O nome IANA da zona. Sem ele o instante esta certo e a hora de parede, errada. */
  readonly timeZone: string;
  readonly publicacao: PublicacaoVisivel;
  /**
   * A data local (`AAAA-MM-DD`) no fuso do encontro, calculada pelo banco com
   * `AT TIME ZONE`. E o que o teaser do privado leva no lugar de `starts_at`,
   * `ends_at` e `time_zone` (ADR-0027 12.10): o nome do fuso entregaria o
   * estado.
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
      readonly unidade: 'per_dog' | 'per_person' | 'per_pair';
    };

/** Uma imagem, com a URL ja composta a partir da chave publica. */
export interface ImagemDoEncontro {
  readonly url: string;
  readonly textoAlternativo: string;
}

/** Os campos do item 17, na forma do fio. Comuns ao publico e ao privado aprovado. */
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
  readonly cover_image_url: string | null;
  readonly images: readonly { readonly url: string; readonly alt_text: string }[];
  readonly admission: {
    readonly kind: 'free' | 'paid';
    readonly price: {
      readonly amount: number;
      readonly currency: 'BRL';
      readonly unit: 'per_dog' | 'per_person' | 'per_pair';
    } | null;
  };
  readonly accepted_sizes: readonly string[];
  readonly dog_age: string;
  readonly vaccination_required: boolean;
  readonly fenced_off_leash_area: boolean;
  readonly amenities: readonly string[];
  readonly bring_items: readonly string[];
  readonly notes: string | null;
}

/** O encontro publico, como a leitura publica o declara (`NetworkEventPublic`). */
export interface EncontroPublicoProjetado extends CamposDoEncontroProjetados {
  readonly visibility: 'public';
}

/**
 * O teaser do privado (`NetworkEventPrivateTeaser`): **exatamente** cinco
 * propriedades. Lista permitida, e o portao P19 cobra o contrato; esta
 * interface cobra o codigo.
 */
export interface TeaserDoPrivado {
  readonly slug: string;
  readonly title: string;
  readonly local_date: string;
  readonly visibility: 'private';
  readonly status: StatusDoEncontro;
}

/** O que a agenda e o detalhe devolvem: publico inteiro ou teaser. */
export type EncontroProjetado = EncontroPublicoProjetado | TeaserDoPrivado;

/** O conteudo oculto do privado, so para aprovado (`NetworkEventPrivateDetails`). */
export type DetalhesPrivadosProjetados = CamposDoEncontroProjetados;

/**
 * O ponto do encontro, marcado no mapa pelo administrador (`map_pin`).
 *
 * Tipo proprio, e nao campo de `EncontroDaRede`, de proposito: as duas leituras
 * publicas projetam `EncontroDaRede`, e um campo de ponto la dentro ficaria a
 * um espalhamento distraido de sair sem conta.
 */
export interface PontoDoEncontro {
  readonly lat: number;
  readonly lon: number;
}

/** A resposta de `getNetworkEventLocation`: o ponto, ou nulo quando nao ha. */
export interface LocalizacaoProjetada {
  readonly point: { readonly lat: number; readonly lon: number } | null;
}

/**
 * O rotulo temporal, sem olhar a publicacao.
 *
 * - **Exatamente em `startsAt` ja e `happening`.** A comparacao e
 *   `agora >= startsAt`.
 * - **Exatamente em `endsAt` ainda e `happening`.** A comparacao e
 *   `agora <= endsAt`.
 * - **Sem `endsAt` nao existe `happening`.** Passou de `startsAt`, e `ended`
 *   (ADR-0025 secao 6): inventar uma duracao padrao seria o servidor afirmando
 *   `Acontecendo agora` sobre um encontro que ele nao sabe se acabou.
 */
function statusTemporal(
  encontro: EncontroDaRede,
  agora: Instant,
): Exclude<StatusDoEncontro, 'cancelled'> {
  if (agora < encontro.startsAt) return 'upcoming';
  if (encontro.endsAt === null) return 'ended';
  return agora <= encontro.endsAt ? 'happening' : 'ended';
}

/**
 * O rotulo do encontro, agora.
 *
 * **O cancelado nao conta como agendado nem como acontecendo agora**: enquanto
 * o fim previsto nao passou, ele e `cancelled`, e quem se programou para ir
 * descobre antes de sair de casa. **Depois do fim, segue a regra do
 * encerrado**, como qualquer encontro: um cancelado de tres semanas atras e
 * passado. Decisao do cliente de 23/09/2026 sobre a pergunta 1 do ADR-0027.
 */
export function statusDoEncontro(encontro: EncontroDaRede, agora: Instant): StatusDoEncontro {
  const temporal = statusTemporal(encontro, agora);
  if (encontro.publicacao === 'cancelled' && temporal !== 'ended') return 'cancelled';
  return temporal;
}

/** Os campos comuns, campo a campo. Nunca `{ ...encontro }`. */
function camposProjetados(encontro: EncontroDaRede, agora: Instant): CamposDoEncontroProjetados {
  const imagens = encontro.imagens.map((imagem) => ({
    url: imagem.url,
    alt_text: imagem.textoAlternativo,
  }));
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
    // `comoIso` e o unico caminho declarado de `Instant` para o texto do fio.
    starts_at: comoIso(encontro.startsAt),
    ends_at: encontro.endsAt === null ? null : comoIso(encontro.endsAt),
    time_zone: encontro.timeZone,
    status: statusDoEncontro(encontro, agora),
    // Derivada da imagem de posicao 0, nunca gravada no banco.
    cover_image_url: imagens[0]?.url ?? null,
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
  };
}

/**
 * O teaser do privado, **construido** com as cinco propriedades e nenhuma
 * outra. Nao deriva de `camposProjetados` de proposito: montar o publico e
 * depois apagar campos e lista proibida, e campo novo passaria.
 */
export function projetarTeaser(encontro: EncontroDaRede, agora: Instant): TeaserDoPrivado {
  return {
    slug: encontro.slug,
    title: encontro.title,
    local_date: encontro.dataLocal,
    visibility: 'private',
    status: statusDoEncontro(encontro, agora),
  };
}

/**
 * Projeta o encontro para a agenda e o detalhe. A forma vem da propriedade do
 * EVENTO, igual para qualquer chamador (ADR-0021): o privado sai como teaser
 * inclusive para quem foi aprovado.
 */
export function projetarEncontro(encontro: EncontroDaRede, agora: Instant): EncontroProjetado {
  if (encontro.visibilidade === 'private') return projetarTeaser(encontro, agora);
  return { ...camposProjetados(encontro, agora), visibility: 'public' };
}

/** O conteudo oculto, para `getNetworkEventPrivateDetails`. So quem chama sabe se pode. */
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

/**
 * O estado que o tutor ve (`JoinRequestAppState`). **Nunca `declined`**
 * (ADR-0027 12.11): o recusado e o pendente nao se distinguem, e os dois viram
 * `expired` quando o encontro termina.
 */
export type EstadoDoPedidoNoApp = 'requested' | 'approved' | 'withdrawn' | 'expired';

export function estadoDoPedidoNoApp(
  decisao: 'pending' | 'approved' | 'declined',
  encontro: EncontroDaRede,
  agora: Instant,
): EstadoDoPedidoNoApp {
  if (decisao === 'approved') return 'approved';
  // `pending` e `declined` caem no MESMO ramo, e e isso que torna a recusa
  // invisivel. Separa-los aqui seria o defeito que o P19 item 3 existe para
  // pegar.
  return statusTemporal(encontro, agora) === 'ended' ? 'expired' : 'requested';
}

/** Se o encontro ja terminou, pela mesma regra do rotulo. */
export function encontroEncerrado(encontro: EncontroDaRede, agora: Instant): boolean {
  return statusTemporal(encontro, agora) === 'ended';
}

/**
 * Projeta o ponto para `getNetworkEventLocation`. Nulo e estado normal: o ponto
 * e opcional (ADR-0027 12.2), e sem ele a tela mostra os rotulos e nao mostra
 * mapa.
 */
export function projetarLocalizacao(ponto: PontoDoEncontro | null): LocalizacaoProjetada {
  return { point: ponto === null ? null : { lat: ponto.lat, lon: ponto.lon } };
}
