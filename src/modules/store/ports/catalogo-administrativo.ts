/**
 * A porta da escrita administrativa da `Loja` (ADR-0027 item 14).
 *
 * ## Toda escrita acontece dentro de `emTransacao`, e a trilha e o ULTIMO passo
 *
 * D49: a trilha grava na mesma transacao da mudanca, e a falha dela desfaz a
 * escrita. Por isso a trilha nao e uma dependencia separada do servico: ela e
 * um metodo da propria transacao (`registrarNaTrilha`), e nao ha como gravar
 * item fora de uma transacao que tambem tenha como gravar trilha.
 *
 * **Ultimo, e nao por estilo.** A gravacao da trilha assume o papel
 * `bichu_audit_writer` com `SET LOCAL ROLE`, e esse papel nao escreve em
 * `store_*`. Um `UPDATE` de item depois dela falharia por permissao. O servico
 * chama `registrarNaTrilha` depois da ultima escrita, e o adaptador documenta a
 * mesma coisa.
 *
 * ## A versao lida mora na clausula `WHERE`
 *
 * `atualizarParceiro` e `atualizarItem` recebem a versao que a pessoa leu e
 * devolvem `null` quando ela nao e mais a atual. Ler, comparar e depois gravar
 * deixaria dois administradores passarem pela comparacao ao mesmo tempo; com a
 * versao no `WHERE`, o banco serializa e o segundo encontra zero linhas
 * (ADR-0021 aplicado a concorrencia).
 *
 * ## O que esta porta NAO faz
 *
 * Nao le `users`, `user_roles`, `pets` nem conversa (D51). O "criado por conta
 * admin" do item 10 do ADR-0027 e garantido pelo unico caminho que cria
 * `kind = 'catalog_image'`, que passa pela guarda administrativa.
 */
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import type {
  ConfirmacaoDeCatalogo,
  EnvioDeCatalogo,
  NovaIntencaoDeCatalogo,
} from '../../media/ports/imagem-de-catalogo.js';
import type { Instant } from '../../../shared/types/brands.js';
import type {
  EstadoDePublicacao,
  ItemAdministrativo,
  ParceiroAdministrativo,
  TagAdministrativa,
} from '../domain/escrita-da-vitrine.js';
import type { CategoriaDaVitrine, EspecieDoItem, EstadoDoPreco } from '../domain/item-da-vitrine.js';

/** Lancado pelo adaptador quando o `slug` ja e de outro recurso do mesmo tipo. */
export class SlugOcupado extends Error {
  constructor(readonly recurso: 'store_partner' | 'store_item' | 'store_tag') {
    super(`slug ocupado em ${recurso}`);
    this.name = 'SlugOcupado';
  }
}

export interface RecorteDeParceiros {
  readonly q?: string | undefined;
  readonly active?: boolean | undefined;
  readonly page: number;
  readonly limit: number;
}

export type OrdemDoPainel = 'curadoria' | 'nome' | 'atualizado' | 'validade';

export interface RecorteDeItens {
  readonly q?: string | undefined;
  readonly category?: CategoriaDaVitrine | undefined;
  readonly partnerSlug?: string | undefined;
  readonly publicationState?: EstadoDePublicacao | undefined;
  readonly species?: EspecieDoItem | undefined;
  /** `slug` de uma tag do vocabulario, ativa ou nao. */
  readonly tagSlug?: string | undefined;
  readonly priceStatus?: EstadoDoPreco | undefined;
  readonly sort: OrdemDoPainel;
  /**
   * `AAAA-MM-DD`: o corte do vencimento. Vem do relogio da aplicacao, e nao de
   * `CURRENT_DATE`, para o filtro `vencido` concordar com o `price_status` que a
   * mesma resposta calcula.
   */
  readonly hoje: string;
  readonly page: number;
  readonly limit: number;
}

export interface RecorteDeTags {
  readonly q?: string | undefined;
  readonly active?: boolean | undefined;
  readonly page: number;
  readonly limit: number;
}

export interface NovaTag {
  readonly id: string;
  readonly slug: string;
  readonly label: string;
  readonly agora: Instant;
}

export interface MudancaDeTag {
  readonly slug?: string;
  readonly label?: string;
  readonly active?: boolean;
}

/** Uma posicao da galeria, como a escrita a grava. */
export interface ImagemNaPosicao {
  readonly imageId: string;
  readonly position: number;
  readonly altText: string;
}

/** A tag referenciada por um item, pelo `slug`, resolvida para a identidade interna. */
export interface TagResolvida {
  readonly id: string;
  readonly slug: string;
  readonly active: boolean;
}

export interface Pagina<T> {
  readonly itens: readonly T[];
  readonly total: number;
}

export interface NovoParceiro {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly host: string;
  readonly sortOrder: number;
  readonly agora: Instant;
}

export interface MudancaDeParceiro {
  readonly slug?: string;
  readonly name?: string;
  readonly host?: string;
  readonly sortOrder?: number;
  readonly active?: boolean;
}

export interface Preco {
  readonly amount: number;
  readonly currency: 'BRL';
  /** `AAAA-MM-DD`. */
  readonly checkedAt: string;
}

export interface NovoItem {
  readonly id: string;
  readonly slug: string;
  readonly partnerId: string;
  readonly title: string;
  readonly summary: string;
  readonly category: CategoriaDaVitrine;
  readonly targetUrl: string;
  readonly preco: Preco | null;
  readonly sortOrder: number;
  readonly agora: Instant;
}

export interface MudancaDeItem {
  readonly slug?: string;
  readonly partnerId?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly category?: CategoriaDaVitrine;
  readonly targetUrl?: string;
  /** `null` tira o preco. Ausente nao mexe. */
  readonly preco?: Preco | null;
  readonly sortOrder?: number;
  /** So `publicar` e `retirar` mexem nestes dois. */
  readonly active?: boolean;
  readonly publishedAt?: Instant;
}

/** O que se pode fazer dentro de uma transacao da escrita administrativa. */
export interface TransacaoDoCatalogo {
  parceiroPorSlug(slug: string): Promise<ParceiroAdministrativo | null>;
  /** Lanca `SlugOcupado`. */
  inserirParceiro(novo: NovoParceiro): Promise<ParceiroAdministrativo>;
  /** `null` quando `versaoLida` nao e mais a atual. Lanca `SlugOcupado`. */
  atualizarParceiro(
    id: string,
    versaoLida: number,
    mudanca: MudancaDeParceiro,
    agora: Instant,
  ): Promise<ParceiroAdministrativo | null>;
  /** Os destinos de todos os itens do parceiro, em qualquer estado. */
  destinosDosItensDoParceiro(partnerId: string): Promise<readonly string[]>;

  itemPorSlug(slug: string): Promise<ItemAdministrativo | null>;
  /** Lanca `SlugOcupado`. */
  inserirItem(novo: NovoItem): Promise<ItemAdministrativo>;
  /** `null` quando `versaoLida` nao e mais a atual. Lanca `SlugOcupado`. */
  atualizarItem(
    id: string,
    versaoLida: number,
    mudanca: MudancaDeItem,
    agora: Instant,
  ): Promise<ItemAdministrativo | null>;

  registrarIntencaoDeCatalogo(nova: NovaIntencaoDeCatalogo): Promise<void>;

  /** O item de novo, pelo `id` interno, depois das escritas da transacao. */
  recarregarItem(id: string): Promise<ItemAdministrativo>;
  /** Substitui o conjunto inteiro de especies do item. */
  substituirEspecies(itemId: string, especies: readonly EspecieDoItem[]): Promise<void>;
  /** As tags do vocabulario com estes `slug`s, ativas ou nao. As que nao existem ficam de fora. */
  tagsPorSlugs(slugs: readonly string[]): Promise<readonly TagResolvida[]>;
  /** Substitui o conjunto inteiro de tags do item. */
  substituirTags(itemId: string, tagIds: readonly string[]): Promise<void>;
  /**
   * Substitui a galeria inteira do item (`[]` tira todas). A unicidade de
   * posicao e diferida, entao a nova ordem so e conferida no COMMIT.
   */
  substituirImagens(itemId: string, imagens: readonly ImagemNaPosicao[]): Promise<void>;
  /** O envio de imagem, com trava de linha. */
  envioDeCatalogo(uploadId: string): Promise<EnvioDeCatalogo | null>;
  /** A que item uma imagem ja confirmada esta ligada. `null` se a nenhum. */
  itemDaImagem(imageId: string): Promise<string | null>;
  /** Imagem em `processing`, envio confirmado e trabalho enfileirado, juntos. */
  confirmarEnvioDeCatalogo(entrada: ConfirmacaoDeCatalogo): Promise<void>;

  /** A tag, com trava de linha. */
  tagPorSlug(slug: string): Promise<TagAdministrativa | null>;
  /**
   * Quantas tags estao ativas agora, sob uma trava da transacao: duas criacoes
   * simultaneas nao passam as duas pelo teto de 40.
   */
  contarTagsAtivasComTrava(): Promise<number>;
  /** Lanca `SlugOcupado`. */
  inserirTag(nova: NovaTag): Promise<TagAdministrativa>;
  /** `null` quando `versaoLida` nao e mais a atual. Lanca `SlugOcupado`. */
  atualizarTag(
    id: string,
    versaoLida: number,
    mudanca: MudancaDeTag,
    agora: Instant,
  ): Promise<TagAdministrativa | null>;

  /** O ULTIMO passo de toda escrita. Ver o cabecalho. */
  registrarNaTrilha(evento: AuditEvent): Promise<void>;
}

export interface CatalogoAdministrativoRepository {
  emTransacao<T>(trabalho: (tx: TransacaoDoCatalogo) => Promise<T>): Promise<T>;

  listarParceiros(recorte: RecorteDeParceiros): Promise<Pagina<ParceiroAdministrativo>>;
  parceiroPorSlug(slug: string): Promise<ParceiroAdministrativo | null>;
  listarItens(recorte: RecorteDeItens): Promise<Pagina<ItemAdministrativo>>;
  itemPorSlug(slug: string): Promise<ItemAdministrativo | null>;
  listarTags(recorte: RecorteDeTags): Promise<Pagina<TagAdministrativa>>;
}
