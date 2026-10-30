/**
 * As tres escritas do encontro da comunidade (ADR-0025 emenda 3): criar, editar o
 * proprio e cancelar o proprio.
 */
import { AppError, problemas } from '../../../shared/http/errors.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import { lerIfMatch } from '../../../shared/http/if-match.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import { comoData } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { AuditAction, AuditLog } from '../../audit/ports/audit-log.js';
import {
  atingiuTetoDeEncontros,
  bloqueiosParaCriarEncontro,
  errosDeTextoDeUsuario,
  errosDoNomeDoLugar,
  type CapaDoCorpo,
  type CorpoDoCancelamentoDaComunidade,
  type CorpoDoEncontroDaComunidade,
  type LugarDaComunidade,
  type MudancaDoEncontroDaComunidade,
  type PatchDoEncontroDaComunidade,
} from '../domain/encontro-da-comunidade.js';
import {
  errosDasObservacoes,
  errosDoHorario,
  FUSO_PADRAO,
  comoEtag,
  PORTES,
} from '../domain/escrita-do-encontro.js';
import { projetarEncontro, type EncontroPublicoProjetado } from '../domain/encontro-da-rede.js';
import { TETO_DA_DESCRICAO } from './rede-administrativa.js';
import type {
  EncontroDoAutor,
  NetworkRepository,
  TransacaoDaComunidade,
} from '../ports/network-repository.js';

/** Quem escreve, e o contexto da requisicao que a trilha guarda. */
export interface AutorDoEncontro {
  readonly userId: UserId;
  readonly correlationId: string;
  /** Em claro. A porta da trilha o transforma em HMAC (SEC-010); este arquivo nao. */
  readonly ip: string | undefined;
}

export interface DependenciasDoEncontroDaComunidade {
  readonly rede: NetworkRepository;
  readonly trilha: AuditLog;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** O encontro publico mais o `ETag` da versao que acabou de ser gravada. */
export interface EncontroEscrito {
  readonly recurso: EncontroPublicoProjetado;
  readonly etag: string;
}

const TETO_DO_TITULO = 120;
const TETO_DO_TEXTO_ALTERNATIVO = 150;

function recusa(field: string, code: string, message: string): AppError {
  return problemas.validacao([{ field, code, message }]);
}

/** O `If-Match`, pelo leitor TOLERANTE de `shared/http/if-match.ts`. */
function versaoExigida(ifMatch: string | string[] | undefined): number {
  const lida = lerIfMatch(ifMatch);
  if (lida.tipo === 'ausente') {
    throw new AppError('precondition-required', 'Falta a versão que você leu');
  }
  if (lida.tipo === 'invalida') throw versaoMudou();
  return lida.versao;
}

function versaoMudou(): AppError {
  return new AppError('precondition-failed', 'Alguém alterou isto antes de você', {
    detail: 'Recarregue para ver a versão atual antes de salvar.',
  });
}

/** A data vinda como ISO. A conversao e aqui, na aplicacao, e nao no dominio. */
function comoDataDoCorpo(texto: string, campo: string): Date {
  const instante = Date.parse(texto);
  if (Number.isNaN(instante)) {
    throw problemas.validacao([{ field: campo, code: 'invalid_date', message: 'Data e hora inválidas.' }]);
  }
  return comoData(instante as Instant);
}

/** Os portes aceitos, contra a lista fechada do contrato. */
function errosDosPortes(portes: readonly string[] | undefined): ProblemFieldError[] {
  if (portes === undefined) return [];
  const validos = portes.every((p) => (PORTES as readonly string[]).includes(p));
  if (portes.length === 0 || !validos || new Set(portes).size !== portes.length) {
    return [{ field: 'accepted_sizes', code: 'sizes_invalid', message: 'De um a quatro portes, sem repetir.' }];
  }
  return [];
}

/** Os tres rotulos do lugar. */
function errosDoLugar(lugar: LugarDaComunidade): ProblemFieldError[] {
  return [
    ...errosDoNomeDoLugar('place.place_name', lugar.place_name),
    ...errosDeTextoDeUsuario('place.neighborhood', lugar.neighborhood, 2, 60),
    ...errosDeTextoDeUsuario('place.city', lugar.city, 2, 60),
  ];
}

function errosDaCapa(capa: CapaDoCorpo | null | undefined): ProblemFieldError[] {
  if (capa === undefined || capa === null) return [];
  if (capa.alt_text === undefined) return [];
  return errosDeTextoDeUsuario('cover_image.alt_text', capa.alt_text, 2, TETO_DO_TEXTO_ALTERNATIVO);
}

function lugarGravado(lugar: LugarDaComunidade) {
  return {
    placeName: lugar.place_name.trim(),
    neighborhood: lugar.neighborhood.trim(),
    city: lugar.city.trim(),
    state: lugar.state,
    ponto: null,
  };
}

export class EncontroDaComunidade {
  constructor(private readonly deps: DependenciasDoEncontroDaComunidade) {}

  async criar(autor: AutorDoEncontro, corpo: CorpoDoEncontroDaComunidade): Promise<EncontroEscrito> {
    const agora = this.deps.clock.now();
    const estado = await this.deps.rede.estadoParaCriarEncontro(autor.userId, agora);
    if (atingiuTetoDeEncontros(estado)) throw problemas.tetoDeEncontrosDaComunidade();
    if (bloqueiosParaCriarEncontro(estado).length > 0) {
      throw problemas.canalDeContatoNaoVerificadoParaEncontro();
    }

    const startsAt = comoDataDoCorpo(corpo.starts_at, 'starts_at');
    const endsAt = corpo.ends_at === undefined ? null : comoDataDoCorpo(corpo.ends_at, 'ends_at');
    const timeZone = corpo.time_zone ?? FUSO_PADRAO;
    const erros: ProblemFieldError[] = [
      ...errosDeTextoDeUsuario('title', corpo.title, 2, TETO_DO_TITULO),
      ...errosDeTextoDeUsuario('summary', corpo.summary, 2, TETO_DA_DESCRICAO),
      ...errosDoLugar(corpo.place),
      ...errosDoHorario(startsAt, endsAt, timeZone, agora),
      ...errosDosPortes(corpo.accepted_sizes),
      ...(corpo.notes === undefined ? [] : errosDasObservacoes('notes', corpo.notes)),
      ...errosDaCapa(corpo.cover_image),
    ];
    if (erros.length > 0) throw problemas.validacao(erros);

    const id = this.deps.ids.uuidv7();
    const slug = await this.deps.rede.emTransacao(async (tx) => {
      const gravado = await tx.inserirEncontro({
        id,
        autor: autor.userId,
        title: corpo.title.trim(),
        summary: corpo.summary.trim(),
        lugar: lugarGravado(corpo.place),
        startsAt,
        endsAt,
        timeZone,
        idadeDosCaes: corpo.dog_age ?? 'any',
        vacinacaoExigida: corpo.vaccination_required ?? true,
        areaCercada: corpo.fenced_off_leash_area ?? false,
        observacoes: corpo.notes === undefined ? null : corpo.notes.trim(),
        portes: corpo.accepted_sizes ?? PORTES,
        estrutura: corpo.amenities ?? [],
        paraLevar: corpo.bring_items ?? [],
        capa:
          corpo.cover_image === undefined
            ? null
            : {
                uploadId: corpo.cover_image.upload_id,
                altText: corpo.cover_image.alt_text?.trim() ?? null,
              },
        agora,
      });
      await this.aplicarCapa(tx, id, autor, corpo.cover_image ?? undefined, agora);
      return gravado;
    });

    await this.registrar(autor, 'network_event.submitted', id, {
      slug,
      title: corpo.title.trim(),
      city: corpo.place.city.trim(),
      neighborhood: corpo.place.neighborhood.trim(),
      starts_at: startsAt.toISOString(),
      time_zone: timeZone,
      publication_status: 'published',
      origin: 'community',
      has_cover: corpo.cover_image !== undefined,
    });
    return this.lerDepoisDeEscrever(slug, 1);
  }

  async editar(
    autor: AutorDoEncontro,
    slug: string,
    ifMatch: string | string[] | undefined,
    patch: PatchDoEncontroDaComunidade,
  ): Promise<EncontroEscrito> {
    const versao = versaoExigida(ifMatch);
    const agora = this.deps.clock.now();

    const versaoNova = await this.deps.rede.emTransacao(async (tx) => {
      const atual = await this.meuEncontro(tx, slug, autor, agora);
      const startsAt = patch.starts_at === undefined ? undefined : comoDataDoCorpo(patch.starts_at, 'starts_at');
      const endsAt =
        patch.ends_at === undefined || patch.ends_at === null
          ? patch.ends_at
          : comoDataDoCorpo(patch.ends_at, 'ends_at');
      const timeZone = patch.time_zone;
      const erros: ProblemFieldError[] = [
        ...(patch.title === undefined ? [] : errosDeTextoDeUsuario('title', patch.title, 2, TETO_DO_TITULO)),
        ...(patch.summary === undefined
          ? []
          : errosDeTextoDeUsuario('summary', patch.summary, 2, TETO_DA_DESCRICAO)),
        ...(patch.place === undefined ? [] : errosDoLugar(patch.place)),
        ...errosDosPortes(patch.accepted_sizes),
        ...(patch.notes === undefined || patch.notes === null
          ? []
          : errosDasObservacoes('notes', patch.notes)),
        ...errosDaCapa(patch.cover_image),
      ];
      if (startsAt !== undefined || endsAt !== undefined || timeZone !== undefined) {
        erros.push(
          ...errosDoHorario(
            startsAt ?? comoData(atual.startsAt),
            endsAt === undefined ? (atual.endsAt === null ? null : comoData(atual.endsAt)) : endsAt,
            timeZone ?? FUSO_PADRAO,
            agora,
          ),
        );
      }
      if (erros.length > 0) throw problemas.validacao(erros);

      const mudanca: MudancaDoEncontroDaComunidade = {
        ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
        ...(patch.summary === undefined ? {} : { summary: patch.summary.trim() }),
        ...(patch.place === undefined ? {} : { lugar: lugarGravado(patch.place) }),
        ...(startsAt === undefined ? {} : { startsAt }),
        ...(endsAt === undefined ? {} : { endsAt }),
        ...(timeZone === undefined ? {} : { timeZone }),
        ...(patch.dog_age === undefined ? {} : { idadeDosCaes: patch.dog_age }),
        ...(patch.vaccination_required === undefined
          ? {}
          : { vacinacaoExigida: patch.vaccination_required }),
        ...(patch.fenced_off_leash_area === undefined
          ? {}
          : { areaCercada: patch.fenced_off_leash_area }),
        ...(patch.notes === undefined
          ? {}
          : { observacoes: patch.notes === null ? null : patch.notes.trim() }),
      };
      const nova = await tx.alterarEncontro(atual.id, versao, mudanca, agora);
      if (nova === null) throw versaoMudou();
      if (patch.accepted_sizes !== undefined) await tx.substituirPortes(atual.id, patch.accepted_sizes);
      if (patch.amenities !== undefined) await tx.substituirEstrutura(atual.id, patch.amenities);
      if (patch.bring_items !== undefined) await tx.substituirParaLevar(atual.id, patch.bring_items);
      if (patch.cover_image === null) await tx.definirCapa(atual.id, null);
      else await this.aplicarCapa(tx, atual.id, autor, patch.cover_image, agora);
      return { versao: nova, id: atual.id };
    });

    await this.registrar(autor, 'network_event.updated', versaoNova.id, {
      slug,
      fields: Object.keys(patch).sort(),
      version: versaoNova.versao,
    });
    return this.lerDepoisDeEscrever(slug, versaoNova.versao);
  }

  async cancelar(
    autor: AutorDoEncontro,
    slug: string,
    ifMatch: string | string[] | undefined,
    corpo: CorpoDoCancelamentoDaComunidade,
  ): Promise<EncontroEscrito> {
    const versao = versaoExigida(ifMatch);
    const agora = this.deps.clock.now();
    const erros = errosDeTextoDeUsuario('note', corpo.note, 2, 280);
    if (erros.length > 0) throw problemas.validacao(erros);

    const cancelado = await this.deps.rede.emTransacao(async (tx) => {
      const atual = await this.meuEncontro(tx, slug, autor, agora);
      if (atual.publicacao !== 'published') {
        throw recusa('publication_status', 'event_not_published', 'Só encontro publicado pode ser cancelado.');
      }
      const nova = await tx.cancelarEncontro(atual.id, versao, corpo.note.trim(), agora);
      if (nova === null) throw versaoMudou();
      return { id: atual.id, versao: nova };
    });

    await this.registrar(autor, 'network_event.cancelled', cancelado.id, {
      slug,
      publication_status: 'cancelled',
      version: cancelado.versao,
    });
    return this.lerDepoisDeEscrever(slug, cancelado.versao);
  }

  /** O encontro da propria conta, ou 404. */
  private async meuEncontro(
    tx: TransacaoDaComunidade,
    slug: string,
    autor: AutorDoEncontro,
    agora: Instant,
  ): Promise<EncontroDoAutor> {
    const atual = await tx.encontroDoAutor(slug, autor.userId);
    if (atual === undefined) throw problemas.naoEncontrado();
    if ((atual.endsAt ?? atual.startsAt) <= agora) {
      throw recusa('eventSlug', 'event_ended', 'O encontro já terminou.');
    }
    return atual;
  }

  /** Confirma o envio da capa e a poe na posicao 0. */
  private async aplicarCapa(
    tx: TransacaoDaComunidade,
    eventoId: string,
    autor: AutorDoEncontro,
    capa: CapaDoCorpo | undefined,
    agora: Instant,
  ): Promise<void> {
    if (capa === undefined) return;
    const imagemId = await tx.capaDoEnvio({
      uploadId: capa.upload_id,
      chamador: autor.userId,
      eventoId,
      agora,
    });
    if (imagemId === undefined) {
      throw recusa('cover_image', 'upload_not_usable', 'Essa imagem não serve para este encontro. Envie-a de novo.');
    }
    await tx.definirCapa(eventoId, { imagemId, altText: capa.alt_text?.trim() ?? null });
  }

  /**
   * A resposta sai de uma LEITURA PUBLICA depois do `COMMIT`, e nao de um montador
   * proprio: o que o app recebe aqui e byte a byte o que `getNetworkEvent` devolve,
   * e um campo novo na leitura publica nao precisa ser lembrado em dois lugares.
   */
  private async lerDepoisDeEscrever(slug: string, versao: number): Promise<EncontroEscrito> {
    const agora = this.deps.clock.now();
    const encontro = await this.deps.rede.buscarEncontro(slug);
    if (encontro === undefined) throw problemas.naoEncontrado();
    return {
      recurso: projetarEncontro(encontro, agora) as EncontroPublicoProjetado,
      etag: comoEtag(versao),
    };
  }

  private async registrar(
    autor: AutorDoEncontro,
    action: AuditAction,
    eventoId: string,
    depois: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: autor.userId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action,
      resourceKind: 'network_event',
      resourceId: eventoId,
      after: depois,
    });
  }
}
