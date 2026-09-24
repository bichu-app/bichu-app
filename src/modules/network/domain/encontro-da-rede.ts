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
  readonly coverImageUrl: string | null;
  readonly publicacao: PublicacaoVisivel;
}

/** O cartao do encontro, como a resposta publica o declara. */
export interface EncontroProjetado {
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
}

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

/**
 * Projeta o encontro para a resposta publica, a mesma na agenda e no detalhe.
 *
 * Campo a campo, e nunca `{ ...encontro }`: o espalhamento publicaria sozinho
 * qualquer campo que o tipo ganhasse depois.
 */
export function projetarEncontro(encontro: EncontroDaRede, agora: Instant): EncontroProjetado {
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
    cover_image_url: encontro.coverImageUrl,
  };
}

/**
 * Projeta o ponto para `getNetworkEventLocation`. Nulo e estado normal: o ponto
 * e opcional (ADR-0027 12.2), e sem ele a tela mostra os rotulos e nao mostra
 * mapa.
 */
export function projetarLocalizacao(ponto: PontoDoEncontro | null): LocalizacaoProjetada {
  return { point: ponto === null ? null : { lat: ponto.lat, lon: ponto.lon } };
}
