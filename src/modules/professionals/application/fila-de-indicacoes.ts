/** O caso de uso da FILA DE REVISAO das indicacoes do `Perto` (18/10/2026). */
import { problemas } from '../../../shared/http/errors.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { AuditAction, AuditEvent } from '../../audit/ports/audit-log.js';
import {
  comoEtag,
  faltasParaPublicar,
  ORIGEM_DO_PAINEL,
  projetarEntradaAdministrativa,
  STATUS_INICIAL,
  TITULARIDADE_DO_PAINEL,
  type EntradaProjetada,
  type StatusDaEntrada,
} from '../domain/escrita-do-diretorio.js';
import {
  erroSeJaDecidida,
  MAXIMO_DO_MOTIVO,
  MINIMO_DO_MOTIVO,
  projetarIndicacao,
  siteDaIndicacao,
  telefoneDaIndicacao,
  type IndicacaoNaFila,
  type IndicacaoProjetada,
  type RevisaoDaIndicacao,
} from '../domain/fila-de-indicacoes.js';
import type { ConferenciasDeTexto } from '../ports/conferencias-de-texto.js';
import type { TransacaoDoDiretorio } from '../ports/diretorio-administrativo.js';
import type { FilaDeIndicacoesRepository, TransacaoDaFila } from '../ports/fila-de-indicacoes.js';
import type { Autor, PaginaProjetada } from './diretorio-administrativo.js';

/** O corpo de `approveAdminDirectorySuggestion`. */
export interface AprovacaoDaIndicacao {
  readonly slug: string;
  readonly phone_e164?: string | undefined;
}

/** O corpo de `declineAdminDirectorySuggestion`. */
export interface RecusaDaIndicacao {
  readonly reason: string;
}

/** `AdminDirectorySuggestionApproved` do contrato. */
export interface IndicacaoAprovada {
  readonly suggestion: IndicacaoProjetada;
  readonly entry: EntradaProjetada;
  readonly entry_created: boolean;
  /** O `ETag` da entrada, para o painel poder editar sem uma segunda leitura. */
  readonly etagDaEntrada: string;
}

/**
 * `AdminDirectorySuggestionPage` do contrato, menos os campos que a rota
 * acrescenta.
 */
export interface PaginaDaFilaProjetada extends PaginaProjetada<IndicacaoProjetada> {
  readonly pending_total: number;
}

export interface DependenciasDaFilaDeIndicacoes {
  readonly repositorio: FilaDeIndicacoesRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Ver `ports/conferencias-de-texto.ts`: o detector de D59 nao mora neste modulo. */
  readonly conferencias: ConferenciasDeTexto;
  /**
   * A URL publica de uma chave de derivada, injetada como em
   * `DiretorioAdministrativo`.
   */
  readonly urlDeMidia: (chave: string) => string;
}

export class FilaDeIndicacoes {
  constructor(private readonly deps: DependenciasDaFilaDeIndicacoes) {}

  private agora(): Instant {
    return this.deps.clock.now();
  }

  /** O evento da trilha. */
  private evento(
    autor: Autor,
    action: AuditAction,
    ref: string,
    corpo: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  ): AuditEvent {
    return {
      actorKind: 'admin',
      actorAdminId: autor.adminAccountId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action,
      resourceKind: 'directory_suggestion',
      resourceId: ref,
      before: corpo.before,
      after: corpo.after,
      metadata: { surface: 'admin', session: autor.sessao },
    };
  }

  /**
   * O retrato da indicacao para a trilha: o estado e a decisao, nunca o texto de
   * terceiro.
   */
  private static retrato(i: IndicacaoNaFila): Record<string, unknown> {
    return {
      review_status: i.reviewStatus,
      decided_at: i.decidedAt === null ? null : i.decidedAt.toISOString(),
      decline_reason: i.declineReason,
      entry_slug: i.entradaSlug,
    };
  }

  async listar(recorte: {
    reviewStatus?: RevisaoDaIndicacao | undefined;
    page: number;
    limit: number;
  }): Promise<PaginaDaFilaProjetada> {
    const pagina = await this.deps.repositorio.listar(recorte);
    return {
      items: pagina.itens.map(projetarIndicacao),
      page: recorte.page,
      limit: recorte.limit,
      total: pagina.total,
      pending_total: pagina.pendentes,
    };
  }

  async ler(ref: string): Promise<IndicacaoProjetada> {
    const indicacao = await this.deps.repositorio.indicacaoPorRef(ref);
    if (indicacao === null) throw problemas.naoEncontrado();
    return projetarIndicacao(indicacao);
  }

  async aprovar(autor: Autor, ref: string, corpo: AprovacaoDaIndicacao): Promise<IndicacaoAprovada> {
    const telefoneDoCorpo = corpo.phone_e164?.trim();

    return this.deps.repositorio.emTransacao(async (tx) => {
      const indicacao = await tx.indicacaoPorRef(ref);
      if (indicacao === null) throw problemas.naoEncontrado();
      const jaDecidida = erroSeJaDecidida(indicacao);
      if (jaDecidida !== null) throw problemas.validacao([jaDecidida]);

      const existente = await tx.entradaPorSlug(corpo.slug);

      const entrada =
        existente === null
          ? await FilaDeIndicacoes.criarEntradaDaIndicacao(
              tx,
              indicacao,
              corpo.slug,
              telefoneDoCorpo,
              this.deps.ids.uuidv7(),
              this.agora(),
            )
          : existente;

      const aprovada = await tx.marcarAprovada(ref, corpo.slug, this.agora());

      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.directory_suggestion.approved', ref, {
          before: FilaDeIndicacoes.retrato(indicacao),
          after: {
            ...FilaDeIndicacoes.retrato(aprovada),
            entry_created: existente === null,
            entry_status: entrada.status,
          },
        }),
      );

      return {
        suggestion: projetarIndicacao(aprovada),
        entry: projetarEntradaAdministrativa(entrada, this.deps.urlDeMidia),
        entry_created: existente === null,
        etagDaEntrada: comoEtag(entrada.version),
      };
    });
  }

  /** A entrada, pelo caminho do diretorio. */
  private static async criarEntradaDaIndicacao(
    tx: TransacaoDoDiretorio,
    indicacao: IndicacaoNaFila,
    slug: string,
    telefoneDoCorpo: string | undefined,
    id: string,
    agora: Instant,
  ) {
    const telefone =
      telefoneDoCorpo !== undefined && telefoneDoCorpo !== ''
        ? telefoneDoCorpo
        : telefoneDaIndicacao(indicacao);

    const faltas = faltasParaPublicar({
      slug,
      city: indicacao.city,
      state: indicacao.state.toUpperCase(),
      phoneE164: telefone,
    });
    const status: StatusDaEntrada = faltas.length === 0 ? 'published' : STATUS_INICIAL;

    const criada = await tx.inserirEntrada({
      id,
      slug,
      kinds: [indicacao.kind],
      entityKind: indicacao.entityKind,
      displayName: indicacao.displayName,
      about: null,
      city: indicacao.city,
      state: indicacao.state.toUpperCase(),
      neighborhood: indicacao.neighborhood,
      postalCode: null,
      street: null,
      streetNumber: null,
      complement: null,
      logoImageId: null,
      photoImageId: null,
      phoneE164: telefone,
      siteUrl: siteDaIndicacao(indicacao),
      status,
      source: ORIGEM_DO_PAINEL,
      claimStatus: TITULARIDADE_DO_PAINEL,
      agora,
    });

    if (status !== 'published') return criada;

    const publicada = await tx.atualizarEntrada(
      id,
      criada.version,
      { status: 'published', gravaMarcoDePublicacao: true },
      agora,
    );
    return publicada ?? criada;
  }

  async recusar(autor: Autor, ref: string, corpo: RecusaDaIndicacao): Promise<IndicacaoProjetada> {
    const erros: ProblemFieldError[] = this.deps.conferencias.errosDeTextoDeUsuario(
      'reason',
      corpo.reason,
      MINIMO_DO_MOTIVO,
      MAXIMO_DO_MOTIVO,
    );
    if (erros.length > 0) throw problemas.validacao(erros);

    return this.deps.repositorio.emTransacao(async (tx: TransacaoDaFila) => {
      const indicacao = await tx.indicacaoPorRef(ref);
      if (indicacao === null) throw problemas.naoEncontrado();
      const jaDecidida = erroSeJaDecidida(indicacao);
      if (jaDecidida !== null) throw problemas.validacao([jaDecidida]);

      const recusada = await tx.marcarRecusada(ref, corpo.reason.trim(), this.agora());

      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.directory_suggestion.declined', ref, {
          before: FilaDeIndicacoes.retrato(indicacao),
          after: FilaDeIndicacoes.retrato(recusada),
        }),
      );
      return projetarIndicacao(recusada);
    });
  }
}
