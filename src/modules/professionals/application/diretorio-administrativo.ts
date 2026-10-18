/**
 * O caso de uso da escrita administrativa do diretorio de `Perto`
 * (BICHUS-189; ADR-0027).
 *
 * ## O que NAO esta aqui, porque ja aconteceu antes
 *
 * **Nenhuma verificacao de autenticacao, de CSRF, de origem nem de papel.** As
 * quatro acontecem na guarda do escopo (`escoparRotasAdministrativas`), uma
 * unica vez, antes de qualquer gancho da rota. **Nenhuma escrita daqui pede
 * reautenticacao por senha**: ela foi removida de toda escrita administrativa em
 * 07/10/2026 por decisao do cliente (ADR-0027 item 23), e reintroduzi-la aqui
 * desfaria aquela decisao em vez de corrigir um esquecimento.
 *
 * ## A ordem de toda escrita, e ela nao e negociavel
 *
 * 1. `If-Match` ANTES de qualquer leitura: escrita sem versao nao chega a
 *    perguntar se o recurso existe (428), e versao que nao e versao e 412.
 * 2. Forma dos campos (tamanho, UF, telefone): 400 com erro POR CAMPO, para a
 *    tela marcar todos de uma vez.
 * 3. Regra de negocio (`planejarEdicao`): completude da publicacao.
 * 4. `UPDATE ... WHERE id = $1 AND version = $2`. Zero linhas e 412.
 * 5. A trilha, na MESMA transacao (ADR-0027 item 8): falha dela desfaz a
 *    escrita.
 *
 * ## 404 e nao 403 (ADR-0021)
 *
 * Entrada inexistente e entrada removida respondem o mesmo 404. O painel nao
 * tem permissao por linha -- quem entrou tem papel `admin` e ve o diretorio
 * inteiro --, entao nao ha um terceiro caso para distinguir.
 */
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
  planejarEdicao,
  projetarEntradaAdministrativa,
  retratoDaEntrada,
  STATUS_INICIAL,
  TITULARIDADE_DO_PAINEL,
  type CriacaoDaEntrada,
  type EdicaoDaEntrada,
  type EntradaAdministrativa,
  type EntradaProjetada,
} from '../domain/escrita-do-diretorio.js';
import {
  SlugOcupado,
  type DiretorioAdministrativoRepository,
  type MudancaDaEntrada,
  type OrdemDoDiretorioAdministrativo,
  type RecorteDeEntradas,
  type TransacaoDoDiretorio,
} from '../ports/diretorio-administrativo.js';
import type { TipoDeProfissional } from '../domain/entrada-do-diretorio.js';
import type { StatusDaEntrada } from '../domain/escrita-do-diretorio.js';

export interface Autor {
  /** `admin_accounts.id` (ADR-0027 item 20). Nunca um `UserId`. */
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
  /**
   * A URL publica de uma chave de derivada (18/10/2026, com a logo e a foto).
   *
   * Injetada como na `Loja` e na `Rede`, e nao montada aqui: o host de midia e
   * `MEDIA_PUBLIC_BASE_URL`, que e configuracao, e um caso de uso que leia
   * variavel de ambiente deixa de ser testavel sem ambiente.
   */
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
 * 428 antes de qualquer leitura, e 412 para o que nao e uma versao.
 *
 * `lerIfMatch` e o leitor tolerante de `shared/http/if-match.ts`, e usa-lo aqui
 * nao e reuso de conveniencia: a borda ACRESCENTA o sufixo da codificacao ao
 * `ETag` da resposta comprimida (`"3-gzip"`), o painel devolve o que recebeu, e
 * uma leitura propria recusaria toda escrita com 412 sem ninguem ter alterado
 * nada. Isso foi medido em hml, nao previsto.
 */
function versaoExigida(ifMatch: string | string[] | undefined): number {
  const lida = lerIfMatch(ifMatch);
  if (lida.tipo === 'ausente') throw faltaVersao();
  if (lida.tipo === 'invalida') throw versaoMudou();
  return lida.versao;
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

/**
 * A forma dos campos que VIERAM, e so deles.
 *
 * Serve a criacao e a edicao com uma funcao so, porque a regra de forma e a
 * mesma nos dois: o que muda e quais campos sao obrigatorios, e isso o schema
 * do contrato ja decidiu. `null` (apagar) nao tem forma a conferir -- a
 * completude de quem esta publicado e decidida por `planejarEdicao`.
 *
 * O texto e medido APARADO porque e aparado que ele vai ser gravado: o contrato
 * mede `minLength` sobre o texto cru, e `"  a "` passaria na borda para morrer
 * no `CHECK` como 500.
 */
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
  // O endereco de rua. Nenhum dos quatro e obrigatorio -- nem no rascunho, nem
  // na publicacao --, e por isso a conferencia aqui e so de FORMA: o que veio
  // tem de caber na coluna. `null` apaga e nao tem forma a conferir.
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
  return erros;
}

/** O texto aparado, ou `null` quando ele apaga o campo. Ausente continua ausente. */
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
   * Cadastra. **A entrada nasce rascunho**, e nao ha parametro que mude isso:
   * publicar e um `PATCH` com `status`, e e ele que confere a completude.
   */
  async criarEntrada(autor: Autor, corpo: CriacaoDaEntrada): Promise<Escrito<EntradaProjetada>> {
    const erros = errosDaForma(corpo);
    if (erros.length > 0) throw problemas.validacao(erros);

    return this.deps.repositorio.emTransacao(async (tx) => {
      // A logo e a foto sao confirmadas ANTES do `INSERT`, na mesma transacao:
      // `imagemDoEnvio` recusa com `400` o envio que nao serve, e recusar antes
      // de inserir evita gravar a entrada e desfaze-la em seguida.
      const logoImageId = await this.imagemDoEnvio(tx, 'logo_upload_id', 'directory_logo', corpo.logo_upload_id);
      const photoImageId = await this.imagemDoEnvio(tx, 'photo_upload_id', 'directory_photo', corpo.photo_upload_id);
      const criada = await comSlugLivre(() =>
        tx.inserirEntrada({
          id: this.deps.ids.uuidv7(),
          slug: corpo.slug,
          kind: corpo.kind,
          entityKind: corpo.entity_kind,
          displayName: corpo.display_name.trim(),
          about: aparado(corpo.about) ?? null,
          city: aparado(corpo.city) ?? null,
          // A UF e gravada em MAIUSCULA, sempre: o `CHECK` so mede o tamanho, e
          // `sp` e `SP` na mesma coluna fariam o filtro por UF da listagem
          // perder metade das linhas sem erro nenhum.
          state: aparado(corpo.state)?.toUpperCase() ?? null,
          neighborhood: aparado(corpo.neighborhood) ?? null,
          postalCode: aparado(corpo.postal_code) ?? null,
          street: aparado(corpo.street) ?? null,
          streetNumber: aparado(corpo.street_number) ?? null,
          complement: aparado(corpo.complement) ?? null,
          phoneE164: aparado(corpo.phone_e164) ?? null,
          logoImageId,
          photoImageId,
          status: STATUS_INICIAL,
          source: ORIGEM_DO_PAINEL,
          claimStatus: TITULARIDADE_DO_PAINEL,
          agora: this.agora(),
        }),
      );
      // O `id` interno vai para a trilha e NUNCA para a resposta: a trilha
      // precisa de uma chave que sobreviva a troca de `slug`.
      const id = await tx.idPorSlug(criada.slug);
      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.directory_entry.created', id ?? criada.slug, {
          after: retratoDaEntrada(criada),
        }),
      );
      return this.escrito(criada);
    });
  }

  async alterarEntrada(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
    patch: EdicaoDaEntrada,
  ): Promise<Escrito<EntradaProjetada>> {
    const versao = versaoExigida(ifMatch);
    const erros = errosDaForma(patch);
    if (erros.length > 0) throw problemas.validacao(erros);

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
      };

      const decidido = planejarEdicao(atual, normalizado);
      if (!decidido.ok) throw problemas.validacao([...decidido.erros]);

      // O `id` interno e lido ANTES do bloco abaixo porque `imagemDoEnvio`
      // precisa dele para recusar a logo que ja esta em OUTRA entrada.
      const id = await tx.idPorSlug(slug);
      if (id === null) throw problemas.naoEncontrado();

      const mudanca: MudancaDaEntrada = {
        ...(normalizado.slug === undefined ? {} : { slug: normalizado.slug }),
        ...(normalizado.kind === undefined ? {} : { kind: normalizado.kind }),
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
        // A logo e a foto: ausente nao mexe, `null` TIRA, `upload_id` novo
        // TROCA. A confirmacao acontece aqui dentro, na transacao da escrita.
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

      await tx.registrarNaTrilha(
        this.evento(
          autor,
          'admin.directory_entry.updated',
          id,
          diferenca(retratoDaEntrada(atual), retratoDaEntrada(alterada)),
        ),
      );
      return this.escrito(alterada);
    });
  }

  /**
   * O `catalog_images.id` de um `upload_id` da logo ou da foto da entrada
   * (18/10/2026), ou `null` quando o corpo mandou `null` para TIRAR a imagem.
   *
   * **COPIA DELIBERADA DE `CatalogoAdministrativo.imagemDoEnvio`**, e nao uma
   * abstracao nova: a diferenca entre os dois e o nome do campo no erro, o
   * proposito exigido e a tabela do dono. Fatorar os tres numa funcao
   * compartilhada trocaria quinze linhas por um parametro de injecao em tres
   * modulos, e a regra que importa -- "o proposito do envio tem de ser o do
   * campo" -- ficaria a um salto de distancia de quem a le.
   *
   * ## Por que a recusa nao diz QUAL dos casos ocorreu
   *
   * Envio inexistente, de outro proposito, vencido, ou ja usado em outra
   * entrada: os quatro saem como o mesmo `400 upload_not_usable`. Distinguir
   * entregaria a quem adivinha `upload_id` um oraculo de "este existe mas e de
   * outra entrada", e e a mesma razao do ADR-0021.
   *
   * ## E ESTA FUNCAO QUE PROTEGE A IMAGEM DA VARREDURA DE VENCIDOS
   *
   * `confirmarEnvioDeCatalogo` grava `confirmed_at`, e e isso que tira a linha
   * da lista de `listarIntencoesVencidas`. Um proposito que chegasse ate o
   * balde sem passar por uma confirmacao seria apagado dez minutos depois, que
   * e exatamente o que aconteceu com a foto do achado -- duas vezes, medido.
   */
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
    // `envio` ja nao e nulo aqui; o TypeScript nao sabe disso por causa do
    // `never` dentro de `recusa`, e a assercao abaixo e o preco de manter a
    // recusa numa funcao so.
    const aberto = envio as NonNullable<typeof envio>;
    if (aberto.confirmedAt !== null) {
      // Envio ja confirmado e REAPROVEITADO quando e desta mesma entrada: o
      // painel manda o formulario inteiro a cada salvamento, e recusar aqui
      // faria a segunda gravacao de um telefone perder a logo.
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

  /**
   * Tira uma avaliacao do ar, com o motivo na trilha.
   *
   * **O motivo e obrigatorio, e e a diferenca entre moderacao e arbitrio.**
   * Quem remove escreve por que, e isso fica legivel para quem auditar depois.
   * O contrato ja o exige (`minLength: 3`); aqui ele e aparado e reconferido,
   * porque 500 espacos passam por `minLength`.
   *
   * **`resourceKind` e `professional_review`, nao `directory_entry`**, e por
   * isso este metodo nao usa `this.evento()`: o alvo e a avaliacao, e uma
   * investigacao que procurasse pela entrada do diretorio nao acharia a
   * remocao.
   *
   * O `before`/`after` carrega a NOTA e nao o texto. A nota explica o efeito na
   * media -- que e o que muda na tela de todo mundo -- e o texto de uma
   * avaliacao removida por ser ofensivo nao precisa ser recopiado para a
   * trilha, onde ficaria sem o mesmo controle de acesso.
   */
  async removerAvaliacao(autor: Autor, ref: string, motivo: string): Promise<void> {
    const aparado = motivo.trim();
    if (aparado.length < 3 || aparado.length > 500) {
      throw problemas.validacao([
        { field: 'reason', code: 'required', message: 'Escreva o motivo da remoção.' },
      ]);
    }

    return this.deps.repositorio.emTransacao(async (tx) => {
      const removida = await tx.removerAvaliacao(ref, aparado, this.agora());
      // 404 e nao 403, e tambem quando a avaliacao JA estava removida: o `ref`
      // de algo que nao esta no ar nao tem alvo, e o motivo da primeira remocao
      // e de quem auditar -- sobrescreve-lo apagaria a decisao que valeu.
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
