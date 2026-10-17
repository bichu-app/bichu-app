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
  /**
   * O envio (`upload_intents.id`) de que ela nasceu: e o que o painel devolve
   * em `images`. Nulo depois que a conta que enviou foi apagada: a imagem
   * continua no item, sem envio a que apontar.
   */
  readonly uploadId: string | null;
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
 * ## O host e o do parceiro OU UM SUBDOMINIO DELE, e a diferenca custou caro
 *
 * Ate 17/10/2026 esta funcao exigia o host **exato**, e isso derrubava
 * `www.cobasi.com.br` para o parceiro `cobasi.com.br` -- ou seja, derrubava a
 * forma como a maioria das lojas publica os proprios links. O cliente ficou
 * bloqueado cadastrando um produto legitimo por causa disto.
 *
 * O vinculo com o parceiro **continua sendo a protecao**, e nao foi relaxado
 * para "qualquer host": o que mudou e que `loja.`, `www.` e `produtos.` do
 * MESMO dominio passam a casar.
 *
 * **A comparacao e por sufixo COM FRONTEIRA DE ROTULO, e nunca `endsWith`
 * cru**, porque `endsWith` cru e a armadilha inteira deste problema:
 * `malcobasi.com.br` termina em `cobasi.com.br` e **nao pode passar**. A regra
 * esta em [ehDoParceiro]: ou o host e igual ao do parceiro, ou ele termina em
 * `'.' + hostDoParceiro`. O ponto obrigatorio e o que separa um subdominio de
 * um dominio que so compartilha as ultimas letras, e e por isso que a
 * concatenacao do ponto acontece ali e nao na chamada.
 *
 * ## Query e fragmento PASSAM, e a proibicao anterior era o instrumento errado
 *
 * `?idsku=1197673` e o numero do produto no catalogo do parceiro, nao rastreio
 * de pessoa. A consequencia 3 da BICHUS-185 continua valendo e continua tendo
 * dono: ela e sobre o que o APLICATIVO acrescenta na saida, garantido na tela
 * (`loja_abre_no_navegador_test.dart` reprova parametro acrescentado). O que o
 * parceiro ja publicou na propria URL nunca foi o risco.
 *
 * ## CADA RECUSA DIZ O MOTIVO REAL, e isso nao e cosmetico
 *
 * Todas as recusas devolviam `invalid_url`, e o painel traduzia `invalid_url`
 * para "O link precisa comecar com https://". O cliente leu essa frase sobre um
 * link que comecava com `https://`, e passou a achar que o link dele estava
 * errado. **Mensagem generica nao e so feia: ela manda a pessoa consertar a
 * coisa errada.** Agora cada motivo tem `code` proprio, e o painel tem como
 * dizer a verdade.
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

/**
 * O host do destino pertence ao parceiro: e ele mesmo, ou um subdominio dele.
 *
 * **O ponto na concatenacao e a regra inteira.** `'malcobasi.com.br'` termina
 * em `'cobasi.com.br'`, e so nao termina em `'.cobasi.com.br'`. Sem o ponto
 * esta funcao aprovaria qualquer dominio que alguem registrasse terminando com
 * o nome do parceiro, que e o jeito mais barato de fazer um link nosso levar
 * para fora -- e o jeito que ninguem percebe lendo o codigo com pressa.
 *
 * Exportada porque `escrita-da-vitrine.test.ts` a exercita direto: a fronteira
 * de rotulo merece casos proprios, e nao so o reflexo deles em `errosDoDestino`.
 */
export function ehDoParceiro(hostname: string, hostDoParceiro: string): boolean {
  const host = hostname.toLowerCase();
  const alvo = hostDoParceiro.toLowerCase();
  return host === alvo || host.endsWith(`.${alvo}`);
}

/**
 * O host a GUARDAR, ou `null` quando ele e o do proprio parceiro.
 *
 * Nulo no caso comum e deliberado (ver a migracao
 * `20261017000001_link-do-produto-com-query-e-subdominio`): e o que faz trocar
 * o dominio de um parceiro continuar sendo o `UPDATE` de uma coluna so. So o
 * item que mora num subdominio carrega o proprio host.
 *
 * Pressupoe uma URL que `errosDoDestino` ja aprovou.
 */
export function hostDoDestino(targetUrl: string, hostDoParceiro: string): string | null {
  const host = new URL(targetUrl).hostname.toLowerCase();
  return host === hostDoParceiro.toLowerCase() ? null : host;
}

/**
 * O caminho que o banco guarda, a partir de uma URL que `errosDoDestino` ja
 * aprovou. O host sai porque ele vai para `target_host` (ou e o do proprio
 * parceiro), e o esquema porque e sempre `https` na composicao
 * (`enderecoNoParceiro`).
 *
 * **`search` e `hash` ENTRAM**, e ate 17/10/2026 nao entravam: `pathname`
 * sozinho transformava `/racao-granplus-.../p?idsku=1197673` em
 * `/racao-granplus-.../p`, que no site da Cobasi e outra pagina. O defeito
 * seria SILENCIOSO -- o item gravaria, a vitrine mostraria, e a pessoa cairia
 * na pagina errada --, e e por isso que a recusa de `?` na escrita escondia
 * este aqui: enquanto a URL com query era rejeitada na porta, ninguem
 * descobria que o truncamento existia logo atras dela.
 */
export function caminhoDoDestino(targetUrl: string): string {
  const url = new URL(targetUrl);
  return `${url.pathname}${url.search}${url.hash}`;
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

// `lerIfMatch` e `VersaoLida` moram em `shared/http/if-match.ts`, num ponto so
// para a Loja e a Rede: a borda sufixa o ETag (`"3-gzip"`) e as duas leem igual.
export { lerIfMatch, type VersaoLida } from '../../../shared/http/if-match.js';

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
  readonly upload_id: string | null;
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

/**
 * O `slug` do item derivado do titulo (`AdminStoreItemInput.slug`, opcional
 * desde 23/09): a mesma normalizacao da tag, cortada para caber no formato de
 * `Slug` (3 a 30) junto com o sufixo. Sem sufixo, devolve `undefined` quando o
 * titulo nao da um endereco valido (`Pé`): quem chama passa a usar sufixo.
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
