/**
 * Os casos de uso da escrita administrativa da `Loja` (BICHUS-266 e
 * BICHUS-267; ADR-0027 itens 8, 10 e 14).
 *
 * ## Tres regras atravessam o arquivo
 *
 * - **Toda escrita grava a trilha, na mesma transacao, como ultimo passo**
 *   (D49). Nao existe metodo aqui que mude estado sem `registrarNaTrilha`, e a
 *   falha dela desfaz a escrita porque as duas estao dentro de `emTransacao`.
 * - **A versao que a pessoa leu decide** (`If-Match`). Ausente: 428, antes de
 *   qualquer leitura. Diferente: 412, e nada foi gravado.
 * - **Papel nao e daqui.** A guarda do prefixo decidiu antes de o recurso ser
 *   lido (ADR-0027 item 7). O que chega aqui ja e um administrador, e o `Autor`
 *   existe para a trilha, nao para autorizar.
 *
 * ## O que a trilha grava
 *
 * `resource_id` e o `id` INTERNO, nunca o `slug` (ADR-0027 item 8): o `slug`
 * muda, e a trilha precisa achar o mesmo objeto depois da troca. `before` e
 * `after` levam so os campos que mudaram; catalogo nao e dado pessoal, entao o
 * valor vai inteiro.
 */
import { AppError, problemas } from '../../../shared/http/errors.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { AuditAction, AuditEvent } from '../../audit/ports/audit-log.js';
import type {
  PreparadorDeEnvioDeCatalogo,
  PropositoDaImagem,
} from '../../media/ports/imagem-de-catalogo.js';
import type { AutorizacaoDeEnvio } from '../../media/ports/object-storage.js';
import {
  comoEtag,
  dataDeConsultaNoFuturo,
  errosDeTexto,
  errosDoDestino,
  estadoDePublicacao,
  hojeUtc,
  lerIfMatch,
  projetarItemAdministrativo,
  projetarParceiro,
  projetarTag,
  conferirRotulo,
  slugDoItem,
  sufixoCurto,
  TETO_DE_IMAGENS_POR_ITEM,
  TETO_DE_TAGS_ATIVAS,
  TETO_DE_TAGS_POR_ITEM,
  type EstadoDePublicacao,
  type TagAdministrativa,
  type TagProjetada,
  type ItemAdministrativo,
  type ItemAdministrativoProjetado,
  type ParceiroAdministrativo,
  type ParceiroProjetado,
} from '../domain/escrita-da-vitrine.js';
import {
  ESPECIES_DO_ITEM,
  type CategoriaDaVitrine,
  type EspecieDoItem,
  type EstadoDoPreco,
} from '../domain/item-da-vitrine.js';
import {
  SlugOcupado,
  type CatalogoAdministrativoRepository,
  type MudancaDeItem,
  type MudancaDeParceiro,
  type OrdemDoPainel,
  type ImagemNaPosicao,
  type MudancaDeTag,
  type Preco,
  type TransacaoDoCatalogo,
} from '../ports/catalogo-administrativo.js';

/** Quem escreve, para a trilha. Nunca o e-mail (BICHUS-56 criterio 3). */
export interface Autor {
  readonly userId: UserId;
  /** Os 8 primeiros bytes, em hex, do hash da sessao (ADR-0027 item 8). */
  readonly sessao: string;
  readonly ip?: string | undefined;
  readonly correlationId?: string | undefined;
}

export interface PrecoDoCorpo {
  readonly amount: number;
  readonly currency: 'BRL';
  readonly checked_at: string;
}

export interface CorpoDeParceiro {
  readonly slug: string;
  readonly name: string;
  readonly host: string;
  readonly sort_order?: number;
}

export interface PatchDeParceiro {
  readonly slug?: string;
  readonly name?: string;
  readonly host?: string;
  readonly sort_order?: number;
  readonly active?: boolean;
}

export interface CorpoDeItem {
  /** Opcional: sem ele, o servidor deriva do titulo (`slugDoItem`). */
  readonly slug?: string;
  readonly partner_slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: CategoriaDaVitrine;
  readonly target_url: string;
  readonly price?: PrecoDoCorpo;
  readonly species: readonly EspecieDoItem[];
  readonly tag_slugs?: readonly string[];
  readonly images?: readonly ImagemDoCorpo[];
  readonly sort_order?: number;
}

/** `CatalogImageInput`: um envio e o texto alternativo dele. */
export interface ImagemDoCorpo {
  readonly upload_id: string;
  readonly alt_text: string;
}

export interface CorpoDeTag {
  readonly label: string;
}

export interface PatchDeTag {
  readonly label?: string;
  readonly active?: boolean;
}

export interface PatchDeItem {
  readonly slug?: string;
  readonly partner_slug?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly category?: CategoriaDaVitrine;
  readonly target_url?: string;
  readonly price?: PrecoDoCorpo | null;
  readonly species?: readonly EspecieDoItem[];
  readonly tag_slugs?: readonly string[];
  readonly images?: readonly ImagemDoCorpo[];
  readonly sort_order?: number;
}

export interface CorpoDeIntencao {
  readonly purpose: PropositoDaImagem;
  readonly content_type: string;
  readonly byte_size: number;
}

export interface Escrito<T> {
  readonly recurso: T;
  readonly etag: string;
}

export interface IntencaoAutorizada {
  readonly uploadId: string;
  readonly autorizacao: AutorizacaoDeEnvio;
}

export interface PaginaProjetada<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface DependenciasDoCatalogo {
  readonly repositorio: CatalogoAdministrativoRepository;
  readonly envios: PreparadorDeEnvioDeCatalogo;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** A URL publica da derivada, montada na leitura. O banco guarda so a chave. */
  readonly urlDeMidia: (chave: string) => string;
}

function slugOcupado(): AppError {
  return new AppError('slug-taken', 'Este endereço já está em uso');
}

function versaoMudou(): AppError {
  return new AppError('precondition-failed', 'Alguém alterou isto antes de você', {
    detail: 'Recarregue para ver a versão atual antes de salvar.',
  });
}

function faltaVersao(): AppError {
  return new AppError('precondition-required', 'Falta a versão que você leu');
}

/**
 * 428 antes de qualquer leitura, e 412 para o que nao e uma versao. A leitura
 * do recurso vem depois: escrita sem `If-Match` nao chega a perguntar se o
 * recurso existe.
 */
function versaoExigida(ifMatch: string | string[] | undefined): number {
  const lida = lerIfMatch(ifMatch);
  if (lida.tipo === 'ausente') throw faltaVersao();
  if (lida.tipo === 'invalida') throw versaoMudou();
  return lida.versao;
}

function precoDoCorpo(preco: PrecoDoCorpo): Preco {
  return { amount: preco.amount, currency: preco.currency, checkedAt: preco.checked_at };
}

function errosDoPreco(preco: PrecoDoCorpo | null | undefined, agora: Instant): ProblemFieldError[] {
  if (preco === null || preco === undefined) return [];
  if (dataDeConsultaNoFuturo(preco.checked_at, agora)) {
    return [
      {
        field: 'price.checked_at',
        code: 'future_date',
        message: 'A data é a do dia em que alguém leu o preço, e não pode ser futura.',
      },
    ];
  }
  return [];
}

/** Os campos do parceiro como a trilha os grava. */
function retratoDoParceiro(p: ParceiroAdministrativo): Record<string, unknown> {
  return { slug: p.slug, name: p.name, host: p.host, active: p.active, sort_order: p.sortOrder };
}

/**
 * Os campos do item como a trilha os grava. A galeria vai como a lista que o
 * painel mandou (`upload_id` e texto alternativo, na ordem): e isso que
 * responde "que imagens estavam aqui antes" numa investigacao.
 */
function retratoDoItem(i: ItemAdministrativo): Record<string, unknown> {
  return {
    slug: i.slug,
    partner_slug: i.partner.slug,
    title: i.title,
    summary: i.summary,
    category: i.category,
    target_url: i.targetUrl,
    price:
      i.priceAmount === null
        ? null
        : { amount: i.priceAmount, currency: i.priceCurrency, checked_at: i.priceCheckedAt },
    sort_order: i.sortOrder,
    species: [...i.species],
    tag_slugs: i.tags.map((t) => t.slug),
    images: i.imagens.map((m) => ({ upload_id: m.uploadId, alt_text: m.altText })),
  };
}

function retratoDaTag(t: TagAdministrativa): Record<string, unknown> {
  return { slug: t.slug, label: t.label, active: t.active };
}

function tagDesconhecida(): AppError {
  return problemas.validacao([
    { field: 'tag_slugs', code: 'unknown_tag', message: 'Tag que não está no vocabulário.' },
  ]);
}

/**
 * O que o corpo diz de especie, tags e imagens, conferido antes de abrir a
 * transacao. O que depende do banco (tag existe, envio serve) e conferido la
 * dentro, por `aplicarEspecieTagsEImagens`.
 */
function errosDaGaleriaEDaEspecie(corpo: {
  readonly species?: readonly string[] | undefined;
  readonly tag_slugs?: readonly string[] | undefined;
  readonly images?: readonly ImagemDoCorpo[] | undefined;
}): ProblemFieldError[] {
  const erros: ProblemFieldError[] = [];
  if (corpo.species !== undefined) {
    const unicas = new Set(corpo.species);
    const conhecidas = corpo.species.every((e) => (ESPECIES_DO_ITEM as readonly string[]).includes(e));
    if (unicas.size === 0 || unicas.size !== corpo.species.length || !conhecidas) {
      erros.push({ field: 'species', code: 'species_invalid', message: 'De uma a três espécies, sem repetir.' });
    }
  }
  if (corpo.tag_slugs !== undefined) {
    if (corpo.tag_slugs.length > TETO_DE_TAGS_POR_ITEM || new Set(corpo.tag_slugs).size !== corpo.tag_slugs.length) {
      erros.push({
        field: 'tag_slugs',
        code: 'too_many_tags',
        message: `Até ${String(TETO_DE_TAGS_POR_ITEM)} tags, sem repetir.`,
      });
    }
  }
  if (corpo.images !== undefined) {
    if (corpo.images.length > TETO_DE_IMAGENS_POR_ITEM) {
      erros.push({
        field: 'images',
        code: 'too_many_images',
        message: `Até ${String(TETO_DE_IMAGENS_POR_ITEM)} imagens.`,
      });
    }
    if (new Set(corpo.images.map((i) => i.upload_id.toLowerCase())).size !== corpo.images.length) {
      erros.push({ field: 'images', code: 'duplicate_upload', message: 'A mesma imagem apareceu duas vezes.' });
    }
    corpo.images.forEach((imagem, n) => {
      erros.push(...errosDeTexto(`images[${String(n)}].alt_text`, imagem.alt_text, 2, 150));
    });
  }
  return erros;
}

/** So os campos que mudaram, nos dois lados. */
function diferenca(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const chave of Object.keys(depois)) {
    if (JSON.stringify(antes[chave]) !== JSON.stringify(depois[chave])) {
      before[chave] = antes[chave] ?? null;
      after[chave] = depois[chave];
    }
  }
  return { before, after };
}

export class CatalogoAdministrativo {
  constructor(private readonly deps: DependenciasDoCatalogo) {}

  private agora(): Instant {
    return this.deps.clock.now();
  }

  private evento(
    autor: Autor,
    action: AuditAction,
    resourceKind: string,
    resourceId: string,
    corpo: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  ): AuditEvent {
    return {
      actorKind: 'user',
      actorUserId: autor.userId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action,
      resourceKind,
      resourceId,
      before: corpo.before,
      after: corpo.after,
      metadata: { surface: 'admin', session: autor.sessao },
    };
  }

  private projetarItem(item: ItemAdministrativo): ItemAdministrativoProjetado {
    return projetarItemAdministrativo(item, this.agora(), this.deps.urlDeMidia);
  }

  private escritoDoItem(item: ItemAdministrativo): Escrito<ItemAdministrativoProjetado> {
    return { recurso: this.projetarItem(item), etag: comoEtag(item.version) };
  }

  private escritoDoParceiro(p: ParceiroAdministrativo): Escrito<ParceiroProjetado> {
    return { recurso: projetarParceiro(p), etag: comoEtag(p.version) };
  }

  // -------------------------------------------------------------------------
  // Parceiros (BICHUS-266)
  // -------------------------------------------------------------------------

  async listarParceiros(recorte: {
    q?: string | undefined;
    active?: boolean | undefined;
    page: number;
    limit: number;
  }): Promise<PaginaProjetada<ParceiroProjetado>> {
    const pagina = await this.deps.repositorio.listarParceiros(recorte);
    return {
      items: pagina.itens.map(projetarParceiro),
      page: recorte.page,
      limit: recorte.limit,
      total: pagina.total,
    };
  }

  async lerParceiro(slug: string): Promise<Escrito<ParceiroProjetado>> {
    const parceiro = await this.deps.repositorio.parceiroPorSlug(slug);
    if (parceiro === null) throw problemas.naoEncontrado();
    return this.escritoDoParceiro(parceiro);
  }

  async criarParceiro(autor: Autor, corpo: CorpoDeParceiro): Promise<Escrito<ParceiroProjetado>> {
    const erros = errosDeTexto('name', corpo.name, 2, 80);
    if (erros.length > 0) throw problemas.validacao(erros);

    return this.deps.repositorio.emTransacao(async (tx) => {
      const criado = await comSlugLivre(() =>
        tx.inserirParceiro({
          id: this.deps.ids.uuidv7(),
          slug: corpo.slug,
          name: corpo.name.trim(),
          host: corpo.host,
          sortOrder: corpo.sort_order ?? 0,
          agora: this.agora(),
        }),
      );
      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.store_partner.created', 'store_partner', criado.id, {
          after: retratoDoParceiro(criado),
        }),
      );
      return this.escritoDoParceiro(criado);
    });
  }

  async alterarParceiro(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
    patch: PatchDeParceiro,
  ): Promise<Escrito<ParceiroProjetado>> {
    const versao = versaoExigida(ifMatch);
    const erros = patch.name === undefined ? [] : errosDeTexto('name', patch.name, 2, 80);
    if (erros.length > 0) throw problemas.validacao(erros);

    return this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.parceiroPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();

      // Trocar o host nao deixa item orfao: o item guarda so o caminho, e o
      // endereco e composto na leitura com o host do parceiro (migracao
      // `20260922000023`). Os itens vao junto, e e para isso que o host mora
      // numa coluna so.

      const mudanca: MudancaDeParceiro = {
        ...(patch.slug === undefined ? {} : { slug: patch.slug }),
        ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        ...(patch.host === undefined ? {} : { host: patch.host }),
        ...(patch.sort_order === undefined ? {} : { sortOrder: patch.sort_order }),
        ...(patch.active === undefined ? {} : { active: patch.active }),
      };
      const alterado = await comSlugLivre(() =>
        tx.atualizarParceiro(atual.id, versao, mudanca, this.agora()),
      );
      if (alterado === null) throw versaoMudou();

      await tx.registrarNaTrilha(
        this.evento(
          autor,
          'admin.store_partner.updated',
          'store_partner',
          atual.id,
          diferenca(retratoDoParceiro(atual), retratoDoParceiro(alterado)),
        ),
      );
      return this.escritoDoParceiro(alterado);
    });
  }

  // -------------------------------------------------------------------------
  // Itens (BICHUS-267)
  // -------------------------------------------------------------------------

  async listarItens(recorte: {
    q?: string | undefined;
    category?: CategoriaDaVitrine | undefined;
    partnerSlug?: string | undefined;
    publicationState?: EstadoDePublicacao | undefined;
    priceStatus?: EstadoDoPreco | undefined;
    sort: OrdemDoPainel;
    page: number;
    limit: number;
  }): Promise<PaginaProjetada<ItemAdministrativoProjetado> & { effective_sort: OrdemDoPainel }> {
    const pagina = await this.deps.repositorio.listarItens({ ...recorte, hoje: hojeUtc(this.agora()) });
    return {
      items: pagina.itens.map((item) => this.projetarItem(item)),
      page: recorte.page,
      limit: recorte.limit,
      total: pagina.total,
      effective_sort: recorte.sort,
    };
  }

  async lerItem(slug: string): Promise<Escrito<ItemAdministrativoProjetado>> {
    const item = await this.deps.repositorio.itemPorSlug(slug);
    if (item === null) throw problemas.naoEncontrado();
    return this.escritoDoItem(item);
  }

  /**
   * O item nasce em RASCUNHO (`active = false`, `published_at` nulo) e nao
   * aparece no app ate `publicarItem` (ADR-0027 item 14).
   */
  async criarItem(autor: Autor, corpo: CorpoDeItem): Promise<Escrito<ItemAdministrativoProjetado>> {
    const agora = this.agora();
    const erros = [
      ...errosDeTexto('title', corpo.title, 2, 120),
      ...errosDeTexto('summary', corpo.summary, 2, 180),
      ...errosDoPreco(corpo.price, agora),
      ...errosDaGaleriaEDaEspecie(corpo),
    ];
    if (erros.length > 0) throw problemas.validacao(erros);

    return this.deps.repositorio.emTransacao(async (tx) => {
      const parceiro = await tx.parceiroPorSlug(corpo.partner_slug);
      if (parceiro === null) {
        throw problemas.validacao([
          { field: 'partner_slug', code: 'unknown_partner', message: 'Parceiro não encontrado.' },
        ]);
      }
      const destino = errosDoDestino('target_url', corpo.target_url, parceiro.host);
      if (destino.length > 0) throw problemas.validacao(destino);

      const inserir = (slug: string) =>
        tx.inserirItem({
          id: this.deps.ids.uuidv7(),
          slug,
          partnerId: parceiro.id,
          title: corpo.title.trim(),
          summary: corpo.summary.trim(),
          category: corpo.category,
          targetUrl: corpo.target_url,
          preco: corpo.price === undefined ? null : precoDoCorpo(corpo.price),
          sortOrder: corpo.sort_order ?? 0,
          agora,
        });
      const criado =
        corpo.slug === undefined
          ? await this.inserirComSlugDerivado(tx, corpo.title, inserir)
          : await comSlugLivre(() => inserir(corpo.slug as string));

      await this.aplicarEspecieTagsEImagens(tx, criado.id, corpo, agora);
      const completo = await tx.recarregarItem(criado.id);

      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.store_item.created', 'store_item', criado.id, {
          after: { ...retratoDoItem(completo), publication_state: 'draft' },
        }),
      );
      return this.escritoDoItem(completo);
    });
  }

  /** Editar nao publica nem retira: o estado so muda por `publicarItem` e `retirarItem`. */
  async alterarItem(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
    patch: PatchDeItem,
  ): Promise<Escrito<ItemAdministrativoProjetado>> {
    const versao = versaoExigida(ifMatch);
    const agora = this.agora();
    const erros = [
      ...(patch.title === undefined ? [] : errosDeTexto('title', patch.title, 2, 120)),
      ...(patch.summary === undefined ? [] : errosDeTexto('summary', patch.summary, 2, 180)),
      ...errosDoPreco(patch.price, agora),
      ...errosDaGaleriaEDaEspecie(patch),
    ];
    if (erros.length > 0) throw problemas.validacao(erros);

    return this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.itemPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();

      let partnerId: string | undefined;
      let hostDoParceiro = atual.partner.host;
      if (patch.partner_slug !== undefined && patch.partner_slug !== atual.partner.slug) {
        const parceiro = await tx.parceiroPorSlug(patch.partner_slug);
        if (parceiro === null) {
          throw problemas.validacao([
            { field: 'partner_slug', code: 'unknown_partner', message: 'Parceiro não encontrado.' },
          ]);
        }
        partnerId = parceiro.id;
        hostDoParceiro = parceiro.host;
      }

      // O destino e reconferido quando muda ELE ou o parceiro: trocar o
      // parceiro de um item sem trocar o link deixaria o link apontando para o
      // site de outro parceiro.
      if (patch.target_url !== undefined || partnerId !== undefined) {
        const campo = patch.target_url === undefined ? 'partner_slug' : 'target_url';
        const destino = errosDoDestino(campo, patch.target_url ?? atual.targetUrl, hostDoParceiro);
        if (destino.length > 0) throw problemas.validacao(destino);
      }

      const mudanca: MudancaDeItem = {
        ...(patch.slug === undefined ? {} : { slug: patch.slug }),
        ...(partnerId === undefined ? {} : { partnerId }),
        ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
        ...(patch.summary === undefined ? {} : { summary: patch.summary.trim() }),
        ...(patch.category === undefined ? {} : { category: patch.category }),
        ...(patch.target_url === undefined ? {} : { targetUrl: patch.target_url }),
        ...(patch.price === undefined
          ? {}
          : { preco: patch.price === null ? null : precoDoCorpo(patch.price) }),
        ...(patch.sort_order === undefined ? {} : { sortOrder: patch.sort_order }),
      };

      // O UPDATE vem primeiro, mesmo quando so a galeria muda: e ele que
      // confere a versao lida e a incrementa, e sem ele duas edicoes da galeria
      // com o mesmo If-Match passariam as duas.
      const alterado = await comSlugLivre(() => tx.atualizarItem(atual.id, versao, mudanca, agora));
      if (alterado === null) throw versaoMudou();
      await this.aplicarEspecieTagsEImagens(
        tx,
        atual.id,
        patch,
        agora,
        atual.tags.map((t) => t.slug),
      );
      const completo = await tx.recarregarItem(atual.id);

      await tx.registrarNaTrilha(
        this.evento(
          autor,
          'admin.store_item.updated',
          'store_item',
          atual.id,
          diferenca(retratoDoItem(atual), retratoDoItem(completo)),
        ),
      );
      return this.escritoDoItem(completo);
    });
  }

  /**
   * Rascunho ou retirado passa a publicado. **Idempotente**: item ja publicado
   * responde 200 sem nova linha de trilha e sem mudar a versao, como o contrato
   * declara. `published_at` grava a primeira publicacao e nao e reescrito.
   */
  async publicarItem(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
  ): Promise<Escrito<ItemAdministrativoProjetado>> {
    const versao = versaoExigida(ifMatch);
    return this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.itemPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();
      const antes = estadoDePublicacao(atual);
      if (antes === 'published') return this.escritoDoItem(atual);
      // Pelo menos uma especie e regra da criacao E da publicacao (A.2.1): o
      // item da massa nasceu sem especie, e ele nao volta ao app sem uma.
      if (atual.species.length === 0) {
        throw problemas.validacao([
          {
            field: 'species',
            code: 'species_required',
            message: 'Diga a que espécie o produto serve antes de publicar.',
          },
        ]);
      }

      const agora = this.agora();
      const alterado = await tx.atualizarItem(
        atual.id,
        versao,
        { active: true, ...(atual.publishedAt === null ? { publishedAt: agora } : {}) },
        agora,
      );
      if (alterado === null) throw versaoMudou();

      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.store_item.published', 'store_item', atual.id, {
          before: { publication_state: antes },
          after: {
            publication_state: 'published',
            published_at: alterado.publishedAt === null ? null : alterado.publishedAt.toISOString(),
          },
        }),
      );
      return this.escritoDoItem(alterado);
    });
  }

  /**
   * O "excluir publicado" da `Loja` (D40). Nada e apagado: o item passa a
   * `retired` e volta com `publicarItem`.
   *
   * A reautenticacao (`store_item_retirement`) NAO e conferida aqui: ela e da
   * declaracao da rota, e o registro a instala antes de qualquer gancho da
   * rota, como faz com `reauthScope` do app. O caso de uso so e alcancado com a
   * janela ja consumida.
   *
   * Rascunho responde 400 `not_published` (contrato). Ja retirado responde 200
   * sem nova linha de trilha, pela mesma regra de idempotencia da publicacao.
   */
  async retirarItem(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
  ): Promise<Escrito<ItemAdministrativoProjetado>> {
    const versao = versaoExigida(ifMatch);
    return this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.itemPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();
      const antes = estadoDePublicacao(atual);
      if (antes === 'draft') {
        throw problemas.validacao([
          {
            field: 'publication_state',
            code: 'not_published',
            message: 'Item em rascunho não tem o que retirar.',
          },
        ]);
      }
      if (antes === 'retired') return this.escritoDoItem(atual);

      const alterado = await tx.atualizarItem(atual.id, versao, { active: false }, this.agora());
      if (alterado === null) throw versaoMudou();

      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.store_item.retired', 'store_item', atual.id, {
          before: { publication_state: 'published' },
          after: { publication_state: 'retired' },
        }),
      );
      return this.escritoDoItem(alterado);
    });
  }

  /**
   * Especie, tags e galeria, cada uma so quando o corpo a traz, e cada uma
   * SUBSTITUINDO a anterior inteira (o contrato: "a lista substitui a anterior
   * inteira"). Uma escrita, uma transacao, uma linha de trilha.
   */
  private async aplicarEspecieTagsEImagens(
    tx: TransacaoDoCatalogo,
    itemId: string,
    corpo: {
      readonly species?: readonly EspecieDoItem[] | undefined;
      readonly tag_slugs?: readonly string[] | undefined;
      readonly images?: readonly ImagemDoCorpo[] | undefined;
    },
    agora: Instant,
    tagsJaLigadas: readonly string[] = [],
  ): Promise<void> {
    if (corpo.species !== undefined) await tx.substituirEspecies(itemId, corpo.species);

    if (corpo.tag_slugs !== undefined) {
      const achadas = await tx.tagsPorSlugs(corpo.tag_slugs);
      if (achadas.length !== corpo.tag_slugs.length) throw tagDesconhecida();
      // O teto de 5 conta ativas E desativadas (a lista inteira ja foi contada
      // antes da transacao). O que se recusa aqui e LIGAR DE NOVO uma
      // desativada; manter a que ja estava ligada preserva o vinculo (ADR-0027
      // item 16, emenda de 23/09).
      if (achadas.some((t) => !t.active && !tagsJaLigadas.includes(t.slug))) {
        throw problemas.validacao([
          {
            field: 'tag_slugs',
            code: 'inactive_tag',
            message: 'Esta tag está desativada no vocabulário e não pode ser ligada de novo.',
          },
        ]);
      }
      await tx.substituirTags(
        itemId,
        achadas.map((t) => t.id),
      );
    }

    if (corpo.images !== undefined) {
      const galeria: ImagemNaPosicao[] = [];
      for (const [position, imagem] of corpo.images.entries()) {
        const imageId = await this.imagemDoEnvio(tx, itemId, imagem.upload_id, agora);
        galeria.push({ imageId, position, altText: imagem.alt_text.trim() });
      }
      await tx.substituirImagens(itemId, galeria);
    }
  }

  /**
   * O `slug` derivado do titulo, com sufixo curto se ja existir (contrato:
   * `AdminStoreItemInput.slug`). A procura e feita dentro da transacao, e a
   * corrida que sobra (dois itens com o mesmo titulo ao mesmo tempo) e pega
   * pelo indice unico, que devolve `SlugOcupado`: ai a proxima tentativa leva
   * sufixo. Cinco tentativas com 20 bits de sufixo cada; se todas colidirem, o
   * 409 do contrato sai, e nao um 500.
   */
  private async inserirComSlugDerivado(
    tx: TransacaoDoCatalogo,
    titulo: string,
    inserir: (slug: string) => Promise<ItemAdministrativo>,
  ): Promise<ItemAdministrativo> {
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      const semSufixo = tentativa === 0 ? slugDoItem(titulo) : undefined;
      const candidato =
        semSufixo !== undefined && (await tx.itemPorSlug(semSufixo)) === null
          ? semSufixo
          : slugDoItem(titulo, sufixoCurto(this.deps.ids.random128()));
      try {
        return await inserir(candidato);
      } catch (erro) {
        if (!(erro instanceof SlugOcupado)) throw erro;
      }
    }
    throw slugOcupado();
  }

  /**
   * A confirmacao do envio e a propria escrita do item (ADR-0027 item 10).
   *
   * **So aceita** envio de `kind = 'catalog_image'` com `purpose = 'store_item'`.
   * Foto de pet, de achador, capa de encontro, envio vencido, ou imagem que ja
   * e de OUTRO item: todos recusados com `400` (T9), e com a MESMA resposta,
   * para nao contar a quem testa ids qual deles aconteceu.
   *
   * Envio aberto vira `catalog_images` em `processing`, com o trabalho
   * enfileirado na mesma transacao. Envio ja confirmado e ligado a ESTE item e
   * reaproveitado: o painel manda a galeria inteira a cada salvamento.
   */
  private async imagemDoEnvio(
    tx: TransacaoDoCatalogo,
    itemId: string,
    uploadId: string,
    agora: Instant,
  ): Promise<string> {
    const recusa = (): AppError =>
      problemas.validacao([
        {
          field: 'images',
          code: 'upload_not_usable',
          message: 'Uma das imagens não serve para este produto. Envie-a de novo.',
        },
      ]);

    const envio = await tx.envioDeCatalogo(uploadId);
    if (envio === null || envio.kind !== 'catalog_image' || envio.purpose !== 'store_item') throw recusa();
    if (envio.confirmedAt !== null) {
      if (envio.catalogImageId === null) throw recusa();
      const dono = await tx.itemDaImagem(envio.catalogImageId);
      if (dono !== null && dono !== itemId) throw recusa();
      return envio.catalogImageId;
    }
    if (envio.expiresAt.getTime() <= agora) throw recusa();

    const imagemId = this.deps.ids.uuidv7();
    await tx.confirmarEnvioDeCatalogo({
      imagemId,
      trabalhoId: this.deps.ids.uuidv7(),
      envioId: envio.id,
      purpose: 'store_item',
      agora,
    });
    return imagemId;
  }

  // -------------------------------------------------------------------------
  // Vocabulario de tags (BICHUS-267, ADR-0027 item 16)
  // -------------------------------------------------------------------------

  async listarTags(recorte: {
    q?: string | undefined;
    active?: boolean | undefined;
    page: number;
    limit: number;
  }): Promise<PaginaProjetada<TagProjetada>> {
    const pagina = await this.deps.repositorio.listarTags(recorte);
    return {
      items: pagina.itens.map(projetarTag),
      page: recorte.page,
      limit: recorte.limit,
      total: pagina.total,
    };
  }

  /**
   * A tag nasce uma vez, aqui, com rotulo conferido. Teto de 40 ativas: acima,
   * `400 tag_vocabulary_full`. A contagem e feita sob trava da transacao, entao
   * duas criacoes simultaneas nao passam as duas pela 40a vaga.
   */
  async criarTag(autor: Autor, corpo: CorpoDeTag): Promise<Escrito<TagProjetada>> {
    const conferido = conferirRotulo('label', corpo.label);
    if (conferido.erros.length > 0) throw problemas.validacao(conferido.erros);

    return this.deps.repositorio.emTransacao(async (tx) => {
      if ((await tx.contarTagsAtivasComTrava()) >= TETO_DE_TAGS_ATIVAS) throw vocabularioCheio();
      const criada = await comSlugLivre(() =>
        tx.inserirTag({
          id: this.deps.ids.uuidv7(),
          slug: conferido.slug,
          label: conferido.rotulo,
          agora: this.agora(),
        }),
      );
      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.store_tag.created', 'store_tag', criada.id, { after: retratoDaTag(criada) }),
      );
      return { recurso: projetarTag(criada), etag: comoEtag(criada.version) };
    });
  }

  /** Renomear troca o `slug` junto. Nao ha exclusao: desativar tira do app e mantem a ligacao. */
  async alterarTag(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
    patch: PatchDeTag,
  ): Promise<Escrito<TagProjetada>> {
    const versao = versaoExigida(ifMatch);
    const conferido = patch.label === undefined ? undefined : conferirRotulo('label', patch.label);
    if (conferido !== undefined && conferido.erros.length > 0) throw problemas.validacao(conferido.erros);

    return this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.tagPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();
      if (patch.active === true && !atual.active) {
        if ((await tx.contarTagsAtivasComTrava()) >= TETO_DE_TAGS_ATIVAS) throw vocabularioCheio();
      }
      const mudanca: MudancaDeTag = {
        ...(conferido === undefined ? {} : { label: conferido.rotulo, slug: conferido.slug }),
        ...(patch.active === undefined ? {} : { active: patch.active }),
      };
      const alterada = await comSlugLivre(() => tx.atualizarTag(atual.id, versao, mudanca, this.agora()));
      if (alterada === null) throw versaoMudou();
      await tx.registrarNaTrilha(
        this.evento(
          autor,
          'admin.store_tag.updated',
          'store_tag',
          atual.id,
          diferenca(retratoDaTag(atual), retratoDaTag(alterada)),
        ),
      );
      return { recurso: projetarTag(alterada), etag: comoEtag(alterada.version) };
    });
  }

  // -------------------------------------------------------------------------
  // Imagem de catalogo (BICHUS-267; ADR-0007 e ADR-0027 item 10)
  // -------------------------------------------------------------------------

  /**
   * A politica assinada de envio direto. O backend nunca recebe os bytes.
   *
   * A assinatura e pedida ANTES da transacao, e nao dentro dela: e chamada de
   * rede a um servico externo, e segurar uma conexao do banco esperando por ela
   * e o que esgota o pool num pico. Se a transacao falhar depois, a politica
   * assinada existe e nenhuma linha aponta para ela: o objeto que chegar a ser
   * enviado nao e alcancado por nada, e a politica morre em dez minutos.
   */
  async autorizarEnvioDeCatalogo(autor: Autor, corpo: CorpoDeIntencao): Promise<IntencaoAutorizada> {
    const envio = await this.deps.envios.preparar(corpo.content_type, corpo.byte_size);

    await this.deps.repositorio.emTransacao(async (tx) => {
      await tx.registrarIntencaoDeCatalogo({
        id: envio.uploadId,
        userId: autor.userId,
        purpose: corpo.purpose,
        objectKey: envio.chave,
        declaredType: envio.contentType,
        maxBytes: envio.maxBytes,
        expiresAt: envio.autorizacao.expiraEm,
      });
      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.catalog_image.intent_created', 'upload_intent', envio.uploadId, {
          after: {
            purpose: corpo.purpose,
            content_type: corpo.content_type,
            byte_size: corpo.byte_size,
          },
        }),
      );
    });

    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }
}

function vocabularioCheio(): AppError {
  return problemas.validacao([
    {
      field: 'label',
      code: 'tag_vocabulary_full',
      message: `O vocabulário já tem ${String(TETO_DE_TAGS_ATIVAS)} tags ativas. Desative uma antes.`,
    },
  ]);
}

/** Traduz a violacao de unicidade do adaptador para o 409 do contrato. */
async function comSlugLivre<T>(escrever: () => Promise<T>): Promise<T> {
  try {
    return await escrever();
  } catch (erro) {
    if (erro instanceof SlugOcupado) throw slugOcupado();
    throw erro;
  }
}
