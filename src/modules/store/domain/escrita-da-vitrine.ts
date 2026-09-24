/**
 * As regras da escrita administrativa da `Loja` (ADR-0027 item 14), sem banco e
 * sem servidor.
 *
 * ## O que mora aqui, e o que nao mora
 *
 * Aqui: o estado de publicacao derivado, o destino que precisa terminar no host
 * do parceiro, a data de consulta que nao pode ser futura, o `ETag`, e as duas
 * projecoes que o painel recebe. Todas sao funcoes puras, testadas em
 * `escrita-da-vitrine.test.ts`.
 *
 * Nao mora aqui: **papel**. A guarda do prefixo `/v1/admin` decide quem entra
 * antes de qualquer leitura do recurso (ADR-0027 item 7), e o item 7 diz com
 * essas palavras que nao ha verificacao de papel dentro de caso de uso.
 *
 * ## O painel ve o preco vencido; o app nao
 *
 * `projetarItemAdministrativo` devolve `amount` mesmo depois de `valid_until`:
 * quem reconfere o preco precisa do numero antigo. A omissao do valor vencido e
 * de `projetarItem`, em `item-da-vitrine.ts`, e continua la. As duas usam o
 * MESMO `estadoDoPreco`, entao "vencido" quer dizer a mesma coisa nas duas
 * superficies.
 *
 * ## Nenhum UUID na saida
 *
 * `ItemAdministrativo` carrega o `id` interno porque a trilha grava por ele
 * (ADR-0027 item 8: o `slug` muda, o `id` nao). As projecoes nao o copiam, e
 * o teste reprova se alguma copiar.
 */
import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import {
  DIAS_DE_VALIDADE_DO_PRECO,
  diasDeCalendario,
  estadoDoPreco,
  type CategoriaDaVitrine,
  type EspecieDoItem,
  type EstadoDoPreco,
} from './item-da-vitrine.js';

/** Derivado no servidor, nunca gravado (`AdminStoreItemPublicationState`). */
export type EstadoDePublicacao = 'draft' | 'published' | 'retired';

export type EstadoDaImagem = 'processing' | 'ready' | 'rejected';

/** Uma imagem da galeria do item, como a escrita a enxerga. */
export interface ImagemDoItem {
  /** O envio (`upload_intents.id`) de que ela nasceu: e o que o painel devolve em `images`. */
  readonly uploadId: string;
  /** `catalog_images.id`, interno. So a trilha e a escrita o veem. */
  readonly imageId: string;
  readonly position: number;
  readonly altText: string;
  readonly status: EstadoDaImagem;
  readonly publicKey: string | null;
  readonly rejectionReason: string | null;
}

/** A tag ligada a um item, como o painel a ve: inclusive a inativa. */
export interface TagDoItem {
  readonly slug: string;
  readonly label: string;
  readonly active: boolean;
}

/** A tag do vocabulario. `id` e interno e nunca sai. */
export interface TagAdministrativa {
  readonly id: string;
  readonly slug: string;
  readonly label: string;
  readonly active: boolean;
  readonly itemCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** O parceiro como a escrita o enxerga. `id` e interno e nunca sai. */
export interface ParceiroAdministrativo {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly host: string;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly itemCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** O item como a escrita o enxerga. `id` e interno e nunca sai. */
export interface ItemAdministrativo {
  readonly id: string;
  readonly slug: string;
  readonly partner: { readonly slug: string; readonly name: string; readonly host: string };
  readonly title: string;
  readonly summary: string;
  readonly category: CategoriaDaVitrine;
  readonly targetUrl: string;
  /**
   * URL do parceiro, so em dado da massa. O painel nunca a escreve (ADR-0027
   * item 6); o que ele escreve e `imagens`.
   */
  readonly imageUrl: string | null;
  readonly species: readonly EspecieDoItem[];
  readonly tags: readonly TagDoItem[];
  /** Em ordem de `position`. */
  readonly imagens: readonly ImagemDoItem[];
  readonly priceAmount: number | null;
  readonly priceCurrency: string | null;
  /** `AAAA-MM-DD`. */
  readonly priceCheckedAt: string | null;
  readonly active: boolean;
  readonly publishedAt: Date | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/**
 * `draft` nunca foi publicado; `published` esta na vitrine; `retired` foi
 * publicado e esta fora. `published_at` e a PRIMEIRA publicacao, e e ele que
 * separa o rascunho do retirado: os dois tem `active = false`.
 */
export function estadoDePublicacao(item: {
  readonly active: boolean;
  readonly publishedAt: Date | null;
}): EstadoDePublicacao {
  if (item.active) return 'published';
  return item.publishedAt === null ? 'draft' : 'retired';
}

/** `AAAA-MM-DD` + `dias`, pelo calendario UTC, que e como `diasDeCalendario` conta. */
export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  if (ano === undefined || mes === undefined || dia === undefined) {
    throw new TypeError(`data fora do formato AAAA-MM-DD: "${data}"`);
  }
  return comoData(Date.UTC(ano, mes - 1, dia + dias) as Instant).toISOString().slice(0, 10);
}

/**
 * O ultimo dia em que o app mostra o valor.
 *
 * `checked_at + 30`, e nao `+ 29`: `estadoDoPreco` so vence com MAIS de 30
 * dias, entao o trigesimo dia ainda vale. Se as duas contas divergissem, o
 * painel diria "vale ate dia 9" e o app pararia de mostrar no dia 9.
 */
export function validoAte(checkedAt: string): string {
  return somarDias(checkedAt, DIAS_DE_VALIDADE_DO_PRECO);
}

/** A data de consulta do preco esta no futuro? Uma pessoa nao consultou amanha. */
export function dataDeConsultaNoFuturo(checkedAt: string, agora: Instant): boolean {
  return diasDeCalendario(checkedAt, agora) < 0;
}

/** Hoje, `AAAA-MM-DD`, pelo calendario UTC. E o corte que a listagem por validade usa. */
export function hojeUtc(agora: Instant): string {
  return comoData(agora).toISOString().slice(0, 10);
}

/**
 * IPv4 em quatro partes decimais, ou IPv6 entre colchetes, que e como o `URL`
 * do WHATWG devolve `hostname`. O contrato nao consegue separar `10.0.0.1` de um
 * nome pela expressao, e diz isso (`HttpsUrl`): a recusa e daqui.
 */
function ehIpLiteral(hostname: string): boolean {
  return hostname.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/** O teto do contrato para URL de entrada (D47). */
export const TETO_DA_URL = 2048;

/**
 * Confere a URL de destino de um item contra o host do parceiro (D47 e ADR-0027
 * item 14).
 *
 * **Termina no host**: `lojadobairro.com.br` e `www.lojadobairro.com.br` casam
 * com `lojadobairro.com.br`; `lojadobairro.com.br.golpe.io` e
 * `falsalojadobairro.com.br` nao. A comparacao e por rotulo (`.` + host), e nao
 * por sufixo de texto: `endsWith(host)` sozinho aceitaria o segundo.
 *
 * Devolve os erros de campo, e nao lanca: quem chama junta com os outros erros
 * do corpo e responde um 400 so.
 */
export function errosDoDestino(
  campo: string,
  targetUrl: string,
  hostDoParceiro: string,
): ProblemFieldError[] {
  if (targetUrl.length > TETO_DA_URL) {
    return [{ field: campo, code: 'invalid_url', message: `Até ${String(TETO_DA_URL)} caracteres.` }];
  }
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return [{ field: campo, code: 'invalid_url', message: 'Não é um endereço válido.' }];
  }
  if (url.protocol !== 'https:') {
    return [{ field: campo, code: 'invalid_url', message: 'Só endereços https.' }];
  }
  if (url.username !== '' || url.password !== '') {
    return [{ field: campo, code: 'invalid_url', message: 'Endereço com usuário ou senha não é aceito.' }];
  }
  if (ehIpLiteral(url.hostname)) {
    return [{ field: campo, code: 'invalid_url', message: 'O endereço precisa ter nome, não número de IP.' }];
  }
  if (!destinoTerminaNoHost(url.hostname, hostDoParceiro)) {
    return [
      {
        field: campo,
        code: 'host_mismatch',
        message: `O destino precisa estar em ${hostDoParceiro}.`,
      },
    ];
  }
  return [];
}

export function destinoTerminaNoHost(hostname: string, host: string): boolean {
  const nome = hostname.toLowerCase();
  const alvo = host.toLowerCase();
  return nome === alvo || nome.endsWith(`.${alvo}`);
}

/**
 * O host do parceiro pode mudar para `novoHost` sem deixar item orfao?
 *
 * Recebe os destinos dos itens e devolve os que deixariam de casar. Lista, e nao
 * booleano, para a mensagem poder dizer quantos.
 */
export function destinosQueDeixariamDeCasar(
  destinos: readonly string[],
  novoHost: string,
): string[] {
  return destinos.filter((destino) => {
    try {
      return !destinoTerminaNoHost(new URL(destino).hostname, novoHost);
    } catch {
      return true;
    }
  });
}

/**
 * Tamanho de texto como o `CHECK` do banco o mede: depois de `btrim`.
 *
 * O contrato mede `minLength` sobre o texto cru, entao `"  a "` passa na borda e
 * morreria no `CHECK` como 500. O texto e gravado aparado, e o tamanho e medido
 * sobre o que vai ser gravado.
 */
export function errosDeTexto(
  campo: string,
  valor: string,
  minimo: number,
  maximo: number,
): ProblemFieldError[] {
  const tamanho = valor.trim().length;
  if (tamanho < minimo || tamanho > maximo) {
    return [
      {
        field: campo,
        code: 'length',
        message: `Entre ${String(minimo)} e ${String(maximo)} caracteres.`,
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// ETag e If-Match
// ---------------------------------------------------------------------------

/** O `ETag` e a `version` do banco, entre aspas (`components/headers/ETag`). */
export function comoEtag(version: number): string {
  return `"${String(version)}"`;
}

/**
 * O que veio em `If-Match`.
 *
 * `ausente` vira 428; `numero` e comparado com a versao atual na clausula
 * `WHERE` do `UPDATE`. Qualquer outra forma (`*`, `W/"3"`, lixo) nao
 * corresponde a versao nenhuma e vira 412: o contrato pede a versao que a
 * pessoa leu, e `*` e justamente "nao li nada".
 */
export type VersaoLida =
  | { readonly tipo: 'ausente' }
  | { readonly tipo: 'numero'; readonly versao: number }
  | { readonly tipo: 'invalida' };

export function lerIfMatch(cabecalho: string | string[] | undefined): VersaoLida {
  if (cabecalho === undefined) return { tipo: 'ausente' };
  const valor = Array.isArray(cabecalho) ? cabecalho.join(',') : cabecalho;
  if (valor.trim() === '') return { tipo: 'ausente' };
  const casado = /^\s*"([1-9][0-9]{0,9})"\s*$/.exec(valor);
  if (casado === null) return { tipo: 'invalida' };
  const versao = Number(casado[1]);
  return Number.isSafeInteger(versao) && versao <= 2_147_483_647
    ? { tipo: 'numero', versao }
    : { tipo: 'invalida' };
}

// ---------------------------------------------------------------------------
// Projecoes do painel
// ---------------------------------------------------------------------------

export interface ParceiroProjetado {
  readonly slug: string;
  readonly name: string;
  readonly host: string;
  readonly active: boolean;
  readonly sort_order: number;
  readonly item_count: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

export function projetarParceiro(p: ParceiroAdministrativo): ParceiroProjetado {
  return {
    slug: p.slug,
    name: p.name,
    host: p.host,
    active: p.active,
    sort_order: p.sortOrder,
    item_count: p.itemCount,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
    version: p.version,
  };
}

/** `AdminCatalogGalleryImage`: a imagem da galeria como o painel a ve. */
export interface ImagemProjetada {
  readonly upload_id: string;
  readonly position: number;
  readonly alt_text: string;
  readonly source: 'uploaded';
  readonly status: EstadoDaImagem;
  readonly url: string | null;
  readonly rejection_reason: string | null;
}

export interface PrecoProjetado {
  readonly amount: number;
  readonly currency: 'BRL';
  readonly checked_at: string;
  readonly valid_until: string;
}

export interface ItemAdministrativoProjetado {
  readonly slug: string;
  readonly partner: { readonly slug: string; readonly name: string; readonly host: string };
  readonly title: string;
  readonly summary: string;
  readonly category: CategoriaDaVitrine;
  readonly target_url: string;
  readonly species: readonly EspecieDoItem[];
  readonly tags: readonly TagDoItem[];
  readonly images: readonly ImagemProjetada[];
  readonly price: PrecoProjetado | null;
  readonly price_status: EstadoDoPreco;
  readonly publication_state: EstadoDePublicacao;
  readonly published_at: string | null;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

/**
 * A galeria como o painel a ve (`AdminCatalogGalleryImage`). So a imagem
 * pronta ganha `url`: a derivada nao e servida antes (ADR-0027 item 10). O
 * `upload_id` e o identificador que o painel devolve em `images` para manter,
 * reordenar ou remover a imagem, e e o unico UUID que esta resposta carrega,
 * porque o contrato o declara.
 *
 * A URL externa da massa (`image_url`) NAO entra aqui: a galeria exige
 * `upload_id`, e a imagem externa nao tem envio. Ver a entrega da BICHUS-267.
 */
function projetarImagens(
  item: ItemAdministrativo,
  urlDeMidia: (chave: string) => string,
): ImagemProjetada[] {
  return item.imagens.map((i) => ({
    upload_id: i.uploadId,
    position: i.position,
    alt_text: i.altText,
    source: 'uploaded',
    status: i.status,
    url: i.status === 'ready' && i.publicKey !== null ? urlDeMidia(i.publicKey) : null,
    rejection_reason: i.status === 'rejected' ? i.rejectionReason : null,
  }));
}

/**
 * Projeta o item para o painel, **com o preco mesmo vencido**.
 *
 * `price` e objeto unico ou `null`; os tres campos do banco andam juntos
 * (`store_items_preco_anda_completo`), entao "preco sem data" nao tem como
 * aparecer aqui.
 */
export function projetarItemAdministrativo(
  item: ItemAdministrativo,
  agora: Instant,
  urlDeMidia: (chave: string) => string,
): ItemAdministrativoProjetado {
  return {
    slug: item.slug,
    partner: { slug: item.partner.slug, name: item.partner.name, host: item.partner.host },
    title: item.title,
    summary: item.summary,
    category: item.category,
    target_url: item.targetUrl,
    species: [...item.species],
    tags: item.tags.map((t) => ({ slug: t.slug, label: t.label, active: t.active })),
    images: projetarImagens(item, urlDeMidia),
    price:
      item.priceAmount !== null && item.priceCheckedAt !== null && item.priceCurrency === 'BRL'
        ? {
            amount: item.priceAmount,
            currency: 'BRL',
            checked_at: item.priceCheckedAt,
            valid_until: validoAte(item.priceCheckedAt),
          }
        : null,
    price_status: estadoDoPreco(item, agora),
    publication_state: estadoDePublicacao(item),
    published_at: item.publishedAt === null ? null : item.publishedAt.toISOString(),
    sort_order: item.sortOrder,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
    version: item.version,
  };
}

// ---------------------------------------------------------------------------
// O vocabulario de tags (ADR-0027 item 16)
// ---------------------------------------------------------------------------

/** Ate 5 tags por item, e ate 40 ativas no vocabulario: um filtro com duzentas opcoes nao filtra. */
export const TETO_DE_TAGS_POR_ITEM = 5;
export const TETO_DE_TAGS_ATIVAS = 40;
/** Ate 8 imagens por item; `position` de 0 a 7. */
export const TETO_DE_IMAGENS_POR_ITEM = 8;

/** Mesmo formato de `Slug` no contrato e de `store_tags_slug_formato` no banco. */
const FORMATO_DE_SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/**
 * O rotulo como vai ser gravado: pontas aparadas e espacos repetidos juntados.
 * E sobre ESTE valor que o tamanho e o conjunto de caracteres sao conferidos.
 */
export function normalizarRotulo(rotulo: string): string {
  return rotulo.trim().replace(/\s+/g, ' ');
}

/**
 * O `slug` da tag, derivado do rotulo: NFKD, sem marca diacritica, minusculo,
 * espaco vira hifen, hifens repetidos viram um, e nenhum hifen nas pontas.
 * `Ração`, `racao` e `RACAO` dao `racao`, e e isso que faz o indice unico do
 * `slug` recusar a segunda grafia.
 */
export function slugDaTag(rotulo: string): string {
  return normalizarRotulo(rotulo)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Confere o rotulo e devolve o que gravar. Letras (com acento), digitos, espaco
 * e hifen, e nada mais (`code: tag_charset`): o conjunto nao comporta URL,
 * e-mail nem simbolo, e e parte do que contem o risco de conteudo publicado sem
 * revisao.
 *
 * O `slug` derivado precisa caber no formato de `Slug` (3 a 30 caracteres).
 * Rotulo de dois caracteres cabe no contrato (`minLength: 2`) e da `slug` de
 * dois, que o formato recusa: `code: tag_slug_invalid`, e a divergencia vai
 * na entrega.
 */
export function conferirRotulo(
  campo: string,
  rotulo: string,
): { readonly erros: ProblemFieldError[]; readonly rotulo: string; readonly slug: string } {
  const normalizado = normalizarRotulo(rotulo);
  const slug = slugDaTag(normalizado);
  if (normalizado.length < 2 || normalizado.length > 24) {
    return { erros: [{ field: campo, code: 'length', message: 'Entre 2 e 24 caracteres.' }], rotulo: normalizado, slug };
  }
  if (!/^[\p{L}\p{N} -]+$/u.test(normalizado)) {
    return {
      erros: [{ field: campo, code: 'tag_charset', message: 'Só letras, números, espaço e hífen.' }],
      rotulo: normalizado,
      slug,
    };
  }
  if (!FORMATO_DE_SLUG.test(slug)) {
    return {
      erros: [
        {
          field: campo,
          code: 'tag_slug_invalid',
          message: 'Este rótulo não forma um endereço válido. Use pelo menos três letras ou números.',
        },
      ],
      rotulo: normalizado,
      slug,
    };
  }
  return { erros: [], rotulo: normalizado, slug };
}

export interface TagProjetada {
  readonly slug: string;
  readonly label: string;
  readonly active: boolean;
  readonly item_count: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

export function projetarTag(t: TagAdministrativa): TagProjetada {
  return {
    slug: t.slug,
    label: t.label,
    active: t.active,
    item_count: t.itemCount,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
    version: t.version,
  };
}
