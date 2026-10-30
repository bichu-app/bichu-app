/**
 * As regras da escrita administrativa da `Loja` (ADR-0027 item 14), sem banco e
 * sem servidor.
 */
import { comoData } from '../../../shared/time/clock.js';
import { errosDoEnderecoCompleto } from '../../../shared/url/endereco-completo.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import {
  DIAS_DE_VALIDADE_DO_PRECO,
  diasDeCalendario,
  estadoDoPreco,
  type CategoriaDaVitrine,
  type SubcategoriaDaVitrine,
  type EspecieDoItem,
  type EstadoDoPreco,
} from './item-da-vitrine.js';

/** Derivado no servidor, nunca gravado (`AdminStoreItemPublicationState`). */
export type EstadoDePublicacao = 'draft' | 'published' | 'retired';

export type EstadoDaImagem = 'processing' | 'ready' | 'rejected';

/** Uma imagem da galeria do item, como a escrita a enxerga. */
export interface ImagemDoItem {
  /**
   * O envio (`upload_intents.id`) de que ela nasceu: e o que o painel devolve em
   * `images`.
   */
  readonly uploadId: string | null;
  /** `catalog_images.id`, interno. */
  readonly imageId: string;
  readonly position: number;
  /**
   * Nulo quando o painel gravou a imagem sem descricao: o texto alternativo virou
   * OPCIONAL na `Loja` em 17/10/2026 (pedido do cliente).
   */
  readonly altText: string | null;
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

/** O parceiro como a escrita o enxerga. */
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

/** O item como a escrita o enxerga. */
export interface ItemAdministrativo {
  readonly id: string;
  readonly slug: string;
  /**
   * **Nulo so no rascunho.** As quatro coisas que a publicacao exige -- parceiro,
   * descricao, categoria e destino -- passaram a ser anulaveis na `20261017000002`
   * para o rascunho poder guardar trabalho incompleto (pedido do cliente de
   * 17/10/2026).
   */
  readonly partner: { readonly slug: string; readonly name: string; readonly host: string } | null;
  /** O minimo do rascunho: nunca nulo. */
  readonly title: string;
  readonly summary: string | null;
  readonly category: CategoriaDaVitrine | null;
  /** O rotulo da categoria, lido de `store_categories` na mesma consulta. */
  readonly categoryLabel: string | null;
  /** O segundo nivel, OPCIONAL. */
  readonly subcategory: SubcategoriaDaVitrine | null;
  /** O rotulo da subcategoria. */
  readonly subcategoryLabel: string | null;
  readonly targetUrl: string | null;
  /** URL do parceiro, so em dado da massa. */
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

/** O que a publicacao exige e o rascunho nao (pedido do cliente de 17/10/2026). */
export type FaltaDaPublicacao = 'partner_slug' | 'summary' | 'category' | 'target_url' | 'species';

/** A ordem em que a tela mostra os campos, que e a ordem do resumo de erros. */
export const ORDEM_DA_FALTA: readonly FaltaDaPublicacao[] = [
  'summary',
  'category',
  'species',
  'partner_slug',
  'target_url',
];

/**
 * **A SEGUNDA REGUA.** O rascunho exige so `title` (o minimo para o registro
 * existir e para a pessoa reencontra-lo na lista); a publicacao exige o conjunto
 * inteiro, e esta funcao e quem diz o que falta, campo por campo.
 */
export function faltaParaPublicar(item: {
  readonly partner: { readonly slug: string } | null;
  readonly summary: string | null;
  readonly category: CategoriaDaVitrine | null;
  readonly targetUrl: string | null;
  readonly species: readonly EspecieDoItem[];
}): readonly FaltaDaPublicacao[] {
  const falta = new Set<FaltaDaPublicacao>();
  if (item.partner === null) falta.add('partner_slug');
  if (item.summary === null) falta.add('summary');
  if (item.category === null) falta.add('category');
  if (item.targetUrl === null) falta.add('target_url');
  if (item.species.length === 0) falta.add('species');
  return ORDEM_DA_FALTA.filter((campo) => falta.has(campo));
}

/** A frase curta de cada falta, como o `400` da publicacao a escreve. */
export const MENSAGEM_DA_FALTA: Record<FaltaDaPublicacao, string> = {
  summary: 'Escreva a descrição antes de publicar.',
  category: 'Escolha a categoria antes de publicar.',
  species: 'Diga a que espécie o produto serve antes de publicar.',
  partner_slug: 'Escolha o parceiro antes de publicar.',
  target_url: 'Informe o link do produto no parceiro antes de publicar.',
};

/** As faltas na forma de erro de campo do contrato. */
export function errosDaFalta(faltas: readonly FaltaDaPublicacao[]): ProblemFieldError[] {
  return faltas.map((campo) => ({
    field: campo,
    code: campo === 'partner_slug' ? 'partner_required' : `${campo}_required`,
    message: MENSAGEM_DA_FALTA[campo],
  }));
}

/**
 * `draft` nunca foi publicado; `published` esta na vitrine; `retired` foi
 * publicado e esta fora.
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

/** O ultimo dia em que o app mostra o valor. */
export function validoAte(checkedAt: string): string {
  return somarDias(checkedAt, DIAS_DE_VALIDADE_DO_PRECO);
}

/** A data de consulta do preco esta no futuro? */
export function dataDeConsultaNoFuturo(checkedAt: string, agora: Instant): boolean {
  return diasDeCalendario(checkedAt, agora) < 0;
}

/** Hoje, `AAAA-MM-DD`, pelo calendario UTC. */
export function hojeUtc(agora: Instant): string {
  return comoData(agora).toISOString().slice(0, 10);
}

/**
 * IPv4 em quatro partes decimais, ou IPv6 entre colchetes, que e como o `URL` do
 * WHATWG devolve `hostname`.
 */
function ehIpLiteral(hostname: string): boolean {
  return hostname.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/** O teto do contrato para URL de entrada (D47). */
export const TETO_DA_URL = 2048;

/**
 * O site do parceiro, **completo e com `https://`** (padrao do cliente de
 * 17/10/2026).
 */
export function errosDoSiteDoParceiro(campo: string, siteUrl: string): ProblemFieldError[] {
  return errosDoEnderecoCompleto(campo, siteUrl, { prefixo: 'site_url', teto: 253 + 'https://'.length });
}

/**
 * Confere a URL de destino de um item contra o host do parceiro (D47 e ADR-0027
 * item 14).
 */
export interface ClassificacaoDoVocabulario {
  readonly categoriaAtiva: boolean;
  /** A subcategoria existe e esta ativa DENTRO da categoria conferida. */
  readonly subcategoriaNaCategoria: boolean;
  /** A subcategoria existe e esta ativa em ALGUMA categoria -- talvez outra. */
  readonly subcategoriaEmAlgumaCategoria: boolean;
}

/**
 * O `achado` de quem NAO consultou o vocabulario, porque nao havia categoria para
 * consultar (rascunho com `category` nula, `20261017000002`).
 */
export const SEM_CATEGORIA_PARA_CONFERIR: ClassificacaoDoVocabulario = {
  categoriaAtiva: false,
  subcategoriaNaCategoria: false,
  subcategoriaEmAlgumaCategoria: false,
};

/**
 * Os erros de campo da classificacao em dois niveis (decisao do cliente de 17/10:
 * "dois niveis, com subcategorias como a petlove").
 */
export function errosDaClassificacao(
  categoria: CategoriaDaVitrine | null,
  subcategoria: SubcategoriaDaVitrine | null,
  achado: ClassificacaoDoVocabulario,
): ProblemFieldError[] {
  if (categoria === null) {
    return subcategoria === null
      ? []
      : [
          {
            field: 'subcategory',
            code: 'subcategory_without_category',
            message: 'Escolha a categoria antes da subcategoria.',
          },
        ];
  }
  const erros: ProblemFieldError[] = [];
  if (!achado.categoriaAtiva) {
    erros.push({
      field: 'category',
      code: 'unknown_category',
      message: 'Essa categoria não está no vocabulário da Loja.',
    });
  }
  if (subcategoria !== null && !achado.subcategoriaNaCategoria) {
    erros.push(
      achado.subcategoriaEmAlgumaCategoria
        ? {
            field: 'subcategory',
            code: 'subcategory_not_in_category',
            message: 'Essa subcategoria é de outra categoria. Escolha uma da categoria selecionada.',
          }
        : {
            field: 'subcategory',
            code: 'unknown_subcategory',
            message: 'Essa subcategoria não está no vocabulário da Loja.',
          },
    );
  }
  return erros;
}

export function errosDoDestino(
  campo: string,
  targetUrl: string,
  hostDoParceiro: string,
): ProblemFieldError[] {
  if (targetUrl.length > TETO_DA_URL) {
    return [
      {
        field: campo,
        code: 'url_too_long',
        message: `O link passa de ${String(TETO_DA_URL)} caracteres.`,
      },
    ];
  }
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return [{ field: campo, code: 'invalid_url', message: 'Esse texto não é um endereço válido.' }];
  }
  if (url.protocol !== 'https:') {
    return [{ field: campo, code: 'url_not_https', message: 'O link precisa começar com https://.' }];
  }
  if (url.username !== '' || url.password !== '') {
    return [
      {
        field: campo,
        code: 'url_has_credentials',
        message: 'O link tem usuário e senha embutidos. Use o endereço sem eles.',
      },
    ];
  }
  if (ehIpLiteral(url.hostname)) {
    return [
      {
        field: campo,
        code: 'url_ip_literal',
        message: 'O link aponta para um número de IP. Use o endereço com nome.',
      },
    ];
  }
  if (!ehDoParceiro(url.hostname, hostDoParceiro)) {
    return [
      {
        field: campo,
        code: 'host_mismatch',
        message: `O link precisa ser do site do parceiro (${hostDoParceiro}).`,
      },
    ];
  }
  return [];
}

/** O host do destino pertence ao parceiro: e ele mesmo, ou um subdominio dele. */
export function ehDoParceiro(hostname: string, hostDoParceiro: string): boolean {
  const host = hostname.toLowerCase();
  const alvo = hostDoParceiro.toLowerCase();
  return host === alvo || host.endsWith(`.${alvo}`);
}

/** O host a GUARDAR, ou `null` quando ele e o do proprio parceiro. */
export function hostDoDestino(targetUrl: string, hostDoParceiro: string): string | null {
  const host = new URL(targetUrl).hostname.toLowerCase();
  return host === hostDoParceiro.toLowerCase() ? null : host;
}

/**
 * O caminho que o banco guarda, a partir de uma URL que `errosDoDestino` ja
 * aprovou.
 */
export function caminhoDoDestino(targetUrl: string): string {
  const url = new URL(targetUrl);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Tamanho de texto como o `CHECK` do banco o mede: depois de `btrim`. */
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

/** O `ETag` e a `version` do banco, entre aspas (`components/headers/ETag`). */
export function comoEtag(version: number): string {
  return `"${String(version)}"`;
}

export { lerIfMatch, type VersaoLida } from '../../../shared/http/if-match.js';

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
  readonly upload_id: string | null;
  readonly position: number;
  /** Nulo quando o painel gravou a imagem sem descricao (opcional desde 17/10/2026). */
  readonly alt_text: string | null;
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
  /** Nulo so no rascunho (ver `ItemAdministrativo`). */
  readonly partner: { readonly slug: string; readonly name: string; readonly host: string } | null;
  readonly title: string;
  readonly summary: string | null;
  readonly category: CategoriaDaVitrine | null;
  /** Nulo junto com `category` (rascunho incompleto, `20261017000002`). */
  readonly category_label: string | null;
  readonly subcategory: SubcategoriaDaVitrine | null;
  readonly subcategory_label: string | null;
  readonly target_url: string | null;
  /** O que ainda falta para publicar, na ordem dos campos da tela. */
  readonly missing_to_publish: readonly FaltaDaPublicacao[];
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

/** A galeria como o painel a ve (`AdminCatalogGalleryImage`). */
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

/** Projeta o item para o painel, **com o preco mesmo vencido**. */
export function projetarItemAdministrativo(
  item: ItemAdministrativo,
  agora: Instant,
  urlDeMidia: (chave: string) => string,
): ItemAdministrativoProjetado {
  return {
    slug: item.slug,
    partner:
      item.partner === null
        ? null
        : { slug: item.partner.slug, name: item.partner.name, host: item.partner.host },
    title: item.title,
    summary: item.summary,
    category: item.category,
    category_label: item.categoryLabel,
    subcategory: item.subcategory,
    subcategory_label: item.subcategoryLabel,
    target_url: item.targetUrl,
    missing_to_publish: faltaParaPublicar(item),
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

/**
 * Ate 5 tags por item, e ate 40 ativas no vocabulario: um filtro com duzentas
 * opcoes nao filtra.
 */
export const TETO_DE_TAGS_POR_ITEM = 5;
export const TETO_DE_TAGS_ATIVAS = 40;
/** Ate 8 imagens por item; `position` de 0 a 7. */
export const TETO_DE_IMAGENS_POR_ITEM = 8;

/** O teto da "Descricao" do produto (`store_items.summary`), em caracteres. */
export const TETO_DA_DESCRICAO_DO_ITEM = 3000;

/** Mesmo formato de `Slug` no contrato e de `store_tags_slug_formato` no banco. */
const FORMATO_DE_SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/**
 * O que a normalizacao trata como espaco: o espaco que alguem digita -- barra de
 * espaco, tabulacao, quebra de linha -- e os separadores de espaco Unicode.
 */
const ESPACO_DO_ROTULO = '[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000]';
const ESPACO_NAS_PONTAS = new RegExp(`^(?:${ESPACO_DO_ROTULO})+|(?:${ESPACO_DO_ROTULO})+$`, 'gu');
const ESPACO_REPETIDO = new RegExp(`(?:${ESPACO_DO_ROTULO})+`, 'gu');

/** O rotulo como vai ser gravado: pontas aparadas e espacos repetidos juntados. */
export function normalizarRotulo(rotulo: string): string {
  return rotulo.replace(ESPACO_NAS_PONTAS, '').replace(ESPACO_REPETIDO, ' ');
}

/**
 * O `slug` da tag, derivado do rotulo: NFKD, sem marca diacritica, minusculo,
 * espaco vira hifen, hifens repetidos viram um, e nenhum hifen nas pontas.
 */
export function slugDaTag(rotulo: string): string {
  return normalizarRotulo(rotulo)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[ &+]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** O teto do rotulo de tag. */
export const MAXIMO_DO_ROTULO_DE_TAG = 24;

/**
 * O piso do rotulo. **Nao e o que recusava `N&D`** (tres caracteres passavam no
 * tamanho; o que recusava era o alfabeto e, depois dele, o `slug` `n&d`).
 */
export const MINIMO_DO_ROTULO_DE_TAG = 2;

/**
 * Caractere invisivel ou de controle: controle C0/C1, formato (marca de direcao
 * bidirecional, juntor de largura zero, BOM) e separador de linha e paragrafo.
 */
const INVISIVEL_OU_DE_CONTROLE =
  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/u;

/**
 * O alfabeto do rotulo: letra (com acento e cedilha, em NFC ou em NFD, por isso
 * `\p{M}`), digito, espaco, e a pontuacao que nome de marca usa -- `&`, hifen,
 * apostrofo reto ou curvo, e `+`.
 */
const ALFABETO_DO_ROTULO = /^[\p{L}\p{M}\p{N} &'\u2019+-]+$/u;

/**
 * Confere o rotulo e devolve o que gravar, em quatro passos e nesta ordem:
 * tamanho, caractere invisivel, alfabeto, e `slug` derivado.
 */
export function conferirRotulo(
  campo: string,
  rotulo: string,
): { readonly erros: ProblemFieldError[]; readonly rotulo: string; readonly slug: string } {
  const normalizado = normalizarRotulo(rotulo);
  const slug = slugDaTag(normalizado);
  if (normalizado.length < MINIMO_DO_ROTULO_DE_TAG || normalizado.length > MAXIMO_DO_ROTULO_DE_TAG) {
    return {
      erros: [
        {
          field: campo,
          code: 'length',
          message: `Entre ${String(MINIMO_DO_ROTULO_DE_TAG)} e ${String(MAXIMO_DO_ROTULO_DE_TAG)} caracteres.`,
        },
      ],
      rotulo: normalizado,
      slug,
    };
  }
  if (INVISIVEL_OU_DE_CONTROLE.test(normalizado)) {
    return {
      erros: [
        {
          field: campo,
          code: 'tag_invisible_char',
          message: 'Este nome tem caractere invisível. Apague o campo e digite o nome de novo.',
        },
      ],
      rotulo: normalizado,
      slug,
    };
  }
  if (!ALFABETO_DO_ROTULO.test(normalizado)) {
    return {
      erros: [
        {
          field: campo,
          code: 'tag_charset',
          message: 'Só letras, números, espaço e os sinais & - ’ +.',
        },
      ],
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
          message: 'Este rótulo não forma um endereço válido. Use pelo menos três letras, números ou hífens.',
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

/**
 * O `slug` do item derivado do titulo (`AdminStoreItemInput.slug`, opcional desde
 * 23/09): a mesma normalizacao da tag, cortada para caber no formato de `Slug` (3
 * a 30) junto com o sufixo.
 */
export function slugDoItem(titulo: string): string | undefined;
export function slugDoItem(titulo: string, sufixo: string): string;
export function slugDoItem(titulo: string, sufixo?: string): string | undefined {
  const base = slugDaTag(titulo);
  const espacoDoSufixo = sufixo === undefined ? 0 : sufixo.length + 1;
  const cortado = base.slice(0, 30 - espacoDoSufixo).replace(/-+$/, '');
  if (sufixo === undefined) return FORMATO_DE_SLUG.test(cortado) ? cortado : undefined;
  return cortado === '' ? `item-${sufixo}` : `${cortado}-${sufixo}`;
}

/** Quatro caracteres base36 (cerca de 20 bits) tirados do CSPRNG. */
export function sufixoCurto(aleatorio: Uint8Array): string {
  const n = ((aleatorio[0] ?? 0) << 16) | ((aleatorio[1] ?? 0) << 8) | (aleatorio[2] ?? 0);
  return (n % 1_679_616).toString(36).padStart(4, '0');
}
