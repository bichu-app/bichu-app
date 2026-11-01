import { AppError, problemas } from '../../../shared/http/errors.js';
import { lerIfMatch } from '../../../shared/http/if-match.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import type { AuditAction, AuditEvent } from '../../audit/ports/audit-log.js';
import {
  comoEtag,
  errosDaUf,
  errosDeTexto,
  errosDoCep,
  atividadesDoCorpo,
  errosDoSiteDaEntrada,
  errosDoTelefone,
  MAXIMO_DA_CIDADE,
  MAXIMO_DO_BAIRRO,
  MAXIMO_DO_COMPLEMENTO,
  MAXIMO_DO_LOGRADOURO,
  MAXIMO_DO_NOME,
  MAXIMO_DO_NUMERO,
  MAXIMO_DO_SOBRE,
  MINIMO_DA_CIDADE,
  MINIMO_DO_COMPLEMENTO,
  MINIMO_DO_NOME,
  MINIMO_DO_NUMERO,
  MINIMO_DO_SOBRE,
  ORIGEM_DO_PAINEL,
  planejarCriacao,
  planejarEdicao,
  projetarEntradaAdministrativa,
  retratoDaEntrada,
  TETO_DE_IMAGENS_DA_GALERIA,
  TITULARIDADE_DO_PAINEL,
  type CriacaoDaEntrada,
  type EdicaoDaEntrada,
  type EntradaAdministrativa,
  type EntradaProjetada,
  type ImagemDeGaleriaDoCorpo,
} from '../domain/escrita-do-diretorio.js';
import {
  SlugOcupado,
  type DiretorioAdministrativoRepository,
  type ImagemDaGaleriaNaPosicao,
  type MudancaDaEntrada,
  type OrdemDoDiretorioAdministrativo,
  type RecorteDeEntradas,
  type TransacaoDoDiretorio,
} from '../ports/diretorio-administrativo.js';
import type { TipoDeProfissional } from '../domain/entrada-do-diretorio.js';
import type { StatusDaEntrada } from '../domain/escrita-do-diretorio.js';

export interface Autor {
  /** `admin_accounts.id` (ADR-0027 item 20). */
  readonly adminAccountId: AdminAccountId;
  /** Os 8 primeiros bytes, em hex, do hash da sessao (ADR-0027 item 8). */
  readonly sessao: string;
  readonly ip?: string | undefined;
  readonly correlationId?: string | undefined;
}

export interface Escrito<T> {
  readonly recurso: T;
  readonly etag: string;
}

export interface PaginaProjetada<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface DependenciasDoDiretorioAdministrativo {
  readonly repositorio: DiretorioAdministrativoRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** A URL publica de uma chave de derivada (18/10/2026, com a logo e a foto). */
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

function versaoExigida(ifMatch: string | string[] | undefined): number {
  const lida = lerIfMatch(ifMatch);
  if (lida.tipo === 'ausente') throw faltaVersao();
  if (lida.tipo === 'invalida') throw versaoMudou();
  return lida.versao;
}

async function comSlugLivre<T>(escrever: () => Promise<T>): Promise<T> {
  try {
    return await escrever();
  } catch (erro) {
    if (erro instanceof SlugOcupado) throw slugOcupado();
    throw erro;
  }
}

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

function errosDaForma(campos: {
  display_name?: string | undefined;
  about?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  neighborhood?: string | null | undefined;
  postal_code?: string | null | undefined;
  street?: string | null | undefined;
  street_number?: string | null | undefined;
  complement?: string | null | undefined;
  phone_e164?: string | null | undefined;
  site_url?: string | null | undefined;
}): ProblemFieldError[] {
  const erros: ProblemFieldError[] = [];
  if (campos.display_name !== undefined) {
    erros.push(...errosDeTexto('display_name', campos.display_name, MINIMO_DO_NOME, MAXIMO_DO_NOME));
  }
  if (campos.about !== undefined && campos.about !== null) {
    erros.push(...errosDeTexto('about', campos.about, MINIMO_DO_SOBRE, MAXIMO_DO_SOBRE));
  }
  if (campos.city !== undefined && campos.city !== null) {
    erros.push(...errosDeTexto('city', campos.city, MINIMO_DA_CIDADE, MAXIMO_DA_CIDADE));
  }
  if (campos.state !== undefined && campos.state !== null) {
    erros.push(...errosDaUf('state', campos.state));
  }
  if (campos.neighborhood !== undefined && campos.neighborhood !== null) {
    erros.push(...errosDeTexto('neighborhood', campos.neighborhood, MINIMO_DA_CIDADE, MAXIMO_DO_BAIRRO));
  }
  if (campos.postal_code !== undefined && campos.postal_code !== null) {
    erros.push(...errosDoCep('postal_code', campos.postal_code));
  }
  if (campos.street !== undefined && campos.street !== null) {
    erros.push(...errosDeTexto('street', campos.street, MINIMO_DA_CIDADE, MAXIMO_DO_LOGRADOURO));
  }
  if (campos.street_number !== undefined && campos.street_number !== null) {
    erros.push(
      ...errosDeTexto('street_number', campos.street_number, MINIMO_DO_NUMERO, MAXIMO_DO_NUMERO),
    );
  }
  if (campos.complement !== undefined && campos.complement !== null) {
    erros.push(
      ...errosDeTexto('complement', campos.complement, MINIMO_DO_COMPLEMENTO, MAXIMO_DO_COMPLEMENTO),
    );
  }
  if (campos.phone_e164 !== undefined && campos.phone_e164 !== null) {
    erros.push(...errosDoTelefone('phone_e164', campos.phone_e164));
  }
  if (campos.site_url !== undefined && campos.site_url !== null) {
    erros.push(...errosDoSiteDaEntrada('site_url', campos.site_url));
  }
  return erros;
}

function errosDaGaleria(imagens: readonly ImagemDeGaleriaDoCorpo[] | undefined): ProblemFieldError[] {
  if (imagens === undefined) return [];
  const erros: ProblemFieldError[] = [];
  if (imagens.length > TETO_DE_IMAGENS_DA_GALERIA) {
    erros.push({
      field: 'images',
      code: 'too_many_images',
      message: `Até ${String(TETO_DE_IMAGENS_DA_GALERIA)} imagens.`,
    });
  }
  if (new Set(imagens.map((i) => i.upload_id.toLowerCase())).size !== imagens.length) {
    erros.push({
      field: 'images',
      code: 'duplicate_upload',
      message: 'A mesma imagem apareceu duas vezes.',
    });
  }
  imagens.forEach((imagem, n) => {
    if (imagem.alt_text === undefined) return;
    erros.push(...errosDeTexto(`images[${String(n)}].alt_text`, imagem.alt_text, 2, 150));
  });
  return erros;
}

function aparado(valor: string | null | undefined): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  return valor.trim();
}

export class DiretorioAdministrativo {
  constructor(private readonly deps: DependenciasDoDiretorioAdministrativo) {}

  private agora(): Instant {
    return this.deps.clock.now();
  }

  private evento(
    autor: Autor,
    action: AuditAction,
    resourceId: string,
    corpo: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  ): AuditEvent {
    return {
      actorKind: 'admin',
      actorAdminId: autor.adminAccountId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action,
      resourceKind: 'directory_entry',
      resourceId,
      before: corpo.before,
      after: corpo.after,
      metadata: { surface: 'admin', session: autor.sessao },
    };
  }

  private escrito(entrada: EntradaAdministrativa): Escrito<EntradaProjetada> {
    return {
      recurso: projetarEntradaAdministrativa(entrada, this.deps.urlDeMidia),
      etag: comoEtag(entrada.version),
    };
  }

  async listarEntradas(recorte: {
    q?: string | undefined;
    kind?: TipoDeProfissional | undefined;
    status?: StatusDaEntrada | undefined;
    city?: string | undefined;
    state?: string | undefined;
    sort: OrdemDoDiretorioAdministrativo;
    page: number;
    limit: number;
  }): Promise<PaginaProjetada<EntradaProjetada>> {
    const pagina = await this.deps.repositorio.listarEntradas(recorte satisfies RecorteDeEntradas);
    return {
      items: pagina.itens.map((e) => projetarEntradaAdministrativa(e, this.deps.urlDeMidia)),
      page: recorte.page,
      limit: recorte.limit,
      total: pagina.total,
    };
  }

  async lerEntrada(slug: string): Promise<Escrito<EntradaProjetada>> {
    const entrada = await this.deps.repositorio.entradaPorSlug(slug);
    if (entrada === null) throw problemas.naoEncontrado();
    return this.escrito(entrada);
  }

  /**
   * Cadastra. **A entrada nasce PUBLICADA desde 29/10/2026** (decisao do cliente:
   * *"cobrar os dados no cadastro"*), e cobra `city`, `state` e `phone_e164` no
   * proprio `POST`.
   */
  async criarEntrada(autor: Autor, corpo: CriacaoDaEntrada): Promise<Escrito<EntradaProjetada>> {
    const erros = [...errosDaForma(corpo), ...errosDaGaleria(corpo.images)];
    if (erros.length > 0) throw problemas.validacao(erros);

    const atividades = atividadesDoCorpo('kinds', corpo);
    if ('erros' in atividades) throw problemas.validacao(atividades.erros);
    if (atividades.ok === undefined) {
      throw problemas.validacao([
        { field: 'kinds', code: 'required', message: 'Escolha ao menos uma atividade.' },
      ]);
    }
    const kinds = atividades.ok;

    const planejada = planejarCriacao(corpo);
    if (!planejada.ok) throw problemas.validacao([...planejada.erros]);
    const plano = planejada.plano;

    return this.deps.repositorio.emTransacao(async (tx) => {
      const logoImageId = await this.imagemDoEnvio(tx, 'logo_upload_id', 'directory_logo', corpo.logo_upload_id);
      const photoImageId = await this.imagemDoEnvio(tx, 'photo_upload_id', 'directory_photo', corpo.photo_upload_id);
      const criada = await comSlugLivre(() =>
        tx.inserirEntrada({
          id: this.deps.ids.uuidv7(),
          slug: corpo.slug,
          kinds,
          entityKind: corpo.entity_kind,
          displayName: corpo.display_name.trim(),
          about: aparado(corpo.about) ?? null,
          city: aparado(corpo.city) ?? null,
          state: aparado(corpo.state)?.toUpperCase() ?? null,
          neighborhood: aparado(corpo.neighborhood) ?? null,
          postalCode: aparado(corpo.postal_code) ?? null,
          street: aparado(corpo.street) ?? null,
          streetNumber: aparado(corpo.street_number) ?? null,
          complement: aparado(corpo.complement) ?? null,
          phoneE164: aparado(corpo.phone_e164) ?? null,
          siteUrl: aparado(corpo.site_url) ?? null,
          logoImageId,
          photoImageId,
          status: plano.status,
          gravaMarcoDePublicacao: plano.gravaMarcoDePublicacao,
          source: ORIGEM_DO_PAINEL,
          claimStatus: TITULARIDADE_DO_PAINEL,
          agora: this.agora(),
        }),
      );
      const id = await tx.idPorSlug(criada.slug);
      let completa = criada;
      if (corpo.images !== undefined && id !== null) {
        await this.aplicarGaleria(tx, id, corpo.images);
        completa = await tx.recarregarEntrada(id);
      }
      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.directory_entry.created', id ?? criada.slug, {
          after: retratoDaEntrada(completa),
        }),
      );
      return this.escrito(completa);
    });
  }

  async alterarEntrada(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
    patch: EdicaoDaEntrada,
  ): Promise<Escrito<EntradaProjetada>> {
    const versao = versaoExigida(ifMatch);
    const erros = [...errosDaForma(patch), ...errosDaGaleria(patch.images)];
    if (erros.length > 0) throw problemas.validacao(erros);

    const atividades = atividadesDoCorpo('kinds', patch);
    if ('erros' in atividades) throw problemas.validacao(atividades.erros);
    const kinds = atividades.ok;

    return this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.entradaPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();

      const normalizado: EdicaoDaEntrada = {
        ...patch,
        ...(patch.display_name === undefined ? {} : { display_name: patch.display_name.trim() }),
        ...(patch.about === undefined ? {} : { about: aparado(patch.about) ?? null }),
        ...(patch.city === undefined ? {} : { city: aparado(patch.city) ?? null }),
        ...(patch.state === undefined
          ? {}
          : { state: aparado(patch.state)?.toUpperCase() ?? null }),
        ...(patch.neighborhood === undefined
          ? {}
          : { neighborhood: aparado(patch.neighborhood) ?? null }),
        ...(patch.postal_code === undefined
          ? {}
          : { postal_code: aparado(patch.postal_code) ?? null }),
        ...(patch.street === undefined ? {} : { street: aparado(patch.street) ?? null }),
        ...(patch.street_number === undefined
          ? {}
          : { street_number: aparado(patch.street_number) ?? null }),
        ...(patch.complement === undefined
          ? {}
          : { complement: aparado(patch.complement) ?? null }),
        ...(patch.phone_e164 === undefined ? {} : { phone_e164: aparado(patch.phone_e164) ?? null }),
        ...(patch.site_url === undefined ? {} : { site_url: aparado(patch.site_url) ?? null }),
      };

      const decidido = planejarEdicao(atual, normalizado);
      if (!decidido.ok) throw problemas.validacao([...decidido.erros]);

      const id = await tx.idPorSlug(slug);
      if (id === null) throw problemas.naoEncontrado();

      const mudanca: MudancaDaEntrada = {
        ...(normalizado.slug === undefined ? {} : { slug: normalizado.slug }),
        ...(kinds === undefined ? {} : { kinds }),
        ...(normalizado.entity_kind === undefined
          ? {}
          : { entityKind: normalizado.entity_kind }),
        ...(normalizado.display_name === undefined
          ? {}
          : { displayName: normalizado.display_name }),
        ...(normalizado.about === undefined ? {} : { about: normalizado.about }),
        ...(normalizado.city === undefined ? {} : { city: normalizado.city }),
        ...(normalizado.state === undefined ? {} : { state: normalizado.state }),
        ...(normalizado.neighborhood === undefined
          ? {}
          : { neighborhood: normalizado.neighborhood }),
        ...(normalizado.postal_code === undefined ? {} : { postalCode: normalizado.postal_code }),
        ...(normalizado.street === undefined ? {} : { street: normalizado.street }),
        ...(normalizado.street_number === undefined
          ? {}
          : { streetNumber: normalizado.street_number }),
        ...(normalizado.complement === undefined ? {} : { complement: normalizado.complement }),
        ...(normalizado.phone_e164 === undefined ? {} : { phoneE164: normalizado.phone_e164 }),
        ...(normalizado.site_url === undefined ? {} : { siteUrl: normalizado.site_url }),
        ...(patch.logo_upload_id === undefined
          ? {}
          : {
              logoImageId: await this.imagemDoEnvio(
                tx,
                'logo_upload_id',
                'directory_logo',
                patch.logo_upload_id,
                id,
              ),
            }),
        ...(patch.photo_upload_id === undefined
          ? {}
          : {
              photoImageId: await this.imagemDoEnvio(
                tx,
                'photo_upload_id',
                'directory_photo',
                patch.photo_upload_id,
                id,
              ),
            }),
        ...(normalizado.status === undefined ? {} : { status: normalizado.status }),
        gravaMarcoDePublicacao: decidido.plano.gravaMarcoDePublicacao,
      };

      const alterada = await comSlugLivre(() =>
        tx.atualizarEntrada(id, versao, mudanca, this.agora()),
      );
      if (alterada === null) throw versaoMudou();

      let completa = alterada;
      if (patch.images !== undefined) {
        await this.aplicarGaleria(tx, id, patch.images, id);
        completa = await tx.recarregarEntrada(id);
      }

      await tx.registrarNaTrilha(
        this.evento(
          autor,
          'admin.directory_entry.updated',
          id,
          diferenca(retratoDaEntrada(atual), retratoDaEntrada(completa)),
        ),
      );
      return this.escrito(completa);
    });
  }

  /**
   * O `catalog_images.id` de um `upload_id` da logo ou da foto da entrada
   * (18/10/2026), ou `null` quando o corpo mandou `null` para TIRAR a imagem.
   */
  private async aplicarGaleria(
    tx: TransacaoDoDiretorio,
    entradaId: string,
    imagens: readonly ImagemDeGaleriaDoCorpo[],
    donoPermitido?: string,
  ): Promise<void> {
    const galeria: ImagemDaGaleriaNaPosicao[] = [];
    for (const [position, imagem] of imagens.entries()) {
      const imageId = await this.imagemDaGaleriaDoEnvio(tx, imagem.upload_id, donoPermitido);
      const altText = imagem.alt_text?.trim();
      galeria.push({
        imageId,
        position,
        altText: altText === undefined || altText === '' ? null : altText,
      });
    }
    await tx.substituirImagens(entradaId, galeria);
  }

  /** O `catalog_images.id` de um `upload_id` da GALERIA. */
  private async imagemDaGaleriaDoEnvio(
    tx: TransacaoDoDiretorio,
    uploadId: string,
    donoPermitido?: string,
  ): Promise<string> {
    const recusa = (): never => {
      throw problemas.validacao([
        {
          field: 'images',
          code: 'upload_not_usable',
          message: 'Uma das imagens não serve para esta entrada. Envie-a de novo.',
        },
      ]);
    };

    const envio = await tx.envioDeCatalogo(uploadId);
    if (envio === null || envio.kind !== 'catalog_image' || envio.purpose !== 'directory_gallery') {
      recusa();
    }
    const aberto = envio as NonNullable<typeof envio>;
    if (aberto.confirmedAt !== null) {
      if (aberto.catalogImageId === null) recusa();
      const dono = await tx.entradaDaImagemDaGaleria(aberto.catalogImageId as string);
      if (dono !== null && dono !== donoPermitido) recusa();
      return aberto.catalogImageId as string;
    }
    const agora = this.agora();
    if (aberto.expiresAt.getTime() <= agora) recusa();

    const imagemId = this.deps.ids.uuidv7();
    await tx.confirmarEnvioDeCatalogo({
      imagemId,
      trabalhoId: this.deps.ids.uuidv7(),
      envioId: aberto.id,
      purpose: 'directory_gallery',
      agora,
    });
    return imagemId;
  }

  private async imagemDoEnvio(
    tx: TransacaoDoDiretorio,
    campo: 'logo_upload_id' | 'photo_upload_id',
    proposito: 'directory_logo' | 'directory_photo',
    uploadId: string | null | undefined,
    entradaId?: string,
  ): Promise<string | null> {
    if (uploadId === undefined || uploadId === null) return null;

    const recusa = (): never => {
      throw problemas.validacao([
        {
          field: campo,
          code: 'upload_not_usable',
          message: 'Essa imagem não serve para esta entrada. Envie-a de novo.',
        },
      ]);
    };

    const envio = await tx.envioDeCatalogo(uploadId);
    if (envio === null || envio.kind !== 'catalog_image' || envio.purpose !== proposito) recusa();
    const aberto = envio as NonNullable<typeof envio>;
    if (aberto.confirmedAt !== null) {
      if (aberto.catalogImageId === null) recusa();
      const dono = await tx.entradaDaImagem(aberto.catalogImageId as string);
      if (dono !== null && dono !== entradaId) recusa();
      return aberto.catalogImageId;
    }
    const agora = this.agora();
    if (aberto.expiresAt.getTime() <= agora) recusa();

    const imagemId = this.deps.ids.uuidv7();
    await tx.confirmarEnvioDeCatalogo({
      imagemId,
      trabalhoId: this.deps.ids.uuidv7(),
      envioId: aberto.id,
      purpose: proposito,
      agora,
    });
    return imagemId;
  }

  /** Tira uma avaliacao do ar, com o motivo na trilha. */
  async removerAvaliacao(autor: Autor, ref: string, motivo: string): Promise<void> {
    const aparado = motivo.trim();
    if (aparado.length < 3 || aparado.length > 500) {
      throw problemas.validacao([
        { field: 'reason', code: 'required', message: 'Escreva o motivo da remoção.' },
      ]);
    }

    return this.deps.repositorio.emTransacao(async (tx) => {
      const removida = await tx.removerAvaliacao(ref, aparado, this.agora());
      if (removida === null) throw problemas.naoEncontrado();

      await tx.registrarNaTrilha({
        actorKind: 'admin',
        actorAdminId: autor.adminAccountId,
        actorIp: autor.ip,
        correlationId: autor.correlationId,
        action: 'admin.directory_review.removed',
        resourceKind: 'professional_review',
        resourceId: removida.id,
        before: { status: 'published', rating: removida.notaAntes },
        after: { status: 'removed', reason: aparado },
        metadata: { surface: 'admin', session: autor.sessao },
      });
    });
  }
}
