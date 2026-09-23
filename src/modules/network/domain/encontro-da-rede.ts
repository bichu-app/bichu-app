/**
 * A projecao de um encontro da secao `Rede`, e a regra de `status`.
 *
 * ## O que NAO sai daqui, e cada ausencia e a decisao do ADR-0025
 *
 * - **Ninguem.** A presenca e um INTEIRO (`checkin_count`), e nao existe campo
 *   com pessoas em forma nenhuma: nem nome, nem primeiro nome, nem apelido,
 *   nem `slug`, nem avatar, nem contagem por bairro. O motivo e o item 7 do
 *   ADR-0010: uma lista de presenca num encontro de bairro publica, de graca,
 *   que dois animais sao do mesmo tutor -- e o lugar do encontro e uma praca do
 *   bairro dela. Num produto cujo fluxo mais critico e pet perdido, essa e
 *   exatamente a informacao que interessa a quem quer levar um animal.
 * - **O autor da foto.** A galeria projeta `slug`, `image_url` e `caption`, e
 *   mais nada. O banco guarda quem enviou, para remocao, auditoria e resposta a
 *   abuso, e esse campo nunca atravessa esta funcao: dez fotos assinadas sao
 *   dez nomes presentes, com a vantagem, para quem procura, de virem com imagem
 *   do lugar.
 * - **Nenhum UUID, e nao por filtragem: nao ha um.** `network_events` e
 *   `network_event_photos` tem `slug` como chave primaria (ADR-0010 item 6).
 * - **Coordenada, distancia, mapa.** ADR-0006. O lugar sao tres rotulos de
 *   texto, e nao ha latitude, longitude nem CEP em precisao nenhuma.
 * - **`active`.** So evento ativo chega ate aqui. O filtro mora na clausula
 *   `WHERE` (ADR-0021), e nao num `if` desta funcao: projecao que filtra e
 *   projecao que um dia esquece.
 *
 * ## `status` e calculado no SERVIDOR, e e por isso que ele mora aqui
 *
 * Mesma razao do vencimento do preco da `Loja`, e o ADR-0025 secao 6 a escreve:
 * se a regra morasse no aplicativo, um aparelho com relogio errado ou com build
 * antiga chamaria de `upcoming` um encontro de tres semanas atras, e nao
 * haveria como corrigir isso sem passar pela loja de aplicativos -- que leva
 * dias e depende de aprovacao de terceiro. Com a regra aqui, o rotulo **chega
 * pronto** ao aparelho, e todo build, novo ou velho, passa a dizer a mesma
 * coisa no mesmo dia.
 *
 * O instante vem do `Clock`, injetado. `Date.now()` e `new Date()` sao
 * proibidos nesta camada (`src/architecture.rules.mjs`), e a proibicao e o que
 * torna as bordas testaveis sem esperar tres semanas.
 */

import { comoIso } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

/**
 * Os tres rotulos que a tela escreve, **calculados no servidor**.
 *
 * Espelham o `enum` de `NetworkEventStatus` no contrato. Nao ha um quarto, e
 * nao ha `unknown`: um evento tem comeco, entao ele esta em exatamente um dos
 * tres a cada instante.
 */
export type StatusDoEncontro = 'upcoming' | 'happening' | 'ended';

/** O encontro como o repositorio o entrega. Sem `active`, sem UUID. */
export interface EncontroDaRede {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly placeName: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  /**
   * O instante absoluto. A hora de PAREDE sai de `timeZone`, e nao daqui.
   *
   * E um `Instant` -- a mesma marca que o `Clock` produz -- porque ele so
   * existe para ser comparado com `agora`. Um `number` cru dos dois lados
   * deixaria compilar a comparacao entre um instante e qualquer outro numero
   * que passasse por perto, e a marca e o que a recusa.
   */
  readonly startsAt: Instant;
  /** Nulo quando o encontro nao declara fim, e a ausencia e estado normal. */
  readonly endsAt: Instant | null;
  /**
   * O nome IANA da zona, e ele nao e enfeite: `startsAt` sozinho diz o instante
   * e nao diz que horas o cartaz da praca dizia. Um aparelho em UTC
   * renderizaria um encontro das 9h como 12h, sem nada acusar, e o Brasil tem
   * mais de uma zona.
   */
  readonly timeZone: string;
  readonly coverImageUrl: string | null;
  /** **Quantas pessoas, e nunca quais.** ADR-0025 secao 2. */
  readonly checkinCount: number;
  readonly photoCount: number;
}

/** Uma foto da galeria, como o repositorio a entrega. Ja sem autor. */
export interface FotoDoEncontro {
  readonly slug: string;
  readonly imageUrl: string;
  readonly caption: string | null;
}

/** O encontro com a galeria e o sinal de navegacao de quem chama. */
export interface EncontroComGaleria extends EncontroDaRede {
  readonly galeria: readonly FotoDoEncontro[];
  /**
   * Se **quem esta chamando** ja confirmou presenca. `false` para quem chega
   * sem conta. Precedente do campo `viewer` do ADR-0021: e sinal de navegacao,
   * nao destranca campo nenhum e nao fala de terceiro.
   */
  readonly viewerCheckedIn: boolean;
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
  readonly checkin_count: number;
  readonly photo_count: number;
}

/** A foto, como a resposta publica a declara. Tres campos, e mais nada. */
export interface FotoProjetada {
  readonly slug: string;
  readonly image_url: string;
  readonly caption: string | null;
}

/** O encontro com a galeria, como a resposta publica o declara. */
export interface EncontroComGaleriaProjetado extends EncontroProjetado {
  readonly gallery: readonly FotoProjetada[];
  readonly viewer_checked_in: boolean;
}

/**
 * O rotulo do encontro, agora.
 *
 * As tres bordas, e cada uma e uma decisao e nao um arredondamento:
 *
 * - **Exatamente em `startsAt` ja e `happening`.** Quem abre a agenda na hora
 *   marcada precisa ler `Acontecendo agora`, e nao a data de um encontro que
 *   comeca neste segundo. A comparacao e `agora >= startsAt`.
 * - **Exatamente em `endsAt` ainda e `happening`.** Mesma razao, do outro lado:
 *   o encontro que termina neste segundo ainda esta acontecendo. A comparacao e
 *   `agora <= endsAt`, e trocar por `<` faria o intervalo ser aberto num dos
 *   extremos e fechado no outro sem que nada explicasse a assimetria.
 * - **Sem `endsAt` nao existe `happening`.** Passou de `startsAt`, e `ended`.
 *   O ADR-0025 secao 6 escreve assim ("passou de `ends_at`, ou de `starts_at`,
 *   quando nao ha fim"), e a alternativa -- inventar uma duracao padrao --
 *   seria o servidor afirmando `Acontecendo agora` sobre um encontro que ele
 *   nao sabe se acabou.
 */
export function statusDoEncontro(encontro: EncontroDaRede, agora: Instant): StatusDoEncontro {
  if (agora < encontro.startsAt) return 'upcoming';
  if (encontro.endsAt === null) return 'ended';
  return agora <= encontro.endsAt ? 'happening' : 'ended';
}

/**
 * Projeta o encontro para a resposta publica.
 *
 * `status` entra aqui e nao no repositorio porque ele e REGRA, e regra testavel
 * sem banco e regra que alguem consegue conferir. A consulta decide quais linhas
 * saem; esta funcao decide o que cada linha diz.
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
    // `comoIso` e o unico caminho declarado de `Instant` para o texto do fio
    // neste repositorio. Montar a data aqui seria a supressao de lint que o
    // cabecalho de `shared/time/clock.ts` existe para evitar.
    starts_at: comoIso(encontro.startsAt),
    ends_at: encontro.endsAt === null ? null : comoIso(encontro.endsAt),
    time_zone: encontro.timeZone,
    status: statusDoEncontro(encontro, agora),
    cover_image_url: encontro.coverImageUrl,
    checkin_count: encontro.checkinCount,
    photo_count: encontro.photoCount,
  };
}

/**
 * Projeta uma foto da galeria: `slug`, `image_url` e `caption`, e mais nada.
 *
 * A escrita e campo a campo e nao `{ ...foto }` de proposito. O espalhamento
 * publicaria, sozinho e em silencio, qualquer campo que a linha ganhasse
 * depois -- e o campo que a linha tem hoje e que nao pode sair e justamente o
 * de quem enviou a foto.
 */
export function projetarFoto(foto: FotoDoEncontro): FotoProjetada {
  return { slug: foto.slug, image_url: foto.imageUrl, caption: foto.caption };
}

/** O encontro com a galeria, para `getNetworkEvent`. */
export function projetarEncontroComGaleria(
  encontro: EncontroComGaleria,
  agora: Instant,
): EncontroComGaleriaProjetado {
  return {
    ...projetarEncontro(encontro, agora),
    gallery: encontro.galeria.map(projetarFoto),
    viewer_checked_in: encontro.viewerCheckedIn,
  };
}
