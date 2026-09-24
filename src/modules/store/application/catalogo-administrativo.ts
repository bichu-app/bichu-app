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
  destinosQueDeixariamDeCasar,
  errosDeTexto,
  errosDoDestino,
  estadoDePublicacao,
  hojeUtc,
  lerIfMatch,
  projetarItemAdministrativo,
  projetarParceiro,
  type EstadoDePublicacao,
  type ItemAdministrativo,
  type ItemAdministrativoProjetado,
  type ParceiroAdministrativo,
  type ParceiroProjetado,
} from '../domain/escrita-da-vitrine.js';
import type { CategoriaDaVitrine, EstadoDoPreco } from '../domain/item-da-vitrine.js';
import {
  SlugOcupado,
  type CatalogoAdministrativoRepository,
  type MudancaDeItem,
  type MudancaDeParceiro,
  type OrdemDoPainel,
  type Preco,
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
  readonly slug: string;
  readonly partner_slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: CategoriaDaVitrine;
  readonly target_url: string;
  readonly price?: PrecoDoCorpo;
  readonly image_upload_id?: string;
  readonly sort_order?: number;
}

export interface PatchDeItem {
  readonly slug?: string;
  readonly partner_slug?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly category?: CategoriaDaVitrine;
  readonly target_url?: string;
  readonly price?: PrecoDoCorpo | null;
  readonly image_upload_id?: string | null;
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

/**
 * `image_upload_id` e recusado com 400 enquanto a emenda de imagens nao sai.
 *
 * O contrato declara o campo, e o cliente pediu em 23/09 varias imagens por
 * produto: a arquitetura vai trocar o `image_id` unico do apendice A.2 por uma
 * tabela propria. Aceitar e ignorar mentiria ("salvei a imagem", e nao salvou);
 * gravar no desenho unico criaria o que a emenda vai apagar. A recusa diz o que
 * aconteceu, e some quando a emenda entrar.
 */
function errosDaImagemAdiada(uploadId: string | null | undefined): ProblemFieldError[] {
  if (uploadId === undefined) return [];
  return [
    {
      field: 'image_upload_id',
      code: 'not_available',
      message: 'A imagem do produto ainda não pode ser salva por aqui.',
    },
  ];
}

/** Os campos do parceiro como a trilha os grava. */
function retratoDoParceiro(p: ParceiroAdministrativo): Record<string, unknown> {
  return { slug: p.slug, name: p.name, host: p.host, active: p.active, sort_order: p.sortOrder };
}

/**
 * Os campos do item como a trilha os grava. Sem imagem: o painel nao a escreve
 * nesta versao (ver `errosDaImagemAdiada`).
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
  };
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
    return projetarItemAdministrativo(item, this.agora());
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

      if (patch.host !== undefined && patch.host !== atual.host) {
        const orfaos = destinosQueDeixariamDeCasar(
          await tx.destinosDosItensDoParceiro(atual.id),
          patch.host,
        );
        if (orfaos.length > 0) {
          throw problemas.validacao([
            {
              field: 'host',
              code: 'host_mismatch_items',
              message: `${String(orfaos.length)} item(ns) deste parceiro deixariam de apontar para o host dele.`,
            },
          ]);
        }
      }

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
      ...errosDaImagemAdiada(corpo.image_upload_id),
      ...errosDeTexto('title', corpo.title, 2, 120),
      ...errosDeTexto('summary', corpo.summary, 2, 180),
      ...errosDoPreco(corpo.price, agora),
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

      const criado = await comSlugLivre(() =>
        tx.inserirItem({
          id: this.deps.ids.uuidv7(),
          slug: corpo.slug,
          partnerId: parceiro.id,
          title: corpo.title.trim(),
          summary: corpo.summary.trim(),
          category: corpo.category,
          targetUrl: corpo.target_url,
          preco: corpo.price === undefined ? null : precoDoCorpo(corpo.price),
          sortOrder: corpo.sort_order ?? 0,
          agora,
        }),
      );

      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.store_item.created', 'store_item', criado.id, {
          after: { ...retratoDoItem(criado), publication_state: 'draft' },
        }),
      );
      return this.escritoDoItem(criado);
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
      ...errosDaImagemAdiada(patch.image_upload_id),
      ...(patch.title === undefined ? [] : errosDeTexto('title', patch.title, 2, 120)),
      ...(patch.summary === undefined ? [] : errosDeTexto('summary', patch.summary, 2, 180)),
      ...errosDoPreco(patch.price, agora),
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

      const alterado = await comSlugLivre(() => tx.atualizarItem(atual.id, versao, mudanca, agora));
      if (alterado === null) throw versaoMudou();

      await tx.registrarNaTrilha(
        this.evento(
          autor,
          'admin.store_item.updated',
          'store_item',
          atual.id,
          diferenca(retratoDoItem(atual), retratoDoItem(alterado)),
        ),
      );
      return this.escritoDoItem(alterado);
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

/** Traduz a violacao de unicidade do adaptador para o 409 do contrato. */
async function comSlugLivre<T>(escrever: () => Promise<T>): Promise<T> {
  try {
    return await escrever();
  } catch (erro) {
    if (erro instanceof SlugOcupado) throw slugOcupado();
    throw erro;
  }
}
